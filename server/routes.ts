import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { storyInputSchema, type Scene } from "@shared/schema";
import { generateScenes } from "./gemini";
import { generateVideoForScene, checkVideoStatus, waitForVideoCompletion, waitForVideoCompletionWithUpdates } from "./veo3";
import { uploadVideoToCloudinary } from "./cloudinary";
import { mergeVideos } from "./videoMerger";
import { z } from "zod";

// Cache to store Cloudinary URL promises by sceneId to avoid re-uploading
// Using promises allows concurrent requests to await the same upload
const cloudinaryUploadCache = new Map<string, Promise<string>>();

export async function registerRoutes(app: Express): Promise<Server> {
  // Scene generation endpoint
  app.post("/api/generate-scenes", async (req, res) => {
    try {
      // Validate request body
      const validationResult = storyInputSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: validationResult.error.errors 
        });
      }

      const storyInput = validationResult.data;

      // Generate scenes using Gemini AI
      const scenes = await generateScenes(storyInput);

      res.json({ scenes });
    } catch (error) {
      console.error("Error in /api/generate-scenes:", error);
      res.status(500).json({ 
        error: "Failed to generate scenes",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Start video generation for a scene
  app.post("/api/generate-video", async (req, res) => {
    try {
      const schema = z.object({
        scene: z.object({
          scene: z.number(),
          title: z.string(),
          description: z.string()
        }),
        projectId: z.string().optional()
      });

      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: validationResult.error.errors 
        });
      }

      const { scene, projectId } = validationResult.data;
      const apiKey = process.env.VEO3_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ 
          error: "VEO3_API_KEY not configured" 
        });
      }

      // Use provided projectId or default
      const veoProjectId = projectId || process.env.VEO3_PROJECT_ID || "06ad4933-483d-4ef6-b1d9-7a8bc21219cb";

      const result = await generateVideoForScene(scene, veoProjectId, apiKey);

      res.json({
        operationName: result.operationName,
        sceneId: result.sceneId,
        sceneNumber: scene.scene,
        status: "PENDING"
      });
    } catch (error) {
      console.error("Error in /api/generate-video:", error);
      res.status(500).json({ 
        error: "Failed to start video generation",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Check video generation status
  app.post("/api/check-video-status", async (req, res) => {
    try {
      const schema = z.object({
        operationName: z.string(),
        sceneId: z.string()
      });

      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: validationResult.error.errors 
        });
      }

      const { operationName, sceneId } = validationResult.data;
      const apiKey = process.env.VEO3_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ 
          error: "VEO3_API_KEY not configured" 
        });
      }

      const status = await checkVideoStatus(operationName, sceneId, apiKey);

      // If video is completed, handle Cloudinary upload with caching
      if (status.videoUrl && (status.status === 'COMPLETED' || status.status === 'MEDIA_GENERATION_STATUS_COMPLETE' || status.status === 'MEDIA_GENERATION_STATUS_SUCCESSFUL')) {
        // Check if upload is already in progress or completed
        let uploadPromise = cloudinaryUploadCache.get(sceneId);
        
        if (!uploadPromise) {
          // No upload in progress, start new upload
          console.log(`[Video Status] Starting Cloudinary upload for ${sceneId}...`);
          uploadPromise = uploadVideoToCloudinary(status.videoUrl);
          
          // Cache the promise immediately to prevent concurrent uploads
          cloudinaryUploadCache.set(sceneId, uploadPromise);
          
          // Handle upload completion/failure
          uploadPromise
            .then(() => console.log(`[Video Status] Upload completed for ${sceneId}`))
            .catch((error) => {
              console.error(`[Video Status] Upload failed for ${sceneId}:`, error);
              // Remove failed upload from cache so it can be retried
              cloudinaryUploadCache.delete(sceneId);
            });
        } else {
          console.log(`[Video Status] Using cached/in-progress upload for ${sceneId}`);
        }
        
        // Await the upload (will be instant if already resolved)
        try {
          status.videoUrl = await uploadPromise;
        } catch (uploadError) {
          console.error(`[Video Status] Failed to get Cloudinary URL:`, uploadError);
          // Continue with original VEO URL if Cloudinary upload fails
        }
      }

      res.json(status);
    } catch (error) {
      console.error("Error in /api/check-video-status:", error);
      res.status(500).json({ 
        error: "Failed to check video status",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Generate all videos sequentially
  app.post("/api/generate-all-videos", async (req, res) => {
    try {
      const schema = z.object({
        scenes: z.array(z.object({
          scene: z.number(),
          title: z.string(),
          description: z.string()
        })),
        characters: z.array(z.object({
          name: z.string(),
          description: z.string()
        })).optional(),
        projectId: z.string().optional()
      });

      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: validationResult.error.errors 
        });
      }

      const { scenes, characters, projectId } = validationResult.data;
      const apiKey = process.env.VEO3_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ 
          error: "VEO3_API_KEY not configured" 
        });
      }

      const veoProjectId = projectId || process.env.VEO3_PROJECT_ID || "06ad4933-483d-4ef6-b1d9-7a8bc21219cb";

      // Set headers for SSE (Server-Sent Events) to stream progress
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const videos = [];
      const operations: Array<{ operationName: string; sceneId: string; scene: any }> = [];

      // STEP 1: Start all video generation requests quickly (1 second delay to avoid rate limits)
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        
        try {
          // Send starting update
          res.write(`data: ${JSON.stringify({ 
            type: 'progress', 
            current: i + 1, 
            total: scenes.length,
            sceneNumber: scene.scene,
            status: 'starting',
            message: 'Submitting request to VEO API...',
            timestamp: new Date().toISOString()
          })}\n\n`);

          // Start video generation with character context
          const { operationName, sceneId } = await generateVideoForScene(scene, veoProjectId, apiKey, characters);
          
          operations.push({ operationName, sceneId, scene });

          // Send request sent update
          res.write(`data: ${JSON.stringify({ 
            type: 'progress', 
            current: i + 1, 
            total: scenes.length,
            sceneNumber: scene.scene,
            status: 'pending',
            message: 'Request submitted, queued for processing...',
            timestamp: new Date().toISOString()
          })}\n\n`);

          // Short 1 second delay to avoid rate limits (unless it's the last scene)
          if (i < scenes.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

        } catch (error) {
          console.error(`Error starting video generation for scene ${scene.scene}:`, error);
          
          videos.push({
            sceneNumber: scene.scene,
            sceneTitle: scene.title,
            error: error instanceof Error ? error.message : "Unknown error",
            status: 'failed'
          });

          res.write(`data: ${JSON.stringify({ 
            type: 'error', 
            sceneNumber: scene.scene,
            error: error instanceof Error ? error.message : "Unknown error",
            timestamp: new Date().toISOString()
          })}\n\n`);
        }
      }

      // STEP 2: Now poll for completion of all started operations
      for (const op of operations) {
        try {
          res.write(`data: ${JSON.stringify({ 
            type: 'progress', 
            sceneNumber: op.scene.scene,
            status: 'generating',
            message: 'VEO is generating your video...',
            timestamp: new Date().toISOString()
          })}\n\n`);

          // Wait for completion with periodic status updates
          const result = await waitForVideoCompletionWithUpdates(
            op.operationName, 
            op.sceneId, 
            apiKey,
            (status: string) => {
              // Send periodic status updates during polling
              res.write(`data: ${JSON.stringify({ 
                type: 'progress', 
                sceneNumber: op.scene.scene,
                status: 'generating',
                message: status,
                timestamp: new Date().toISOString()
              })}\n\n`);
            }
          );

          // Send uploading status
          res.write(`data: ${JSON.stringify({ 
            type: 'progress', 
            sceneNumber: op.scene.scene,
            status: 'generating',
            message: 'Uploading to Cloudinary...',
            timestamp: new Date().toISOString()
          })}\n\n`);

          // Upload video to Cloudinary for easy download
          console.log(`[Video Gen] Uploading scene ${op.scene.scene} to Cloudinary...`);
          let finalVideoUrl = result.videoUrl;
          try {
            finalVideoUrl = await uploadVideoToCloudinary(result.videoUrl);
            console.log(`[Video Gen] Scene ${op.scene.scene} uploaded to Cloudinary successfully`);
          } catch (uploadError) {
            console.error(`[Video Gen] Failed to upload scene ${op.scene.scene} to Cloudinary:`, uploadError);
            // Continue with original VEO URL if Cloudinary upload fails
          }

          videos.push({
            sceneNumber: op.scene.scene,
            sceneTitle: op.scene.title,
            videoUrl: finalVideoUrl,
            status: 'completed'
          });

          // Send completed update
          res.write(`data: ${JSON.stringify({ 
            type: 'video_complete', 
            sceneNumber: op.scene.scene,
            videoUrl: finalVideoUrl,
            timestamp: new Date().toISOString()
          })}\n\n`);

        } catch (error) {
          console.error(`Error waiting for video completion for scene ${op.scene.scene}:`, error);
          
          videos.push({
            sceneNumber: op.scene.scene,
            sceneTitle: op.scene.title,
            error: error instanceof Error ? error.message : "Unknown error",
            status: 'failed'
          });

          res.write(`data: ${JSON.stringify({ 
            type: 'error', 
            sceneNumber: op.scene.scene,
            error: error instanceof Error ? error.message : "Unknown error",
            timestamp: new Date().toISOString()
          })}\n\n`);
        }
      }

      // Send final result
      res.write(`data: ${JSON.stringify({ 
        type: 'complete', 
        videos 
      })}\n\n`);

      res.end();

    } catch (error) {
      console.error("Error in /api/generate-all-videos:", error);
      res.status(500).json({ 
        error: "Failed to generate videos",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Merge all videos into one
  app.post("/api/merge-videos", async (req, res) => {
    try {
      const schema = z.object({
        videos: z.array(z.object({
          sceneNumber: z.number(),
          videoUrl: z.string()
        }))
      });

      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: validationResult.error.errors 
        });
      }

      const { videos } = validationResult.data;

      if (videos.length === 0) {
        return res.status(400).json({ 
          error: "No videos to merge" 
        });
      }

      console.log(`[Merge Videos] Starting merge of ${videos.length} videos`);

      // Sort videos by scene number before merging to ensure correct sequence
      const sortedVideos = [...videos].sort((a, b) => a.sceneNumber - b.sceneNumber);

      // Merge videos and upload to Cloudinary
      const mergedVideoUrl = await mergeVideos(sortedVideos);

      res.json({ 
        success: true,
        mergedVideoUrl 
      });
    } catch (error) {
      console.error("Error in /api/merge-videos:", error);
      res.status(500).json({ 
        error: "Failed to merge videos",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
