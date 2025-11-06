import { storage } from "./storage";
import type { ApiToken } from "@shared/schema";

// Queue to store videos pending generation
interface QueuedVideo {
  videoId: string;
  prompt: string;
  aspectRatio: string;
  sceneNumber: number;
  userId: string;
}

const bulkQueue: QueuedVideo[] = [];
let isProcessing = false;
const DELAY_BETWEEN_REQUESTS_MS = 20000; // 20 seconds
const MAX_RETRIES = 2; // Max retries per video
const RETRY_DELAY_MS = 10000; // 10 seconds between retries

/**
 * Add videos to the bulk generation queue
 */
export function addToQueue(videos: QueuedVideo[]) {
  bulkQueue.push(...videos);
  console.log(`[Bulk Queue] Added ${videos.length} videos to queue. Total in queue: ${bulkQueue.length}`);
  
  // Start processing if not already running
  if (!isProcessing) {
    processQueue();
  }
}

/**
 * Process a single video from the batch
 */
async function processSingleVideo(video: QueuedVideo): Promise<void> {
  try {
    console.log(`[Bulk Queue] Processing video ${video.sceneNumber} (ID: ${video.videoId})`);
    
    // Get API token using round-robin rotation (wraps around for any number of videos)
    let apiKey: string | undefined;
    let rotationToken: ApiToken | undefined;
    
    rotationToken = await storage.getNextRotationToken();
    
    if (rotationToken) {
      apiKey = rotationToken.token;
      console.log(`[Bulk Queue] Using token ${rotationToken.label} (ID: ${rotationToken.id}) for video ${video.sceneNumber}`);
      await storage.updateTokenUsage(rotationToken.id);
    }
    
    if (!apiKey) {
      apiKey = process.env.VEO3_API_KEY;
      console.log('[Bulk Queue] Fallback: Using environment variable VEO3_API_KEY');
    }

    if (!apiKey) {
      const errorMessage = `No API key available for video generation (scene ${video.sceneNumber})`;
      console.error(`[Bulk Queue] ❌ CRITICAL: ${errorMessage}`);
      await storage.updateVideoHistoryStatus(video.videoId, video.userId, 'failed', undefined, errorMessage);
      return;
    }

    // Send VEO generation request
    const veoProjectId = process.env.VEO3_PROJECT_ID || "06ad4933-483d-4ef6-b1d9-7a8bc21219cb";
    const sceneId = `bulk-${video.videoId}-${Date.now()}`;
    const seed = Math.floor(Math.random() * 100000);

    const payload = {
      clientContext: {
        projectId: veoProjectId,
        tool: "PINHOLE",
        userPaygateTier: "PAYGATE_TIER_TWO"
      },
      requests: [{
        aspectRatio: video.aspectRatio === "portrait" ? "VIDEO_ASPECT_RATIO_PORTRAIT" : "VIDEO_ASPECT_RATIO_LANDSCAPE",
        seed: seed,
        textInput: {
          prompt: video.prompt
        },
        videoModelKey: video.aspectRatio === "portrait" ? "veo_3_1_t2v_fast_portrait_ultra" : "veo_3_1_t2v_fast_ultra",
        metadata: {
          sceneId: sceneId
        }
      }]
    };

    // Add timeout to fetch request (90 seconds - VEO API can be slow to accept requests)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    
    let response;
    let data;
    
    try {
      response = await fetch('https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoText', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      data = await response.json();
    } catch (fetchError: any) {
      clearTimeout(timeout);
      if (fetchError.name === 'AbortError') {
        const errorMessage = `Request timeout after 90 seconds - VEO API not responding`;
        console.error('[Bulk Queue] Request timeout:', fetchError);
        await storage.updateVideoHistoryStatus(video.videoId, video.userId, 'failed', undefined, errorMessage);
      } else {
        const errorMessage = `Network error: ${fetchError.message}`;
        console.error('[Bulk Queue] Network error:', fetchError);
        await storage.updateVideoHistoryStatus(video.videoId, video.userId, 'failed', undefined, errorMessage);
      }
      
      if (rotationToken) {
        storage.recordTokenError(rotationToken.id);
      }
      return;
    }

    if (!response.ok) {
      const errorMessage = `VEO API error (${response.status}): ${JSON.stringify(data).substring(0, 200)}`;
      console.error('[Bulk Queue] VEO API error:', data);
      await storage.updateVideoHistoryStatus(video.videoId, video.userId, 'failed', undefined, errorMessage);
      
      if (rotationToken) {
        storage.recordTokenError(rotationToken.id);
      }
      return;
    }

    if (!data.operations || data.operations.length === 0) {
      const errorMessage = 'No operations returned from VEO API - possible API issue';
      console.error('[Bulk Queue] No operations returned from VEO API');
      await storage.updateVideoHistoryStatus(video.videoId, video.userId, 'failed', undefined, errorMessage);
      
      if (rotationToken) {
        storage.recordTokenError(rotationToken.id);
      }
      return;
    }

    const operation = data.operations[0];
    const operationName = operation.operation.name;

    console.log(`[Bulk Queue] Started generation for video ${video.sceneNumber} - Operation: ${operationName}`);

    // Update history with token ID if available
    if (rotationToken) {
      try {
        await storage.updateVideoHistoryFields(video.videoId, { tokenUsed: rotationToken.id });
      } catch (err) {
        console.error('[Bulk Queue] Failed to update video history with token ID:', err);
      }
    }

    // Start background polling for this video
    startBackgroundPolling(video.videoId, video.userId, operationName, sceneId, apiKey, rotationToken);

  } catch (error) {
    const errorMessage = `Error processing video: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`[Bulk Queue] Error processing video ${video.sceneNumber}:`, error);
    await storage.updateVideoHistoryStatus(video.videoId, video.userId, 'failed', undefined, errorMessage);
  }
}

/**
 * Process the queue in the background with batch processing
 */
async function processQueue() {
  if (isProcessing) {
    console.log('[Bulk Queue] Already processing queue');
    return;
  }

  isProcessing = true;
  console.log('[Bulk Queue] Started processing queue');

  // Fetch batch settings from database
  let videosPerBatch = 10;
  let batchDelaySeconds = 20;
  
  try {
    const settings = await storage.getTokenSettings();
    if (settings) {
      videosPerBatch = parseInt(settings.videosPerBatch, 10) || 5;
      batchDelaySeconds = parseInt(settings.batchDelaySeconds, 10) || 20;
      console.log(`[Bulk Queue] Using batch settings: ${videosPerBatch} videos per batch, ${batchDelaySeconds}s delay`);
    }
  } catch (error) {
    console.error('[Bulk Queue] Error fetching batch settings, using defaults:', error);
  }

  while (bulkQueue.length > 0) {
    // Get N videos from queue for this batch
    const batchSize = Math.min(videosPerBatch, bulkQueue.length);
    const batch: QueuedVideo[] = [];
    
    for (let i = 0; i < batchSize; i++) {
      const video = bulkQueue.shift();
      if (video) {
        batch.push(video);
      }
    }

    if (batch.length === 0) {
      continue;
    }

    console.log(`[Bulk Queue] Processing batch of ${batch.length} videos. Remaining in queue: ${bulkQueue.length}`);

    // Process all videos in batch in parallel
    await Promise.all(batch.map(video => processSingleVideo(video)));

    console.log(`[Bulk Queue] Batch of ${batch.length} videos submitted`);

    // Wait for batchDelaySeconds before processing next batch
    if (bulkQueue.length > 0) {
      console.log(`[Bulk Queue] Waiting ${batchDelaySeconds} seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, batchDelaySeconds * 1000));
    }
  }

  isProcessing = false;
  console.log('[Bulk Queue] Finished processing queue');
}

