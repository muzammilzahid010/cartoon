import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { 
  storyInputSchema, 
  loginSchema, 
  insertUserSchema, 
  updateUserPlanSchema, 
  updateUserApiTokenSchema, 
  insertApiTokenSchema,
  bulkReplaceTokensSchema,
  updateTokenSettingsSchema,
  videoHistory,
  type Scene 
} from "@shared/schema";
import { generateScenes } from "./gemini";
import { generateVideoForScene, checkVideoStatus, waitForVideoCompletion, waitForVideoCompletionWithUpdates } from "./veo3";
import { uploadVideoToCloudinary } from "./cloudinary";
import { mergeVideosWithFalAI } from "./falai";
import { z } from "zod";
import { desc } from "drizzle-orm";
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
  // Loader.io verification endpoint
  app.get("/loaderio-34c6b917514b779ecc940b8a20a020fd.txt", (_req, res) => {
    res.type('text/plain');
    res.send('loaderio-34c6b917514b779ecc940b8a20a020fd');
  });

  app.get("/loaderio-34c6b917514b779ecc940b8a20a020fd.html", (_req, res) => {
    res.type('text/html');
    res.send('loaderio-34c6b917514b779ecc940b8a20a020fd');
  });

  app.get("/loaderio-34c6b917514b779ecc940b8a20a020fd/", (_req, res) => {
    res.type('text/plain');
    res.send('loaderio-34c6b917514b779ecc940b8a20a020fd');
  });

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
      console.log('[Bulk Replace] Request body:', req.body);
      const validationResult = bulkReplaceTokensSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        console.error('[Bulk Replace] Validation failed:', validationResult.error.errors);
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

      console.log('[Bulk Replace] Parsed token lines:', tokenLines.length);

      if (tokenLines.length === 0) {
        console.error('[Bulk Replace] No valid tokens found');
        return res.status(400).json({ 
          error: "No valid tokens found",
          details: ["Please enter at least one token"] 
        });
      }

      console.log('[Bulk Replace] Calling storage.replaceAllTokens...');
      const newTokens = await storage.replaceAllTokens(tokenLines);
      console.log('[Bulk Replace] Successfully replaced tokens:', newTokens.length);
      res.json({ success: true, tokens: newTokens, count: newTokens.length });
    } catch (error) {
      console.error("[Bulk Replace] Error details:", error);
      console.error("[Bulk Replace] Error stack:", error instanceof Error ? error.stack : 'No stack trace');
      res.status(500).json({ 
        error: "Failed to replace tokens",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Video history endpoints
  app.get("/api/admin/video-history", requireAuth, requireAdmin, async (req, res) => {
    try {
      const videos = await db.select().from(videoHistory).orderBy(desc(videoHistory.createdAt));
      res.json({ videos });
    } catch (error) {
      console.error("Error fetching all video history:", error);
      res.status(500).json({ 
        error: "Failed to fetch video history",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.get("/api/video-history", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const videos = await storage.getUserVideoHistory(userId);
      
      // Group videos by project
      const grouped: Record<string, { project?: any; videos: any[] }> = {};
      
      for (const video of videos) {
        const key = video.projectId || 'standalone';
        
        if (!grouped[key]) {
          grouped[key] = {
            videos: []
          };
          
          // Fetch project details if this is a project video
          if (video.projectId) {
            const project = await storage.getProject(video.projectId, userId);
            if (project) {
              grouped[key].project = {
                id: project.id,
                title: project.title,
                scenes: JSON.parse(project.scenes),
                characters: JSON.parse(project.characters),
                mergedVideoUrl: project.mergedVideoUrl,
              };
            }
          }
        }
        
        grouped[key].videos.push(video);
      }
      
      res.json({ videos, grouped });
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
        status: z.enum(["pending", "completed", "failed", "queued"]),
        title: z.string().optional(),
        tokenUsed: z.string().optional(),
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
        status: z.enum(["pending", "completed", "failed", "queued"]),
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
    let rotationToken: Awaited<ReturnType<typeof storage.getNextRotationToken>> | undefined;
    
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
      rotationToken = await storage.getNextRotationToken();
      
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
        status: "PENDING",
        tokenId: rotationToken?.id || null
      });
    } catch (error) {
      console.error("Error in /api/generate-veo-video:", error);
      
      // Record token error if we used a rotation token
      if (rotationToken) {
        storage.recordTokenError(rotationToken.id);
      }
      
      res.status(500).json({ 
        error: "Failed to start video generation",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Start video generation for a scene
  app.post("/api/generate-video", async (req, res) => {
    let rotationToken: Awaited<ReturnType<typeof storage.getNextRotationToken>> | undefined;
    
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
      rotationToken = await storage.getNextRotationToken();
      
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
        status: "PENDING",
        tokenId: rotationToken?.id || null
      });
    } catch (error) {
      console.error("Error in /api/generate-video:", error);
      
      // Record token error if we used a rotation token
      if (rotationToken) {
        storage.recordTokenError(rotationToken.id);
      }
      
      res.status(500).json({ 
        error: "Failed to start video generation",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Regenerate a failed video from history
  app.post("/api/regenerate-video", requireAuth, async (req, res) => {
    let rotationToken: Awaited<ReturnType<typeof storage.getNextRotationToken>> | undefined;
    
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const schema = z.object({
        videoId: z.string(),
        prompt: z.string().min(10, "Prompt must be at least 10 characters"),
        aspectRatio: z.enum(["landscape", "portrait"]).default("landscape"),
        projectId: z.string().optional(),
        sceneNumber: z.number().optional(),
      });

      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: validationResult.error.errors 
        });
      }

      const { videoId, prompt, aspectRatio, projectId, sceneNumber } = validationResult.data;
      
      // First, verify the video exists and belongs to the user, then update status to pending
      const updatedVideo = await storage.updateVideoHistoryStatus(videoId, userId, 'pending');
      
      if (!updatedVideo) {
        return res.status(404).json({ 
          error: "Video not found or you don't have permission to regenerate it" 
        });
      }

      // Get API key from token rotation system or fallback to environment variable
      let apiKey: string | undefined;
      rotationToken = await storage.getNextRotationToken();
      
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
      const sceneId = `regenerate-${videoId}-${Date.now()}`;
      const seed = Math.floor(Math.random() * 100000);

      // Build the payload
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

      console.log(`[VEO Regenerate] Regenerating video ${videoId} (scene ${sceneNumber || 'N/A'}) with prompt:`, prompt);

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
        console.error('[VEO Regenerate] Error response:', data);
        await storage.updateVideoHistoryStatus(videoId, userId, 'failed');
        
        // Record token error if we used a rotation token
        if (rotationToken) {
          storage.recordTokenError(rotationToken.id);
        }
        
        return res.status(500).json({ 
          error: "VEO API error",
          details: data 
        });
      }

      if (!data.operations || data.operations.length === 0) {
        await storage.updateVideoHistoryStatus(videoId, userId, 'failed');
        
        // Record token error if we used a rotation token
        if (rotationToken) {
          storage.recordTokenError(rotationToken.id);
        }
        
        return res.status(500).json({ error: "No operations returned from VEO API" });
      }

      const operation = data.operations[0];
      const operationName = operation.operation.name;

      console.log(`[VEO Regenerate] Started regeneration - Operation: ${operationName}, Scene ID: ${sceneId}`);

      // Update history with token ID if available
      if (rotationToken) {
        try {
          await storage.updateVideoHistoryFields(videoId, { tokenUsed: rotationToken.id });
        } catch (err) {
          console.error('Failed to update video history with token ID:', err);
        }
      }

      // Poll for completion in the background (don't block response)
      (async () => {
        try {
          let completed = false;
          let attempts = 0;
          const maxAttempts = 120; // 4 minutes max (120 * 2 seconds = 240 seconds)
          const retryAttempt = 60; // 2 minutes (60 * 2 seconds = 120 seconds)
          let currentOperationName = operationName;
          let currentSceneId = sceneId;
          let currentApiKey = apiKey!;
          let currentRotationToken = rotationToken;
          let hasRetriedWithNewToken = false;

          while (!completed && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            attempts++;

            // After 2 minutes, try with next API token if not completed
            if (attempts === retryAttempt && !completed && !hasRetriedWithNewToken) {
              console.log(`[VEO Regenerate] Video ${videoId} not completed after 2 minutes, trying with next API token...`);
              
              // Record error for current token
              if (currentRotationToken) {
                storage.recordTokenError(currentRotationToken.id);
              }

              try {
                // Get next rotation token
                const nextToken = await storage.getNextRotationToken();
                
                if (nextToken && nextToken.id !== currentRotationToken?.id) {
                  console.log(`[Token Rotation] Switching to next token: ${nextToken.label} (ID: ${nextToken.id})`);
                  currentApiKey = nextToken.token;
                  currentRotationToken = nextToken;
                  await storage.updateTokenUsage(nextToken.id);
                  
                  // Start new generation with the new token
                  const newPayload = {
                    clientContext: {
                      projectId: process.env.VEO3_PROJECT_ID || "06ad4933-483d-4ef6-b1d9-7a8bc21219cb",
                      tool: "PINHOLE",
                      userPaygateTier: "PAYGATE_TIER_TWO"
                    },
                    requests: [{
                      aspectRatio: aspectRatio === "portrait" ? "VIDEO_ASPECT_RATIO_PORTRAIT" : "VIDEO_ASPECT_RATIO_LANDSCAPE",
                      seed: Math.floor(Math.random() * 100000),
                      textInput: {
                        prompt: prompt
                      },
                      videoModelKey: aspectRatio === "portrait" ? "veo_3_0_t2v_fast_portrait_ultra" : "veo_3_1_t2v_fast_ultra",
                      metadata: {
                        sceneId: `retry-${videoId}-${Date.now()}`
                      }
                    }]
                  };

                  const retryResponse = await fetch('https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoText', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${currentApiKey}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(newPayload),
                  });

                  const retryData = await retryResponse.json();

                  if (retryResponse.ok && retryData.operations && retryData.operations.length > 0) {
                    currentOperationName = retryData.operations[0].operation.name;
                    currentSceneId = `retry-${videoId}-${Date.now()}`;
                    hasRetriedWithNewToken = true;
                    
                    // Update history with new token ID
                    await storage.updateVideoHistoryFields(videoId, { tokenUsed: nextToken.id });
                    console.log(`[VEO Regenerate] Retrying video ${videoId} with new token - Operation: ${currentOperationName}`);
                  } else {
                    console.error(`[VEO Regenerate] Failed to retry with new token:`, retryData);
                  }
                } else {
                  console.log(`[VEO Regenerate] No other tokens available for retry`);
                }
              } catch (retryError) {
                console.error(`[VEO Regenerate] Error retrying with new token:`, retryError);
              }
            }

            try {
              const statusResult = await checkVideoStatus(currentOperationName, currentSceneId, currentApiKey);

              if (statusResult.status === 'COMPLETED' || 
                  statusResult.status === 'MEDIA_GENERATION_STATUS_COMPLETE' || 
                  statusResult.status === 'MEDIA_GENERATION_STATUS_SUCCESSFUL') {
                completed = true;
                
                if (statusResult.videoUrl) {
                  // Update history with completed video
                  await storage.updateVideoHistoryFields(videoId, {
                    videoUrl: statusResult.videoUrl,
                    status: 'completed',
                  });
                  console.log(`[VEO Regenerate] Video ${videoId} completed successfully${hasRetriedWithNewToken ? ' (after token retry)' : ''}`);
                }
              } else if (statusResult.status === 'FAILED' || 
                         statusResult.status === 'MEDIA_GENERATION_STATUS_FAILED') {
                completed = true;
                await storage.updateVideoHistoryFields(videoId, { status: 'failed' });
                console.error(`[VEO Regenerate] Video ${videoId} failed`);
                
                // Record token error
                if (currentRotationToken) {
                  storage.recordTokenError(currentRotationToken.id);
                }
              }
            } catch (pollError) {
              console.error(`[VEO Regenerate] Error polling status for ${videoId}:`, pollError);
            }
          }

          // Timeout - mark as failed
          if (!completed) {
            console.error(`[VEO Regenerate] Video ${videoId} timed out after 4 minutes`);
            await storage.updateVideoHistoryFields(videoId, { status: 'failed' });
            
            // Record token error for timeout
            if (currentRotationToken) {
              storage.recordTokenError(currentRotationToken.id);
            }
          }
        } catch (bgError) {
          console.error(`[VEO Regenerate] Background polling error for ${videoId}:`, bgError);
        }
      })();

      res.json({
        success: true,
        operationName,
        sceneId,
        videoId,
        message: "Video regeneration started and will complete in background",
        tokenId: rotationToken?.id || null,
        tokenLabel: rotationToken?.label || null
      });
    } catch (error) {
      console.error("Error in /api/regenerate-video:", error);
      
      // Record token error if we used a rotation token
      if (rotationToken) {
        storage.recordTokenError(rotationToken.id);
      }
      
      res.status(500).json({ 
        error: "Failed to regenerate video",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Check video generation status
  app.post("/api/check-video-status", async (req, res) => {
    let rotationToken: Awaited<ReturnType<typeof storage.getNextRotationToken>> | undefined;
    
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
      rotationToken = await storage.getNextRotationToken();
      
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

      // Record token error if video generation failed
      if (status.status === 'FAILED' || status.status === 'MEDIA_GENERATION_STATUS_FAILED') {
        if (rotationToken) {
          storage.recordTokenError(rotationToken.id);
        }
      }

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
      
      // Record token error if we used a rotation token
      if (rotationToken) {
        storage.recordTokenError(rotationToken.id);
      }
      
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
      const operations: Array<{ operationName: string; sceneId: string; scene: any; apiKey: string; rotationToken?: Awaited<ReturnType<typeof storage.getNextRotationToken>> }> = [];

      // STEP 1: Start all video generation requests - each scene gets its own token
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        let sceneRotationToken: Awaited<ReturnType<typeof storage.getNextRotationToken>> | undefined;
        
        try {
          // Get a DIFFERENT API key for EACH scene from token rotation system
          let sceneApiKey: string | undefined;
          sceneRotationToken = await storage.getNextRotationToken();
          
          if (sceneRotationToken) {
            sceneApiKey = sceneRotationToken.token;
            console.log(`[Token Rotation] Scene ${scene.scene}: Using token ${sceneRotationToken.label} (ID: ${sceneRotationToken.id})`);
            await storage.updateTokenUsage(sceneRotationToken.id);
          } else {
            sceneApiKey = process.env.VEO3_API_KEY;
            console.log(`[Token Rotation] Scene ${scene.scene}: No active tokens found, using environment variable VEO3_API_KEY`);
          }

          if (!sceneApiKey) {
            throw new Error("No API key configured. Please add tokens in the admin panel or set VEO3_API_KEY environment variable.");
          }

          // Send starting update
          sendSSE({ 
            type: 'progress', 
            current: i + 1, 
            total: scenes.length,
            sceneNumber: scene.scene,
            status: 'starting',
            message: `Submitting request to VEO API${sceneRotationToken ? ` using token: ${sceneRotationToken.label}` : ''}...`,
            timestamp: new Date().toISOString()
          });

          // Start video generation with character context using this scene's token
          const { operationName, sceneId } = await generateVideoForScene(scene, veoProjectId, sceneApiKey, characters);
          
          operations.push({ operationName, sceneId, scene, apiKey: sceneApiKey, rotationToken: sceneRotationToken });

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

          // CRITICAL: 5-second delay between each VEO 3 API request to avoid rate limiting
          // This applies to ALL environments (development, production, etc.)
          // Do NOT reduce this delay - VEO 3 API will reject requests if sent too quickly
          if (i < scenes.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 5000));
          }

        } catch (error) {
          console.error(`Error starting video generation for scene ${scene.scene}:`, error);
          
          // Record token error if we used a rotation token for this scene
          if (sceneRotationToken) {
            storage.recordTokenError(sceneRotationToken.id);
          }
          
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

      // STEP 2: Now poll for completion of all started operations using each scene's token
      for (const op of operations) {
        try {
          sendSSE({ 
            type: 'progress', 
            sceneNumber: op.scene.scene,
            status: 'generating',
            message: 'VEO is generating your video...',
            timestamp: new Date().toISOString()
          });

          // Wait for completion with periodic status updates using this scene's specific token
          const result = await waitForVideoCompletionWithUpdates(
            op.operationName, 
            op.sceneId, 
            op.apiKey, // Use the token that was used to start this specific scene
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
          
          // Record token error if we used a rotation token for this scene
          if (op.rotationToken) {
            storage.recordTokenError(op.rotationToken.id);
          }
          
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

      console.log(`[Merge Videos] Starting merge of ${videos.length} videos using fal.ai`);

      // Sort videos by scene number before merging to ensure correct sequence
      const sortedVideos = [...videos].sort((a, b) => a.sceneNumber - b.sceneNumber);
      const videoUrls = sortedVideos.map(v => v.videoUrl);

      // Merge videos using fal.ai API
      const mergedVideoUrl = await mergeVideosWithFalAI(videoUrls);
      console.log(`[Merge Videos] Videos merged successfully with fal.ai`);
      console.log(`[Merge Videos] Merged video URL: ${mergedVideoUrl}`);

      // Save merged video URL to project if projectId provided
      if (projectId) {
        console.log(`[Merge Videos] Saving merged video URL to project: ${projectId}`);
        await storage.updateProject(projectId, userId, { mergedVideoUrl: mergedVideoUrl });
        console.log(`[Merge Videos] Project updated successfully`);
      }

      res.json({ 
        success: true,
        mergedVideoUrl: mergedVideoUrl
      });
    } catch (error) {
      console.error("Error in /api/merge-videos:", error);
      res.status(500).json({ 
        error: "Failed to merge videos",
        message: error instanceof Error ? error.message : "Unknown error"
      });
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
