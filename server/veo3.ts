
const VEO3_BASE_URL = "https://aisandbox-pa.googleapis.com/v1/video";

interface VideoGenerationRequest {
  clientContext: {
    projectId: string;
    tool: string;
    userPaygateTier: string;
  };
  requests: Array<{
    aspectRatio: string;
    seed: number;
    textInput: {
      prompt: string;
    };
    videoModelKey: string;
    metadata: {
      sceneId: string;
    };
  }>;
}

interface VideoGenerationResponse {
  operations?: Array<{
    operation: {
      name: string;
    };
    sceneId: string;
    status: string;
  }>;
  remainingCredits?: number;
}

interface VideoStatusRequest {
  operations: Array<{
    operation: {
      name: string;
    };
    sceneId: string;
    status: string;
  }>;
}

interface VideoStatusResponse {
  operations?: Array<{
    operation: {
      error?: {
        message: string;
      };
      videoUrl?: string;
      fileUrl?: string;
      downloadUrl?: string;
      [key: string]: any; // Allow for other fields
    };
    sceneId: string;
    status: string;
  }>;
  remainingCredits?: number;
}

export interface GeneratedVideo {
  sceneId: string;
  sceneNumber: number;
  operationName: string;
  status: string;
  videoUrl?: string;
  error?: string;
}