/**
 * Start background polling for a video
 */
async function startBackgroundPolling(
  videoId: string, 
  userId: string, 
  operationName: string, 
  sceneId: string, 
  apiKey: string,
  rotationToken: ApiToken | undefined
) {
  (async () => {
    try {
      let completed = false;
      let attempts = 0;
      const maxAttempts = 900; // 30 minutes max (900 attempts * 2 seconds = 1800 seconds)
      const retryAttempt = 60; // 2 minutes
      let currentOperationName = operationName;
      let currentSceneId = sceneId;
      let currentApiKey = apiKey;
      let currentRotationToken = rotationToken;
      let hasRetriedWithNewToken = false;

      while (!completed && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;

        // After 2 minutes, try with next API token if not completed
        if (attempts === retryAttempt && !completed && !hasRetriedWithNewToken) {
          console.log(`[Bulk Queue Polling] Video ${videoId} not completed after 2 minutes, trying with next API token...`);
          
          if (currentRotationToken) {
            storage.recordTokenError(currentRotationToken.id);
          }

          try {
            const nextToken = await storage.getNextRotationToken();
            
            if (nextToken && nextToken.id !== currentRotationToken?.id) {
              console.log(`[Bulk Queue Polling] Switching to next token: ${nextToken.label}`);
              currentApiKey = nextToken.token;
              currentRotationToken = nextToken;
              await storage.updateTokenUsage(nextToken.id);
              
              // Start new generation with the new token
              const veoProjectId = process.env.VEO3_PROJECT_ID || "06ad4933-483d-4ef6-b1d9-7a8bc21219cb";
              const newSceneId = `retry-${videoId}-${Date.now()}`;
              const seed = Math.floor(Math.random() * 100000);

              const video = await storage.updateVideoHistoryStatus(videoId, userId, 'pending');
              if (!video) continue;

              const payload = {
                clientContext: {
                  projectId: veoProjectId,
                  tool: "PINHOLE",
                  userPaygateTier: "PAYGATE_TIER_TWO"
                },
                requests: [{
                  aspectRatio: video.aspectRatio === "portrait" ? "VIDEO_ASPECT_RATIO_PORTRAIT" : "VIDEO_ASPECT_RATIO_LANDSCAPE",
                  seed: seed,
                  textInput: {
                    prompt: video.prompt
                  },
                  videoModelKey: video.aspectRatio === "portrait" ? "veo_3_1_t2v_fast_portrait_ultra" : "veo_3_1_t2v_fast_ultra",
                  metadata: {
                    sceneId: newSceneId
                  }
                }]
              };

              // Add timeout for retry request too
              const retryController = new AbortController();
              const retryTimeout = setTimeout(() => retryController.abort(), 90000);
              
              const response = await fetch('https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoText', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${currentApiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                signal: retryController.signal,
              });
              
              clearTimeout(retryTimeout);

              const data = await response.json();
              
              if (response.ok && data.operations && data.operations.length > 0) {
                currentOperationName = data.operations[0].operation.name;
                currentSceneId = newSceneId;
                hasRetriedWithNewToken = true;
                console.log(`[Bulk Queue Polling] Started new generation with token ${nextToken.label}`);
                
                await storage.updateVideoHistoryFields(videoId, { tokenUsed: nextToken.id });
              }
            }
          } catch (retryError) {
            console.error('[Bulk Queue Polling] Error retrying with new token:', retryError);
          }
        }

        // Check video status using proper API endpoint
        try {
          const requestBody = {
            operations: [{
              operation: {
                name: currentOperationName
              },
              sceneId: currentSceneId,
              status: "MEDIA_GENERATION_STATUS_PENDING"
            }]
          };

          // Add timeout to status check (30 seconds)
          const statusController = new AbortController();
          const statusTimeout = setTimeout(() => statusController.abort(), 30000);

          const statusResponse = await fetch('https://aisandbox-pa.googleapis.com/v1/video:batchCheckAsyncVideoGenerationStatus', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${currentApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: statusController.signal,
          });

          clearTimeout(statusTimeout);

          if (!statusResponse.ok) {
            console.error(`[Bulk Queue Polling] Status check failed (${statusResponse.status}) - will retry on next poll`);
            continue; // Try again on next poll
          }

          const statusData = await statusResponse.json();
          console.log(`[Bulk Queue Polling] Status for ${videoId}:`, JSON.stringify(statusData, null, 2).substring(0, 500));

          // Check operations array for status
          if (statusData.operations && statusData.operations.length > 0) {
            const operationData = statusData.operations[0];
            const operation = operationData.operation;
            const opStatus = operationData.status;
            
            console.log(`[Bulk Queue Polling] Video ${videoId} status: ${opStatus}`);
            
            // Extract video URL from nested metadata structure (matching veo3.ts)
            let veoVideoUrl: string | undefined;
            
            if (operation?.metadata?.video?.fifeUrl) {
              veoVideoUrl = operation.metadata.video.fifeUrl;
            } else if (operation?.videoUrl) {
              veoVideoUrl = operation.videoUrl;
            } else if (operation?.fileUrl) {
              veoVideoUrl = operation.fileUrl;
            } else if (operation?.downloadUrl) {
              veoVideoUrl = operation.downloadUrl;
            }
            
            // Decode HTML entities (VEO returns &amp; instead of &)
            if (veoVideoUrl) {
              veoVideoUrl = veoVideoUrl
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'");
            }
            
            // Check if video is completed
            if (opStatus === 'MEDIA_GENERATION_STATUS_COMPLETE' || opStatus === 'MEDIA_GENERATION_STATUS_SUCCESSFUL' || opStatus === 'COMPLETED') {
              if (veoVideoUrl) {
                console.log(`[Bulk Queue Polling] Video ${videoId} completed, uploading to Cloudinary...`);
                
                // Upload to Cloudinary
                const { uploadVideoToCloudinary } = await import('./cloudinary');
                const cloudinaryUrl = await uploadVideoToCloudinary(veoVideoUrl);
                
                await storage.updateVideoHistoryStatus(videoId, userId, 'completed', cloudinaryUrl);
                console.log(`[Bulk Queue Polling] Video ${videoId} completed successfully`);
                completed = true;
              } else {
                console.log(`[Bulk Queue Polling] Video ${videoId} shows complete but no URL found`);
              }
            } else if (operation?.error) {
              const errorMessage = `VEO generation failed: ${operation.error.message || JSON.stringify(operation.error).substring(0, 200)}`;
              console.error(`[Bulk Queue Polling] Video ${videoId} failed:`, operation.error);
              await storage.updateVideoHistoryStatus(videoId, userId, 'failed', undefined, errorMessage);
              
              if (currentRotationToken) {
                storage.recordTokenError(currentRotationToken.id);
              }
              completed = true;
            }
          }
        } catch (pollError: any) {
          // Log network errors with more detail
          if (pollError.name === 'AbortError') {
            console.error(`[Bulk Queue Polling] Status check timeout for video ${videoId} - will retry on next poll`);
          } else if (pollError.code === 'ECONNRESET' || pollError.cause?.code === 'ECONNRESET') {
            console.error(`[Bulk Queue Polling] Network connection reset for video ${videoId} - will retry on next poll`);
          } else {
            console.error(`[Bulk Queue Polling] Error polling video ${videoId}:`, pollError);
          }
          // Continue polling - will retry on next attempt
        }
      }

      // If not completed after max attempts, mark as failed
      if (!completed) {
        const errorMessage = `Video generation timed out after ${maxAttempts * 2} seconds (${maxAttempts} attempts)`;
        console.log(`[Bulk Queue Polling] Video ${videoId} timed out after ${maxAttempts} attempts`);
        await storage.updateVideoHistoryStatus(videoId, userId, 'failed', undefined, errorMessage);
      }
    } catch (error) {
      const errorMessage = `Fatal error during video generation: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[Bulk Queue Polling] Fatal error polling video ${videoId}:`, error);
      await storage.updateVideoHistoryStatus(videoId, userId, 'failed', undefined, errorMessage);
    }
  })();
}

/**
 * Get current queue status
 */
export function getQueueStatus() {
  return {
    queueLength: bulkQueue.length,
    isProcessing
  };
}
