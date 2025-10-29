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
    name: string;
    metadata?: {
      sceneId: string;
    };
  }>;
  clientContext?: {
    projectId: string;
  };
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
    status: string;
    videoUrl?: string;
    error?: string;
  }>;
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

  const response = await fetch(`${VEO3_BASE_URL}:batchAsyncGenerateVideoText`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`VEO 3 API error: ${response.status} - ${errorText}`);
  }

  const data: VideoGenerationResponse = await response.json();

  if (!data.operations || data.operations.length === 0) {
    throw new Error("No operation returned from VEO 3 API");
  }

  const operationName = data.operations[0].name;
  
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
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`VEO 3 status check error: ${response.status} - ${errorText}`);
  }

  const data: VideoStatusResponse = await response.json();

  if (!data.operations || data.operations.length === 0) {
    return { status: "PENDING" };
  }

  const operation = data.operations[0];
  
  return {
    status: operation.status,
    videoUrl: operation.videoUrl,
    error: operation.error
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
  const pollInterval = 5000; // Check every 5 seconds

  while (Date.now() - startTime < maxWaitTime) {
    const status = await checkVideoStatus(operationName, sceneId, apiKey);

    if (status.status === "COMPLETED" || status.status === "MEDIA_GENERATION_STATUS_COMPLETE") {
      if (status.videoUrl) {
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