// Clean prompt by removing special characters that can cause errors
function cleanPrompt(prompt: string): string {
  // Remove special characters: " * , : ; _ -
  return prompt
    .replace(/["*,:;_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Parse scene description to get the full prompt text
export async function checkVideoStatus(
  operationName: string,
  sceneId: string,
  apiKey: string,
  retryCount: number = 0
): Promise<{ status: string; videoUrl?: string; error?: string }> {
  const MAX_RETRIES = 3;
  
  // Trim the API key and remove "Bearer " prefix if present
  let trimmedApiKey = apiKey.trim();
  if (trimmedApiKey.startsWith('Bearer ')) {
    trimmedApiKey = trimmedApiKey.substring(7); // Remove "Bearer " prefix
  }

  const requestBody: VideoStatusRequest = {
    operations: [{
      operation: {
        name: operationName
      },
      sceneId: sceneId,
      status: "MEDIA_GENERATION_STATUS_PENDING"
    }]
  };

  // Create an AbortController for timeout handling (30 seconds)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`${VEO3_BASE_URL}:batchCheckAsyncVideoGenerationStatus`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${trimmedApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`VEO 3 status check error: ${response.status} - ${errorText}`);
    }

    const data: VideoStatusResponse = await response.json();
    console.log(`[VEO3] Status check response:`, JSON.stringify(data, null, 2));

    if (!data.operations || data.operations.length === 0) {
      console.log(`[VEO3] No operations in status response, returning PENDING`);
      return { status: "PENDING" };
    }

  const operationData = data.operations[0];
  console.log(`[VEO3] Operation status: ${operationData.status}`);
  console.log(`[VEO3] Operation data:`, JSON.stringify(operationData.operation, null, 2));
  
  // Extract video URL from the nested metadata structure
  let videoUrl: string | undefined;
  
  // Try to get from metadata.video.fifeUrl (the actual location)
  if (operationData.operation?.metadata?.video?.fifeUrl) {
    videoUrl = operationData.operation.metadata.video.fifeUrl;
  }
  // Fallback to other possible locations
  else if ((operationData.operation as any).videoUrl) {
    videoUrl = (operationData.operation as any).videoUrl;
  }
  else if ((operationData.operation as any).fileUrl) {
    videoUrl = (operationData.operation as any).fileUrl;
  }
  else if ((operationData.operation as any).downloadUrl) {
    videoUrl = (operationData.operation as any).downloadUrl;
  }
  
  // Decode HTML entities in the URL (VEO 3 returns &amp; instead of &)
  if (videoUrl) {
    const originalUrl = videoUrl;
    // Use a comprehensive HTML entity decoder
    videoUrl = videoUrl
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    
    console.log(`[VEO3] Found video URL`);
    console.log(`[VEO3] Original length: ${originalUrl.length}, Decoded length: ${videoUrl.length}`);
    console.log(`[VEO3] URL starts with: ${videoUrl.substring(0, 100)}`);
    console.log(`[VEO3] Has &: ${videoUrl.includes('&')}, Has &amp;: ${videoUrl.includes('&amp;')}`);
  } else {
    console.log(`[VEO3] No video URL found in response`);
  }
  
    return {
      status: operationData.status,
      videoUrl: videoUrl,
      error: operationData.operation.error?.message
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    // Handle timeout specifically with retry logic
    if (error.name === 'AbortError') {
      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
        console.log(`[VEO3] Status check timeout for ${sceneId}, retrying in ${waitTime}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return checkVideoStatus(operationName, sceneId, apiKey, retryCount + 1);
      } else {
        console.error(`[VEO3] Status check timeout after ${MAX_RETRIES} retries for ${sceneId}`);
        // Return PENDING status instead of throwing to allow polling to continue
        return { status: "PENDING" };
      }
    }
    
    throw error;
  }
}

// Poll for video completion with timeout
export async function waitForVideoCompletion(
  operationName: string,
  sceneId: string,
  apiKey: string,
  maxWaitTime: number = 300000 // 5 minutes default
): Promise<{ videoUrl: string }> {
  const startTime = Date.now();
  const pollInterval = 15000; // Check every 15 seconds
  const initialDelay = 15000; // Wait 15 seconds before first check

  // Wait initially to give the API time to process
  console.log(`[VEO3] Waiting ${initialDelay/1000}s before first status check for ${sceneId}`);
  await new Promise(resolve => setTimeout(resolve, initialDelay));

  while (Date.now() - startTime < maxWaitTime) {
    const status = await checkVideoStatus(operationName, sceneId, apiKey);

    console.log(`[VEO3] Polling status for ${sceneId}: ${status.status}`);

    if (status.status === "COMPLETED" || status.status === "MEDIA_GENERATION_STATUS_COMPLETE" || status.status === "MEDIA_GENERATION_STATUS_SUCCESSFUL") {
      if (status.videoUrl) {
        console.log(`[VEO3] Video completed successfully with URL: ${status.videoUrl}`);
        return { videoUrl: status.videoUrl };
      }
      throw new Error("Video completed but no URL provided");
    }

    if (status.status === "FAILED" || status.status === "MEDIA_GENERATION_STATUS_FAILED") {
      throw new Error(`Video generation failed: ${status.error || "Unknown error"}`);
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error("Video generation timed out");
}

// Poll for video completion with timeout and status updates callback
export async function waitForVideoCompletionWithUpdates(
  operationName: string,
  sceneId: string,
  apiKey: string,
  onStatusUpdate?: (message: string) => void,
  maxWaitTime: number = 300000 // 5 minutes default
): Promise<{ videoUrl: string }> {
  const startTime = Date.now();
  const pollInterval = 15000; // Check every 15 seconds
  const initialDelay = 15000; // Wait 15 seconds before first check

  // Wait initially to give the API time to process
  console.log(`[VEO3] Waiting ${initialDelay/1000}s before first status check for ${sceneId}`);
  if (onStatusUpdate) {
    onStatusUpdate('Waiting for VEO to start processing...');
  }
  await new Promise(resolve => setTimeout(resolve, initialDelay));

  let pollCount = 0;
  while (Date.now() - startTime < maxWaitTime) {
    pollCount++;
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    
    const status = await checkVideoStatus(operationName, sceneId, apiKey);

    console.log(`[VEO3] Polling status for ${sceneId}: ${status.status}`);

    // Send status update every poll to show activity
    if (onStatusUpdate) {
      onStatusUpdate(`Still generating... (${elapsedSeconds}s elapsed)`);
    }

    if (status.status === "COMPLETED" || status.status === "MEDIA_GENERATION_STATUS_COMPLETE" || status.status === "MEDIA_GENERATION_STATUS_SUCCESSFUL") {
      if (status.videoUrl) {
        console.log(`[VEO3] Video completed successfully with URL: ${status.videoUrl}`);
        if (onStatusUpdate) {
          onStatusUpdate('Video generation complete!');
        }
        return { videoUrl: status.videoUrl };
      }
      throw new Error("Video completed but no URL provided");
    }

    if (status.status === "FAILED" || status.status === "MEDIA_GENERATION_STATUS_FAILED") {
      throw new Error(`Video generation failed: ${status.error || "Unknown error"}`);
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error("Video generation timed out");
}
