import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { storyInputSchema } from "@shared/schema";
import { generateScenes } from "./gemini";

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

  const httpServer = createServer(app);

  return httpServer;
}
