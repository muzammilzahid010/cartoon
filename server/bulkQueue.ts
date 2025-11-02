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
 * Process the queue in the background
 */
async function processQueue() {
  if (isProcessing) {
    console.log('[Bulk Queue] Already processing queue');
    return;
  }

  isProcessing = true;
  console.log('[Bulk Queue] Started processing queue');

  while (bulkQueue.length > 0) {
    const video = bulkQueue.shift();
    
    if (!video) {
      continue;
    }

    try {
      console.log(`[Bulk Queue] Processing video ${video.sceneNumber} (ID: ${video.videoId}). Remaining: ${bulkQueue.length}`);
      
      // Get API token using round-robin
      let apiKey: string | undefined;
      let rotationToken: ApiToken | undefined;
      
      if (video.sceneNumber > 0) {
        rotationToken = await storage.getTokenByIndex(video.sceneNumber - 1);
        
        if (rotationToken) {
          apiKey = rotationToken.token;
          console.log(`[Bulk Queue] Using token ${rotationToken.label} for video ${video.sceneNumber}`);
          await storage.updateTokenUsage(rotationToken.id);
        }
      }
      
      if (!apiKey) {
        apiKey = process.env.VEO3_API_KEY;
        console.log('[Bulk Queue] Using environment variable VEO3_API_KEY');
      }

      if (!apiKey) {
        console.error('[Bulk Queue] No API key available, marking video as failed');
        await storage.updateVideoHistoryStatus(video.videoId, video.userId, 'failed');
        continue;
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
          videoModelKey: video.aspectRatio === "portrait" ? "veo_3_0_t2v_fast_portrait_ultra" : "veo_3_1_t2v_fast_ultra",
          metadata: {
            sceneId: sceneId
          }
        }]
      };

      const response = await fetch('https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoText', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('[Bulk Queue] VEO API error:', data);
        await storage.updateVideoHistoryStatus(video.videoId, video.userId, 'failed');
        
        if (rotationToken) {
          storage.recordTokenError(rotationToken.id);
        }
        
        // Wait before processing next video even on error
        if (bulkQueue.length > 0) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
        }
        continue;
      }

      if (!data.operations || data.operations.length === 0) {
        console.error('[Bulk Queue] No operations returned from VEO API');
        await storage.updateVideoHistoryStatus(video.videoId, video.userId, 'failed');
        
        if (rotationToken) {
          storage.recordTokenError(rotationToken.id);
        }
        
        // Wait before processing next video
        if (bulkQueue.length > 0) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
        }
        continue;
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
      console.error(`[Bulk Queue] Error processing video ${video.sceneNumber}:`, error);
      await storage.updateVideoHistoryStatus(video.videoId, video.userId, 'failed');
    }

    // Wait 20 seconds before processing next video
    if (bulkQueue.length > 0) {
      console.log(`[Bulk Queue] Waiting 20 seconds before next video...`);
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
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
      const maxAttempts = 120; // 4 minutes max
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
                  videoModelKey: video.aspectRatio === "portrait" ? "veo_3_0_t2v_fast_portrait_ultra" : "veo_3_1_t2v_fast_ultra",
                  metadata: {
                    sceneId: newSceneId
                  }
                }]
              };

              const response = await fetch('https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoText', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${currentApiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
              });

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

        // Check video status
        try {
          const statusResponse = await fetch(`https://aisandbox-pa.googleapis.com/v1/${currentOperationName}`, {
            headers: {
              'Authorization': `Bearer ${currentApiKey}`,
              'Content-Type': 'application/json',
            },
          });

          const statusData = await statusResponse.json();

          if (statusData.done) {
            if (statusData.response?.generationResults?.[0]?.videoUrl) {
              const veoVideoUrl = statusData.response.generationResults[0].videoUrl;
              console.log(`[Bulk Queue Polling] Video ${videoId} completed, uploading to Cloudinary...`);
              
              // Upload to Cloudinary
              const { uploadVideoToCloudinary } = await import('./cloudinary');
              const cloudinaryUrl = await uploadVideoToCloudinary(veoVideoUrl);
              
              await storage.updateVideoHistoryStatus(videoId, userId, 'completed', cloudinaryUrl);
              console.log(`[Bulk Queue Polling] Video ${videoId} completed successfully`);
              completed = true;
            } else if (statusData.error) {
              console.error(`[Bulk Queue Polling] Video ${videoId} failed:`, statusData.error);
              await storage.updateVideoHistoryStatus(videoId, userId, 'failed');
              
              if (currentRotationToken) {
                storage.recordTokenError(currentRotationToken.id);
              }
              completed = true;
            }
          }
        } catch (pollError) {
          console.error(`[Bulk Queue Polling] Error polling video ${videoId}:`, pollError);
        }
      }

      // If not completed after max attempts, mark as failed
      if (!completed) {
        console.log(`[Bulk Queue Polling] Video ${videoId} timed out after ${maxAttempts} attempts`);
        await storage.updateVideoHistoryStatus(videoId, userId, 'failed');
      }
    } catch (error) {
      console.error(`[Bulk Queue Polling] Fatal error polling video ${videoId}:`, error);
      await storage.updateVideoHistoryStatus(videoId, userId, 'failed');
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
