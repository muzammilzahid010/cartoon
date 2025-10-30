import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  storyInputSchema, 
  loginSchema, 
  insertUserSchema, 
  updateUserPlanSchema, 
  updateUserApiTokenSchema, 
  insertApiTokenSchema,
  bulkReplaceTokensSchema,
  updateTokenSettingsSchema,
  type Scene 
} from "@shared/schema";
import { generateScenes } from "./gemini";
import { generateVideoForScene, checkVideoStatus, waitForVideoCompletion, waitForVideoCompletionWithUpdates } from "./veo3";
import { uploadVideoToCloudinary } from "./cloudinary";
import { mergeVideos } from "./videoMerger";
import { z } from "zod";
import path from "path";
import { existsSync } from "fs";
import { rm } from "fs/promises";

// Cache to store Cloudinary URL promises by sceneId to avoid re-uploading
// Using promises allows concurrent requests to await the same upload
const cloudinaryUploadCache = new Map<string, Promise<string>>();

// Authentication middleware
const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
};

const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const user = await storage.getUser(req.session.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Login endpoint
  app.post("/api/login", async (req, res) => {
    try {
      const validationResult = loginSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: validationResult.error.errors 
        });
      }

      const { username, password } = validationResult.data;

      const user = await storage.getUserByUsername(username);
      
      if (!user) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      const isPasswordValid = await storage.verifyPassword(user, password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      req.session.userId = user.id;
      
      res.json({ 
        success: true,
        user: { 
          id: user.id, 
          username: user.username, 
          isAdmin: user.isAdmin 
        } 
      });
    } catch (error) {
      console.error("Error in /api/login:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Logout endpoint
  app.post("/api/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      res.json({ success: true });
    });
  });

  // Check session endpoint
  app.get("/api/session", async (req, res) => {
    if (!req.session.userId) {
      return res.json({ authenticated: false });
    }

    const user = await storage.getUser(req.session.userId);
    
    if (!user) {
      req.session.userId = undefined;
      return res.json({ authenticated: false });
    }

    res.json({ 
      authenticated: true,
      user: { 
        id: user.id, 
        username: user.username, 
        isAdmin: user.isAdmin 
      } 
    });
  });

  // Get all users endpoint (admin only)
  app.get("/api/users", requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      
      // Don't send password hashes to frontend
      const sanitizedUsers = users.map(user => ({
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
        planType: user.planType,
        planStatus: user.planStatus,
        planExpiry: user.planExpiry,
        apiToken: user.apiToken,
      }));
      
      res.json({ users: sanitizedUsers });
    } catch (error) {
      console.error("Error in GET /api/users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Create user endpoint (admin only)
  app.post("/api/users", requireAdmin, async (req, res) => {
    try {
      const validationResult = insertUserSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: validationResult.error.errors 
        });
      }

      const { username, password, isAdmin } = validationResult.data;

      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(409).json({ error: "Username already exists" });
      }

      const newUser = await storage.createUser({ username, password, isAdmin });
      
      res.json({ 
        success: true,
        user: { 
          id: newUser.id, 
          username: newUser.username, 
          isAdmin: newUser.isAdmin 
        } 
      });
    } catch (error) {
      console.error("Error in /api/users:", error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  // Update user plan endpoint (admin only)
  app.patch("/api/users/:id/plan", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const validationResult = updateUserPlanSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: validationResult.error.errors 
        });
      }

      const updatedUser = await storage.updateUserPlan(id, validationResult.data);
      
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ 
        success: true,
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          isAdmin: updatedUser.isAdmin,
          planType: updatedUser.planType,
          planStatus: updatedUser.planStatus,
          planExpiry: updatedUser.planExpiry,
          apiToken: updatedUser.apiToken,
        }
      });
    } catch (error) {
      console.error("Error in PATCH /api/users/:id/plan:", error);
      res.status(500).json({ error: "Failed to update user plan" });
    }
  });

  // Update user API token endpoint (admin only)
  app.patch("/api/users/:id/token", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const validationResult = updateUserApiTokenSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: validationResult.error.errors 
        });
      }

      const updatedUser = await storage.updateUserApiToken(id, validationResult.data);
      
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ 
        success: true,
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          isAdmin: updatedUser.isAdmin,
          planType: updatedUser.planType,
          planStatus: updatedUser.planStatus,
          planExpiry: updatedUser.planExpiry,
          apiToken: updatedUser.apiToken,
        }
      });
    } catch (error) {
      console.error("Error in PATCH /api/users/:id/token:", error);
      res.status(500).json({ error: "Failed to update user API token" });
    }
  });

  // API Token Management Endpoints (admin only)
  app.get("/api/tokens", requireAdmin, async (req, res) => {
    try {
      const tokens = await storage.getAllApiTokens();
      res.json({ tokens });
    } catch (error) {
      console.error("Error in GET /api/tokens:", error);
      res.status(500).json({ error: "Failed to fetch API tokens" });
    }
  });

  app.post("/api/tokens", requireAdmin, async (req, res) => {
    try {
      const validationResult = insertApiTokenSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: validationResult.error.errors 
        });
      }

      const newToken = await storage.addApiToken(validationResult.data);
      res.json({ success: true, token: newToken });
    } catch (error) {
      console.error("Error in POST /api/tokens:", error);
      res.status(500).json({ error: "Failed to add API token" });
    }
  });

  app.delete("/api/tokens/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteApiToken(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error in DELETE /api/tokens/:id:", error);
      res.status(500).json({ error: "Failed to delete API token" });
    }
  });

  app.patch("/api/tokens/:id/toggle", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { isActive } = req.body;
      
      const updatedToken = await storage.toggleApiTokenStatus(id, isActive);
      
      if (!updatedToken) {
        return res.status(404).json({ error: "Token not found" });
      }

      res.json({ success: true, token: updatedToken });
    } catch (error) {
      console.error("Error in PATCH /api/tokens/:id/toggle:", error);
      res.status(500).json({ error: "Failed to update token status" });
    }
  });

  // Token Rotation Settings Endpoints (admin only)
  app.get("/api/token-settings", requireAdmin, async (req, res) => {
    try {
      const settings = await storage.getTokenSettings();
      res.json({ settings });
    } catch (error) {
      console.error("Error in GET /api/token-settings:", error);
      res.status(500).json({ error: "Failed to fetch token settings" });
    }
  });

  app.put("/api/token-settings", requireAdmin, async (req, res) => {
    try {
      const validationResult = updateTokenSettingsSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: validationResult.error.errors 
        });
      }

      const updatedSettings = await storage.updateTokenSettings(validationResult.data);
      res.json({ success: true, settings: updatedSettings });
    } catch (error) {
      console.error("Error in PUT /api/token-settings:", error);
      res.status(500).json({ error: "Failed to update token settings" });
    }
  });

  // Bulk replace all tokens (admin only)
  app.post("/api/tokens/bulk-replace", requireAdmin, async (req, res) => {
    try {
      const validationResult = bulkReplaceTokensSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: validationResult.error.errors 
        });
      }

      // Parse tokens from textarea (one per line)
      const tokensText = validationResult.data.tokens.trim();
      const tokenLines = tokensText.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
          // Remove "Bearer " prefix if present
          return line.replace(/^Bearer\s+/i, '');
        });

      if (tokenLines.length === 0) {
        return res.status(400).json({ 
          error: "No valid tokens found",
          details: ["Please enter at least one token"] 
        });
      }

      const newTokens = await storage.replaceAllTokens(tokenLines);
      res.json({ success: true, tokens: newTokens, count: newTokens.length });
    } catch (error) {
      console.error("Error in POST /api/tokens/bulk-replace:", error);
      res.status(500).json({ error: "Failed to replace tokens" });
    }
  });

  // Video history endpoints
  app.get("/api/video-history", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const videos = await storage.getUserVideoHistory(userId);
      res.json({ videos });
    } catch (error) {
      console.error("Error fetching video history:", error);
      res.status(500).json({ 
        error: "Failed to fetch video history",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.post("/api/video-history", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const schema = z.object({
        prompt: z.string().min(10, "Prompt must be at least 10 characters"),
        aspectRatio: z.enum(["landscape", "portrait"]),
        videoUrl: z.string().optional(),
        status: z.enum(["pending", "completed", "failed"]),
        title: z.string().optional(),
      });

      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: validationResult.error.errors 
        });
      }

      const video = await storage.addVideoHistory({
        userId,
        ...validationResult.data
      });

      res.json({ video });
    } catch (error) {
      console.error("Error saving video history:", error);
      res.status(500).json({ 
        error: "Failed to save video history",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.patch("/api/video-history/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session.userId;
      
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const schema = z.object({
        status: z.enum(["pending", "completed", "failed"]),
        videoUrl: z.string().optional(),
      });

      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: validationResult.error.errors 
        });
      }

      const { status, videoUrl } = validationResult.data;

      const updated = await storage.updateVideoHistoryStatus(id, userId, status, videoUrl);

      if (!updated) {
        return res.status(404).json({ error: "Video history entry not found or access denied" });
      }

      res.json({ video: updated });
    } catch (error) {
      console.error("Error updating video history:", error);
      res.status(500).json({ 
        error: "Failed to update video history",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Scene generation endpoint
  app.post("/api/generate-scenes", requireAuth, async (req, res) => {
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
      const userId = req.session.userId!;

      // Generate scenes using Gemini AI
      const scenes = await generateScenes(storyInput);

      // Auto-save as project if title is provided or generate default title
      const projectTitle = storyInput.title || `Cartoon Story - ${new Date().toLocaleDateString()}`;
      
      const project = await storage.createProject({
        userId,
        title: projectTitle,
        script: storyInput.script,
        characters: JSON.stringify(storyInput.characters),
        scenes: JSON.stringify(scenes),
      });

      res.json({ scenes, projectId: project.id });
    } catch (error) {
      console.error("Error in /api/generate-scenes:", error);
      res.status(500).json({ 
        error: "Failed to generate scenes",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Generate VEO video directly from prompt
  app.post("/api/generate-veo-video", async (req, res) => {
    try {
      const schema = z.object({
        prompt: z.string().min(10, "Prompt must be at least 10 characters"),
        aspectRatio: z.enum(["landscape", "portrait"]).default("landscape")
      });

      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: validationResult.error.errors 
        });
      }

      const { prompt, aspectRatio } = validationResult.data;
      
      // Get API key from token rotation system or fallback to environment variable
      let apiKey: string | undefined;
      const rotationToken = await storage.getNextRotationToken();
      
      if (rotationToken) {
        apiKey = rotationToken.token;
        console.log(`[Token Rotation] Using token: ${rotationToken.label} (ID: ${rotationToken.id})`);
        await storage.updateTokenUsage(rotationToken.id);
      } else {
        apiKey = process.env.VEO3_API_KEY;
        console.log('[Token Rotation] No active tokens found, using environment variable VEO3_API_KEY');
      }

      if (!apiKey) {
        return res.status(500).json({ 
          error: "No API key configured. Please add tokens in the admin panel or set VEO3_API_KEY environment variable." 
        });
      }

      const veoProjectId = process.env.VEO3_PROJECT_ID || "06ad4933-483d-4ef6-b1d9-7a8bc21219cb";
      const sceneId = `veo-${Date.now()}`;
      const seed = Math.floor(Math.random() * 100000);

      // Build the payload based on aspect ratio
      const payload = {
        clientContext: {
          projectId: veoProjectId,
          tool: "PINHOLE",
          userPaygateTier: "PAYGATE_TIER_TWO"
        },
        requests: [{
          aspectRatio: aspectRatio === "portrait" ? "VIDEO_ASPECT_RATIO_PORTRAIT" : "VIDEO_ASPECT_RATIO_LANDSCAPE",
          seed: seed,
          textInput: {
            prompt: prompt
          },
          videoModelKey: aspectRatio === "portrait" ? "veo_3_0_t2v_fast_portrait_ultra" : "veo_3_1_t2v_fast_ultra",
          metadata: {
            sceneId: sceneId
          }
        }]
      };

      console.log(`[VEO Direct] Generating ${aspectRatio} video with prompt:`, prompt);

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
        throw new Error(data.error?.message || 'Failed to start video generation');
      }

      const operationName = data.operations?.[0]?.operation?.name;

      if (!operationName) {
        throw new Error('No operation name returned from VEO API');
      }

      res.json({
        operationName,
        sceneId,
        status: "PENDING"
      });
    } catch (error) {
      console.error("Error in /api/generate-veo-video:", error);
      res.status(500).json({ 
        error: "Failed to start video generation",
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
      
      // Get API key from token rotation system or fallback to environment variable
      let apiKey: string | undefined;
      const rotationToken = await storage.getNextRotationToken();
      
      if (rotationToken) {
        apiKey = rotationToken.token;
        console.log(`[Token Rotation] Using token: ${rotationToken.label} (ID: ${rotationToken.id})`);
        await storage.updateTokenUsage(rotationToken.id);
      } else {
        apiKey = process.env.VEO3_API_KEY;
        console.log('[Token Rotation] No active tokens found, using environment variable VEO3_API_KEY');
      }

      if (!apiKey) {
        return res.status(500).json({ 
          error: "No API key configured. Please add tokens in the admin panel or set VEO3_API_KEY environment variable." 
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
      
      // Get API key from token rotation system or fallback to environment variable
      let apiKey: string | undefined;
      const rotationToken = await storage.getNextRotationToken();
      
      if (rotationToken) {
        apiKey = rotationToken.token;
        console.log(`[Token Rotation] Using token: ${rotationToken.label} (ID: ${rotationToken.id})`);
        await storage.updateTokenUsage(rotationToken.id);
      } else {
        apiKey = process.env.VEO3_API_KEY;
        console.log('[Token Rotation] No active tokens found, using environment variable VEO3_API_KEY');
      }

      if (!apiKey) {
        return res.status(500).json({ 
          error: "No API key configured. Please add tokens in the admin panel or set VEO3_API_KEY environment variable." 
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
      
      // Get API key from token rotation system or fallback to environment variable
      let apiKey: string | undefined;
      const rotationToken = await storage.getNextRotationToken();
      
      if (rotationToken) {
        apiKey = rotationToken.token;
        console.log(`[Token Rotation] Using token: ${rotationToken.label} (ID: ${rotationToken.id})`);
        await storage.updateTokenUsage(rotationToken.id);
      } else {
        apiKey = process.env.VEO3_API_KEY;
        console.log('[Token Rotation] No active tokens found, using environment variable VEO3_API_KEY');
      }

      if (!apiKey) {
        return res.status(500).json({ 
          error: "No API key configured. Please add tokens in the admin panel or set VEO3_API_KEY environment variable." 
        });
      }

      const veoProjectId = projectId || process.env.VEO3_PROJECT_ID || "06ad4933-483d-4ef6-b1d9-7a8bc21219cb";

      // Set headers for SSE (Server-Sent Events) to stream progress
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
      res.flushHeaders(); // Immediately send headers to establish SSE connection

      // Helper function to send SSE messages with immediate flush
      const sendSSE = (data: any) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        res.write(message);
        console.log('[SSE] Sent:', data.type, 'for scene', data.sceneNumber, '-', data.message || data.status);
      };

      const videos = [];
      const operations: Array<{ operationName: string; sceneId: string; scene: any }> = [];

      // STEP 1: Start all video generation requests quickly (1 second delay to avoid rate limits)
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        
        try {
          // Send starting update
          sendSSE({ 
            type: 'progress', 
            current: i + 1, 
            total: scenes.length,
            sceneNumber: scene.scene,
            status: 'starting',
            message: 'Submitting request to VEO API...',
            timestamp: new Date().toISOString()
          });

          // Start video generation with character context
          const { operationName, sceneId } = await generateVideoForScene(scene, veoProjectId, apiKey, characters);
          
          operations.push({ operationName, sceneId, scene });

          // Send request sent update
          sendSSE({ 
            type: 'progress', 
            current: i + 1, 
            total: scenes.length,
            sceneNumber: scene.scene,
            status: 'pending',
            message: 'Request submitted, queued for processing...',
            timestamp: new Date().toISOString()
          });

          // 5 second delay to avoid rate limits (unless it's the last scene)
          if (i < scenes.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 5000));
          }

        } catch (error) {
          console.error(`Error starting video generation for scene ${scene.scene}:`, error);
          
          videos.push({
            sceneNumber: scene.scene,
            sceneTitle: scene.title,
            error: error instanceof Error ? error.message : "Unknown error",
            status: 'failed'
          });

          sendSSE({ 
            type: 'error', 
            sceneNumber: scene.scene,
            error: error instanceof Error ? error.message : "Unknown error",
            timestamp: new Date().toISOString()
          });
        }
      }

      // STEP 2: Now poll for completion of all started operations
      for (const op of operations) {
        try {
          sendSSE({ 
            type: 'progress', 
            sceneNumber: op.scene.scene,
            status: 'generating',
            message: 'VEO is generating your video...',
            timestamp: new Date().toISOString()
          });

          // Wait for completion with periodic status updates
          const result = await waitForVideoCompletionWithUpdates(
            op.operationName, 
            op.sceneId, 
            apiKey,
            (status: string) => {
              // Send periodic status updates during polling
              sendSSE({ 
                type: 'progress', 
                sceneNumber: op.scene.scene,
                status: 'generating',
                message: status,
                timestamp: new Date().toISOString()
              });
            }
          );

          // Send uploading status
          sendSSE({ 
            type: 'progress', 
            sceneNumber: op.scene.scene,
            status: 'generating',
            message: 'Uploading to Cloudinary...',
            timestamp: new Date().toISOString()
          });

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
          sendSSE({ 
            type: 'video_complete', 
            sceneNumber: op.scene.scene,
            videoUrl: finalVideoUrl,
            timestamp: new Date().toISOString()
          });

        } catch (error) {
          console.error(`Error waiting for video completion for scene ${op.scene.scene}:`, error);
          
          videos.push({
            sceneNumber: op.scene.scene,
            sceneTitle: op.scene.title,
            error: error instanceof Error ? error.message : "Unknown error",
            status: 'failed'
          });

          sendSSE({ 
            type: 'error', 
            sceneNumber: op.scene.scene,
            error: error instanceof Error ? error.message : "Unknown error",
            timestamp: new Date().toISOString()
          });
        }
      }

      // Send final result
      sendSSE({ 
        type: 'complete', 
        videos 
      });

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
  app.post("/api/merge-videos", requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        videos: z.array(z.object({
          sceneNumber: z.number(),
          videoUrl: z.string()
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

      const { videos, projectId } = validationResult.data;
      const userId = req.session.userId!;

      if (videos.length === 0) {
        return res.status(400).json({ 
          error: "No videos to merge" 
        });
      }

      console.log(`[Merge Videos] Starting merge of ${videos.length} videos`);

      // Sort videos by scene number before merging to ensure correct sequence
      const sortedVideos = [...videos].sort((a, b) => a.sceneNumber - b.sceneNumber);

      // Merge videos and get local file path
      const mergedVideoPath = await mergeVideos(sortedVideos);
      console.log(`[Merge Videos] Videos merged successfully at: ${mergedVideoPath}`);

      // Upload merged video to Replit Object Storage
      console.log(`[Merge Videos] Uploading merged video to Replit Object Storage...`);
      const { ObjectStorageService } = await import('./objectStorage');
      const objectStorage = new ObjectStorageService();
      const videoPath = await objectStorage.uploadMergedVideo(mergedVideoPath);
      console.log(`[Merge Videos] Upload successful! Video path: ${videoPath}`);

      // Clean up temporary directory after successful upload
      const tempDir = path.dirname(mergedVideoPath);
      console.log(`[Merge Videos] Cleaning up temporary files in: ${tempDir}`);
      await rm(tempDir, { recursive: true, force: true });
      console.log(`[Merge Videos] Cleanup complete`);

      // Save merged video URL to project if projectId provided
      if (projectId) {
        console.log(`[Merge Videos] Saving merged video URL to project: ${projectId}`);
        await storage.updateProject(projectId, userId, { mergedVideoUrl: videoPath });
        console.log(`[Merge Videos] Project updated successfully`);
      }

      res.json({ 
        success: true,
        mergedVideoUrl: videoPath
      });
    } catch (error) {
      console.error("Error in /api/merge-videos:", error);
      res.status(500).json({ 
        error: "Failed to merge videos",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Video serving endpoint for Replit Object Storage
  app.get("/videos/:videoPath(*)", async (req, res) => {
    try {
      const { ObjectStorageService, ObjectNotFoundError } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving video:", error);
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ObjectNotFoundError') {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Project endpoints
  app.get("/api/projects", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const projects = await storage.getUserProjects(userId);
      res.json({ projects });
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ 
        error: "Failed to fetch projects",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.get("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { id } = req.params;
      const project = await storage.getProject(id, userId);

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      res.json({ project });
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ 
        error: "Failed to fetch project",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.post("/api/projects", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const schema = z.object({
        title: z.string().min(1, "Title is required"),
        script: z.string().min(50, "Script must be at least 50 characters"),
        characters: z.string(), // JSON string
        scenes: z.string(), // JSON string
        mergedVideoUrl: z.string().optional(),
      });

      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: validationResult.error.errors 
        });
      }

      const project = await storage.createProject({
        userId,
        ...validationResult.data
      });

      res.json({ project });
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ 
        error: "Failed to create project",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.patch("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { id } = req.params;

      const schema = z.object({
        title: z.string().min(1).optional(),
        mergedVideoUrl: z.string().optional(),
        scenes: z.string().optional(),
      });

      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: validationResult.error.errors 
        });
      }

      const updated = await storage.updateProject(id, userId, validationResult.data);

      if (!updated) {
        return res.status(404).json({ error: "Project not found or access denied" });
      }

      res.json({ project: updated });
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({ 
        error: "Failed to update project",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.delete("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { id } = req.params;
      const deleted = await storage.deleteProject(id, userId);

      if (!deleted) {
        return res.status(404).json({ error: "Project not found or access denied" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting project:", error);
      res.status(500).json({ 
        error: "Failed to delete project",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Update scene videos for a project
  app.patch("/api/projects/:id/scene-videos", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { id } = req.params;
      const schema = z.object({
        sceneVideos: z.array(z.object({
          sceneNumber: z.number(),
          videoUrl: z.string().optional(),
          status: z.enum(['pending', 'completed', 'failed'])
        }))
      });

      const validationResult = schema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: validationResult.error.errors 
        });
      }

      const { sceneVideos } = validationResult.data;
      
      const updated = await storage.updateProject(id, userId, {
        sceneVideos: JSON.stringify(sceneVideos)
      });

      if (!updated) {
        return res.status(404).json({ error: "Project not found or access denied" });
      }

      res.json({ success: true, project: updated });
    } catch (error) {
      console.error("Error updating scene videos:", error);
      res.status(500).json({ 
        error: "Failed to update scene videos",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Google Drive OAuth setup helpers (Admin only)
  app.get("/api/google-drive/auth-url", requireAdmin, async (req, res) => {
    try {
      const { generateAuthUrl } = await import('./googleDriveOAuth');
      const authUrl = await generateAuthUrl();
      res.json({ authUrl });
    } catch (error) {
      console.error("Error generating auth URL:", error);
      res.status(500).json({ 
        error: "Failed to generate auth URL",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.post("/api/google-drive/exchange-token", requireAdmin, async (req, res) => {
    try {
      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ error: "Authorization code required" });
      }

      const { exchangeCodeForToken } = await import('./googleDriveOAuth');
      const refreshToken = await exchangeCodeForToken(code);
      
      res.json({ 
        refreshToken,
        message: "Add this token to your secrets as GOOGLE_DRIVE_REFRESH_TOKEN"
      });
    } catch (error) {
      console.error("Error exchanging token:", error);
      res.status(500).json({ 
        error: "Failed to exchange token",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
