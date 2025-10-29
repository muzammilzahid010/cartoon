import type { Scene } from "@shared/schema";

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
function getScenePrompt(scene: Scene): string {
  // Combine title and description, clean it
  const fullText = `${scene.title}. ${scene.description}`;
  return cleanPrompt(fullText);
}

export async function generateVideoForScene(
  scene: Scene,
  projectId: string,
  apiKey: string
): Promise<{ operationName: string; sceneId: string }> {
  const sceneId = `scene-${scene.scene}-${Date.now()}`;
  const prompt = getScenePrompt(scene);

  // Trim the API key and remove "Bearer " prefix if present
  let trimmedApiKey = apiKey.trim();
  if (trimmedApiKey.startsWith('Bearer ')) {
    trimmedApiKey = trimmedApiKey.substring(7); // Remove "Bearer " prefix
  }

  console.log(`[VEO3] Generating video for scene ${scene.scene}`);
  console.log(`[VEO3] Project ID: ${projectId}`);
  console.log(`[VEO3] API Key length: ${trimmedApiKey.length}, starts with: ${trimmedApiKey.substring(0, 10)}...`);
  console.log(`[VEO3] Prompt: ${prompt}`);

  const requestBody: VideoGenerationRequest = {
    clientContext: {
      projectId: projectId,
      tool: "PINHOLE",
      userPaygateTier: "PAYGATE_TIER_TWO"
    },
    requests: [{
      aspectRatio: "VIDEO_ASPECT_RATIO_LANDSCAPE",
      seed: Math.floor(Math.random() * 10000),
      textInput: {
        prompt: prompt
      },
      videoModelKey: "veo_3_1_t2v_fast_ultra",
      metadata: {
        sceneId: sceneId
      }
    }]
  };

  console.log(`[VEO3] Request URL: ${VEO3_BASE_URL}:batchAsyncGenerateVideoText`);
  console.log(`[VEO3] Request body:`, JSON.stringify(requestBody, null, 2));

  const response = await fetch(`${VEO3_BASE_URL}:batchAsyncGenerateVideoText`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${trimmedApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  console.log(`[VEO3] Response status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`VEO 3 API error: ${response.status} - ${errorText}`);
  }

  const data: VideoGenerationResponse = await response.json();
  console.log(`[VEO3] Response data:`, JSON.stringify(data, null, 2));

  if (!data.operations || data.operations.length === 0) {
    throw new Error("No operation returned from VEO 3 API");
  }

  // Flow API nests the operation name inside operation.name
  const operationName = data.operations[0].operation?.name;
  console.log(`[VEO3] Operation name: ${operationName}`);
  
  if (!operationName) {
    throw new Error("No operation name in response");
  }
  
  return {
    operationName,
    sceneId
  };
}

export async function checkVideoStatus(
  operationName: string,
  sceneId: string,
  apiKey: string
): Promise<{ status: string; videoUrl?: string; error?: string }> {
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

  const response = await fetch(`${VEO3_BASE_URL}:batchCheckAsyncVideoGenerationStatus`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${trimmedApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

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
  
  // Check for both videoUrl and fileUrl
  const videoUrl = (operationData.operation as any).videoUrl || 
                   (operationData.operation as any).fileUrl ||
                   (operationData.operation as any).downloadUrl;
  
  if (videoUrl) {
    console.log(`[VEO3] Found video URL: ${videoUrl}`);
  }
  
  return {
    status: operationData.status,
    videoUrl: videoUrl,
    error: operationData.operation.error?.message
  };
}

// Poll for video completion with timeout
export async function waitForVideoCompletion(
  operationName: string,
  sceneId: string,
  apiKey: string,
  maxWaitTime: number = 300000 // 5 minutes default
): Promise<{ videoUrl: string }> {
  const startTime = Date.now();
  const pollInterval = 10000; // Check every 10 seconds
  const initialDelay = 15000; // Wait 15 seconds before first check

  // Wait initially to give the API time to process
  console.log(`[VEO3] Waiting ${initialDelay/1000}s before first status check for ${sceneId}`);
  await new Promise(resolve => setTimeout(resolve, initialDelay));

  while (Date.now() - startTime < maxWaitTime) {
    const status = await checkVideoStatus(operationName, sceneId, apiKey);

    console.log(`[VEO3] Polling status for ${sceneId}: ${status.status}`);

    if (status.status === "COMPLETED" || status.status === "MEDIA_GENERATION_STATUS_COMPLETE") {
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
