import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { storyInputSchema, type Scene } from "@shared/schema";
import { generateScenes } from "./gemini";
import { generateVideoForScene, checkVideoStatus, waitForVideoCompletion } from "./veo3";
import { z } from "zod";

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
        projectId: z.string().optional()
      });

      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: validationResult.error.errors 
        });
      }

      const { scenes, projectId } = validationResult.data;
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

      // Process scenes sequentially
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        
        try {
          // Send progress update
          res.write(`data: ${JSON.stringify({ 
            type: 'progress', 
            current: i + 1, 
            total: scenes.length,
            sceneNumber: scene.scene,
            status: 'starting'
          })}\n\n`);

          // Start video generation
          const { operationName, sceneId } = await generateVideoForScene(scene, veoProjectId, apiKey);

          // Send started update
          res.write(`data: ${JSON.stringify({ 
            type: 'progress', 
            current: i + 1, 
            total: scenes.length,
            sceneNumber: scene.scene,
            status: 'generating'
          })}\n\n`);

          // Wait for completion
          const result = await waitForVideoCompletion(operationName, sceneId, apiKey);

          videos.push({
            sceneNumber: scene.scene,
            sceneTitle: scene.title,
            videoUrl: result.videoUrl,
            status: 'completed'
          });

          // Send completed update
          res.write(`data: ${JSON.stringify({ 
            type: 'video_complete', 
            sceneNumber: scene.scene,
            videoUrl: result.videoUrl
          })}\n\n`);

        } catch (error) {
          console.error(`Error generating video for scene ${scene.scene}:`, error);
          
          videos.push({
            sceneNumber: scene.scene,
            sceneTitle: scene.title,
            error: error instanceof Error ? error.message : "Unknown error",
            status: 'failed'
          });

          res.write(`data: ${JSON.stringify({ 
            type: 'error', 
            sceneNumber: scene.scene,
            error: error instanceof Error ? error.message : "Unknown error"
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

  const httpServer = createServer(app);

  return httpServer;
}
