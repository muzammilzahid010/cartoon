import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { storage } from "./storage";
import { db } from "./db";
import { 
  loginSchema, 
  insertUserSchema, 
  updateUserPlanSchema, 
  updateUserApiTokenSchema, 
  insertApiTokenSchema,
  bulkReplaceTokensSchema,
  updateTokenSettingsSchema,
  videoHistory
} from "@shared/schema";
import { generateScript } from "./openai-script";
import { checkVideoStatus, waitForVideoCompletion, waitForVideoCompletionWithUpdates } from "./veo3";
import { uploadVideoToCloudinary, uploadImageToCloudinary } from "./cloudinary";
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

  // Bulk generate endpoint - processes videos in background queue
  app.post("/api/bulk-generate", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const schema = z.object({
        prompts: z.array(z.string().min(10, "Each prompt must be at least 10 characters")).min(1).max(100),
        aspectRatio: z.enum(["landscape", "portrait"]),
      });

      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: validationResult.error.errors 
        });
      }

      const { prompts, aspectRatio } = validationResult.data;
      const { addToQueue } = await import('./bulkQueue');
      
      console.log(`[Bulk Generate] Starting bulk generation for ${prompts.length} videos`);

      // Create all video history entries immediately
      const videoIds: string[] = [];
      const queuedVideos = [];
      
      for (let i = 0; i < prompts.length; i++) {
        const prompt = prompts[i];
        const video = await storage.addVideoHistory({
          userId,
          prompt,
          aspectRatio,
          status: "pending",
          title: `Bulk VEO ${aspectRatio} video ${i + 1}`,
        });
        
        videoIds.push(video.id);
        queuedVideos.push({
          videoId: video.id,
          prompt,
          aspectRatio,
          sceneNumber: i + 1,
          userId,
        });
      }

      // Add all videos to the background queue
      addToQueue(queuedVideos);

      console.log(`[Bulk Generate] Created ${videoIds.length} videos and added to queue`);

      res.json({ 
        success: true,
        videoIds,
        message: `Started generating ${prompts.length} videos. You can leave this page and check progress in Video History.`
      });
    } catch (error) {
      console.error("Error starting bulk generation:", error);
      res.status(500).json({ 
        error: "Failed to start bulk generation",
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

  // Script creator endpoint
  app.post("/api/generate-script", async (req, res) => {
    try {
      const schema = z.object({
        storyAbout: z.string().min(5, "Story description must be at least 5 characters"),
        numberOfPrompts: z.number().min(1).max(39),
        finalStep: z.string().min(5, "Final step must be at least 5 characters")
      });

      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: validationResult.error.errors 
        });
      }

      const { storyAbout, numberOfPrompts, finalStep } = validationResult.data;

      // Generate script using OpenAI GPT-5
      const script = await generateScript(storyAbout, numberOfPrompts, finalStep);

      res.json({ script });
    } catch (error) {
      console.error("Error in /api/generate-script:", error);
      res.status(500).json({ 
        error: "Failed to generate script",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Text to Image endpoint - uses Google AI Sandbox Whisk API (IMAGEN_3_5)
  app.post("/api/text-to-image", async (req, res) => {
    let rotationToken: Awaited<ReturnType<typeof storage.getNextRotationToken>> | undefined;
    
    try {
      const schema = z.object({
        prompt: z.string().min(3, "Prompt must be at least 3 characters"),
        aspectRatio: z.enum(["IMAGE_ASPECT_RATIO_LANDSCAPE", "IMAGE_ASPECT_RATIO_PORTRAIT", "IMAGE_ASPECT_RATIO_SQUARE"]).default("IMAGE_ASPECT_RATIO_LANDSCAPE")
      });

      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: validationResult.error.errors 
        });
      }

      const { prompt, aspectRatio } = validationResult.data;

      console.log(`[Text to Image] Generating image - Aspect Ratio: ${aspectRatio}, Prompt: ${prompt}`);

      // Get API key from token rotation system (same as VEO)
      let apiKey: string | undefined;
      rotationToken = await storage.getNextRotationToken();
      
      if (rotationToken) {
        apiKey = rotationToken.token;
        console.log(`[Token Rotation] Using token: ${rotationToken.label} (ID: ${rotationToken.id})`);
        await storage.updateTokenUsage(rotationToken.id);
      } else {
        apiKey = process.env.GOOGLE_AI_API_KEY;
        console.log('[Token Rotation] No active tokens found, using environment variable GOOGLE_AI_API_KEY');
      }

      if (!apiKey) {
        return res.status(500).json({ 
          error: "No API key configured. Please add tokens in the admin panel or set GOOGLE_AI_API_KEY environment variable." 
        });
      }

      // Call Google AI Sandbox Whisk API
      const apiUrl = "https://aisandbox-pa.googleapis.com/v1/whisk:generateImage";
      
      const requestBody = {
        clientContext: {
          workflowId: "f76a7144-2d6e-436b-9c64-5707bf091ef8",
          tool: "BACKBONE",
          sessionId: `;${Date.now()}`
        },
        imageModelSettings: {
          imageModel: "IMAGEN_3_5",
          aspectRatio: aspectRatio
        },
        prompt: prompt,
        mediaCategory: "MEDIA_CATEGORY_BOARD"
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Text to Image] API error ${response.status}:`, errorText);
        throw new Error(`Google AI API returned ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      console.log(`[Text to Image] Received response from Google AI`);

      // Extract base64 image data from response
      // Google AI returns nested structure: imagePanels[0].generatedImages[0].encodedImage
      let base64Image: string | undefined;
      
      if (result.imagePanels && result.imagePanels.length > 0) {
        const firstPanel = result.imagePanels[0];
        if (firstPanel.generatedImages && firstPanel.generatedImages.length > 0) {
          const firstImage = firstPanel.generatedImages[0];
          base64Image = firstImage.encodedImage || firstImage.image;
          console.log(`[Text to Image] Extracted image from imagePanels structure`);
        }
      }
      
      // Fallback to other possible fields
      if (!base64Image) {
        base64Image = result.encodedImage || result.image?.base64 || result.base64 || result.imageData || result.data;
      }
      
      if (!base64Image) {
        console.error('[Text to Image] No base64 image data in response:', JSON.stringify(result, null, 2));
        throw new Error("No image data received from Google AI API");
      }

      // Determine file extension from mime type
      const mimeType = result.image?.mimeType || result.mimeType || 'image/png';
      const extension = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
      
      console.log(`[Text to Image] Uploading ${extension} image to Cloudinary...`);

      // Upload base64 image to Cloudinary
      const cloudinaryUrl = await uploadImageToCloudinary(base64Image, extension);

      res.json({ 
        imageUrl: cloudinaryUrl,
        prompt,
        aspectRatio,
        tokenUsed: rotationToken?.label,
        success: true 
      });
    } catch (error) {
      console.error("Error in /api/text-to-image:", error);
      res.status(500).json({ 
        error: "Failed to generate image",
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
      
      console.log(`[VEO Direct] Request received - Aspect Ratio: ${aspectRatio}, Prompt: ${prompt}`);
      
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

      const veoProjectId = process.env.VEO3_PROJECT_ID || "5fdc3f34-d4c6-4afb-853a-aba4390bafdc";
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
          videoModelKey: aspectRatio === "portrait" ? "veo_3_1_t2v_fast_portrait_ultra" : "veo_3_1_t2v_fast_ultra",
          metadata: {
            sceneId: sceneId
          }
        }]
      };

      console.log(`[VEO Direct] Generating ${aspectRatio} video with prompt:`, prompt);
      console.log(`[VEO Direct] Payload:`, JSON.stringify(payload, null, 2));

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

  // Generate VEO video from image + prompt (Image to Video)
  app.post("/api/generate-image-to-video", requireAuth, async (req, res) => {
    let rotationToken: Awaited<ReturnType<typeof storage.getNextRotationToken>> | undefined;
    
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const schema = z.object({
        imageBase64: z.string().min(100, "Image data required"),
        mimeType: z.string().default("image/jpeg"),
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

      const { imageBase64, mimeType, prompt, aspectRatio } = validationResult.data;
      
      console.log(`[Image to Video] Request received - Aspect Ratio: ${aspectRatio}`);
      
      // Get API key from token rotation system
      rotationToken = await storage.getNextRotationToken();
      
      if (!rotationToken) {
        return res.status(500).json({ 
          error: "No API tokens configured. Please add tokens in the admin panel." 
        });
      }

      const apiKey = rotationToken.token;
      console.log(`[Token Rotation] Using token: ${rotationToken.label} (ID: ${rotationToken.id})`);
      await storage.updateTokenUsage(rotationToken.id);

      const veoProjectId = process.env.VEO3_PROJECT_ID || "5fdc3f34-d4c6-4afb-853a-aba4390bafdc";
      // Generate UUID for sceneId (required format for image-to-video)
      const sceneId = crypto.randomUUID();
      const seed = Math.floor(Math.random() * 100000);

      // Step 1: Upload image to Google AI
      console.log(`[Image to Video] Step 1: Uploading image to Google AI...`);
      const uploadPayload = {
        imageInput: {
          rawImageBytes: imageBase64,
          mimeType: mimeType
        }
      };

      const uploadResponse = await fetch('https://aisandbox-pa.googleapis.com/v1:uploadUserImage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(uploadPayload),
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error(`[Image to Video] Image upload failed: ${errorText}`);
        throw new Error(`Image upload failed: ${uploadResponse.statusText}`);
      }

      const uploadData = await uploadResponse.json();
      console.log(`[Image to Video] Upload response:`, JSON.stringify(uploadData, null, 2));
      
      // Google returns nested structure: { mediaGenerationId: { mediaGenerationId: "actual-id" } }
      const mediaGenId = uploadData.mediaGenerationId?.mediaGenerationId || uploadData.mediaGenerationId;

      if (!mediaGenId) {
        console.error(`[Image to Video] Invalid upload response:`, uploadData);
        throw new Error('No media generation ID returned from image upload');
      }

      console.log(`[Image to Video] Image uploaded successfully. Media ID: ${mediaGenId}`);

      // Upload the reference image to Cloudinary for storage
      console.log(`[Image to Video] Uploading reference image to Cloudinary...`);
      const referenceImageUrl = await uploadImageToCloudinary(imageBase64, mimeType.includes('jpeg') ? 'jpg' : 'png');

      // Step 2: Generate video with reference image
      console.log(`[Image to Video] Step 2: Generating video with reference image...`);
      const videoPayload = {
        clientContext: {
          projectId: veoProjectId,
          tool: "PINHOLE",
          userPaygateTier: "PAYGATE_TIER_TWO"
        },
        requests: [{
          aspectRatio: aspectRatio === "portrait" ? "VIDEO_ASPECT_RATIO_PORTRAIT" : "VIDEO_ASPECT_RATIO_LANDSCAPE",
          metadata: {
            sceneId: sceneId
          },
          referenceImages: [{
            imageUsageType: "IMAGE_USAGE_TYPE_ASSET",
            mediaId: mediaGenId
          }],
          textInput: {
            prompt: prompt
          },
          videoModelKey: "veo_3_0_r2v_fast_ultra"
        }]
      };

      console.log(`[Image to Video] Payload:`, JSON.stringify(videoPayload, null, 2));

      const videoResponse = await fetch('https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoReferenceImages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(videoPayload),
      });

      if (!videoResponse.ok) {
        const errorText = await videoResponse.text();
        console.error(`[Image to Video] Video generation failed (${videoResponse.status}): ${errorText}`);
        console.error(`[Image to Video] Failed payload was:`, JSON.stringify(videoPayload, null, 2));
        throw new Error(`Video generation failed: ${videoResponse.statusText} - ${errorText}`);
      }

      const videoData = await videoResponse.json();
      const operationName = videoData.operations?.[0]?.operation?.name;

      if (!operationName) {
        throw new Error('No operation name returned from VEO API');
      }

      console.log(`[Image to Video] Video generation started. Operation: ${operationName}`);

      // Create video history entry
      const historyEntry = await storage.addVideoHistory({
        userId,
        prompt,
        aspectRatio: aspectRatio === "portrait" ? "VIDEO_ASPECT_RATIO_PORTRAIT" : "VIDEO_ASPECT_RATIO_LANDSCAPE",
        status: 'pending',
        title: `Image to Video ${aspectRatio}`,
        tokenUsed: rotationToken?.id,
        referenceImageUrl: referenceImageUrl, // Store Cloudinary URL
      });

      res.json({
        operationName,
        sceneId,
        status: "PENDING",
        tokenId: rotationToken?.id || null,
        historyId: historyEntry.id
      });
    } catch (error) {
      console.error("Error in /api/generate-image-to-video:", error);
      
      // Record token error if we used a rotation token
      if (rotationToken) {
        storage.recordTokenError(rotationToken.id);
      }
      
      res.status(500).json({ 
        error: "Failed to start video generation from image",
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

      // Get API key using round-robin rotation based on scene number
      let apiKey: string | undefined;
      
      if (sceneNumber !== undefined && sceneNumber > 0) {
        // Use round-robin token selection based on scene number (0-indexed)
        rotationToken = await storage.getTokenByIndex(sceneNumber - 1);
        
        if (rotationToken) {
          apiKey = rotationToken.token;
          console.log(`[Token Rotation] Using token ${rotationToken.label} for video ${sceneNumber} (round-robin)`);
          await storage.updateTokenUsage(rotationToken.id);
        }
      } else {
        // For non-bulk generations, use the regular rotation
        rotationToken = await storage.getNextRotationToken();
        
        if (rotationToken) {
          apiKey = rotationToken.token;
          console.log(`[Token Rotation] Using token: ${rotationToken.label} (ID: ${rotationToken.id})`);
          await storage.updateTokenUsage(rotationToken.id);
        }
      }
      
      // Fallback to environment variable if no token available
      if (!apiKey) {
        apiKey = process.env.VEO3_API_KEY;
        console.log('[Token Rotation] No active tokens found, using environment variable VEO3_API_KEY');
      }

      if (!apiKey) {
        return res.status(500).json({ 
          error: "No API key configured. Please add tokens in the admin panel or set VEO3_API_KEY environment variable." 
        });
      }

      const veoProjectId = process.env.VEO3_PROJECT_ID || "5fdc3f34-d4c6-4afb-853a-aba4390bafdc";
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
          videoModelKey: aspectRatio === "portrait" ? "veo_3_1_t2v_fast_portrait_ultra" : "veo_3_1_t2v_fast_ultra",
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
                      videoModelKey: aspectRatio === "portrait" ? "veo_3_1_t2v_fast_portrait_ultra" : "veo_3_1_t2v_fast_ultra",
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
                  // Upload to Cloudinary before saving URL
                  try {
                    console.log(`[VEO Regenerate] Uploading video ${videoId} to Cloudinary...`);
                    const cloudinaryUrl = await uploadVideoToCloudinary(statusResult.videoUrl);
                    console.log(`[VEO Regenerate] Video ${videoId} uploaded to Cloudinary: ${cloudinaryUrl}`);
                    
                    // Update history with Cloudinary URL
                    await storage.updateVideoHistoryFields(videoId, {
                      videoUrl: cloudinaryUrl,
                      status: 'completed',
                    });
                    console.log(`[VEO Regenerate] Video ${videoId} completed successfully${hasRetriedWithNewToken ? ' (after token retry)' : ''}`);
                  } catch (uploadError) {
                    console.error(`[VEO Regenerate] Failed to upload video ${videoId} to Cloudinary:`, uploadError);
                    // Fall back to original URL if Cloudinary upload fails
                    await storage.updateVideoHistoryFields(videoId, {
                      videoUrl: statusResult.videoUrl,
                      status: 'completed',
                    });
                    console.log(`[VEO Regenerate] Video ${videoId} saved with original URL (Cloudinary upload failed)`);
                  }
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

  // Regenerate an image-to-video from history
  app.post("/api/regenerate-image-to-video", requireAuth, async (req, res) => {
    let rotationToken: Awaited<ReturnType<typeof storage.getNextRotationToken>> | undefined;
    
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const schema = z.object({
        videoId: z.string(),
        prompt: z.string().min(3, "Prompt must be at least 3 characters"),
        aspectRatio: z.enum(["landscape", "portrait"]).default("landscape"),
        referenceImageUrl: z.string().url("Invalid reference image URL"),
      });

      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: validationResult.error.errors 
        });
      }

      const { videoId, prompt, aspectRatio, referenceImageUrl } = validationResult.data;
      
      // Verify the video exists and belongs to the user
      const updatedVideo = await storage.updateVideoHistoryStatus(videoId, userId, 'pending');
      
      if (!updatedVideo) {
        return res.status(404).json({ 
          error: "Video not found or you don't have permission to regenerate it" 
        });
      }

      // Get API key from token rotation system
      rotationToken = await storage.getNextRotationToken();
      
      if (!rotationToken) {
        return res.status(500).json({ 
          error: "No API tokens configured. Please add tokens in the admin panel." 
        });
      }

      const apiKey = rotationToken.token;
      console.log(`[Image to Video Regenerate] Using token: ${rotationToken.label} (ID: ${rotationToken.id})`);
      await storage.updateTokenUsage(rotationToken.id);

      const veoProjectId = process.env.VEO3_PROJECT_ID || "5fdc3f34-d4c6-4afb-853a-aba4390bafdc";
      const sceneId = crypto.randomUUID();

      // Fetch the image from Cloudinary
      console.log(`[Image to Video Regenerate] Fetching image from: ${referenceImageUrl}`);
      const imageResponse = await fetch(referenceImageUrl);
      
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image from Cloudinary: ${imageResponse.statusText}`);
      }

      const imageBuffer = await imageResponse.arrayBuffer();
      const imageBase64 = Buffer.from(imageBuffer).toString('base64');
      
      // Detect mime type from URL or default to jpeg
      const mimeType = referenceImageUrl.includes('.png') ? 'image/png' : 'image/jpeg';

      // Step 1: Upload image to Google AI
      console.log(`[Image to Video Regenerate] Step 1: Uploading image to Google AI...`);
      const uploadPayload = {
        imageInput: {
          rawImageBytes: imageBase64,
          mimeType: mimeType
        }
      };

      const uploadResponse = await fetch('https://aisandbox-pa.googleapis.com/v1:uploadUserImage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(uploadPayload),
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error(`[Image to Video Regenerate] Image upload failed: ${errorText}`);
        throw new Error(`Image upload failed: ${uploadResponse.statusText}`);
      }

      const uploadData = await uploadResponse.json();
      const mediaGenId = uploadData.mediaGenerationId?.mediaGenerationId || uploadData.mediaGenerationId;

      if (!mediaGenId) {
        throw new Error('No media generation ID returned from image upload');
      }

      console.log(`[Image to Video Regenerate] Image uploaded. Media ID: ${mediaGenId}`);

      // Step 2: Generate video with reference image
      console.log(`[Image to Video Regenerate] Step 2: Generating video...`);
      const videoPayload = {
        clientContext: {
          projectId: veoProjectId,
          tool: "PINHOLE",
          userPaygateTier: "PAYGATE_TIER_TWO"
        },
        requests: [{
          aspectRatio: aspectRatio === "portrait" ? "VIDEO_ASPECT_RATIO_PORTRAIT" : "VIDEO_ASPECT_RATIO_LANDSCAPE",
          metadata: {
            sceneId: sceneId
          },
          referenceImages: [{
            imageUsageType: "IMAGE_USAGE_TYPE_ASSET",
            mediaId: mediaGenId
          }],
          textInput: {
            prompt: prompt
          },
          videoModelKey: "veo_3_0_r2v_fast_ultra"
        }]
      };

      const videoResponse = await fetch('https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoReferenceImages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(videoPayload),
      });

      if (!videoResponse.ok) {
        const errorText = await videoResponse.text();
        console.error(`[Image to Video Regenerate] Video generation failed: ${errorText}`);
        throw new Error(`Video generation failed: ${videoResponse.statusText}`);
      }

      const videoData = await videoResponse.json();
      const operationName = videoData.operations?.[0]?.operation?.name;

      if (!operationName) {
        throw new Error('No operation name returned from VEO API');
      }

      console.log(`[Image to Video Regenerate] Video generation started. Operation: ${operationName}`);

      // Start background polling
      (async () => {
        try {
          const maxWaitTime = 4 * 60 * 1000; // 4 minutes timeout
          const pollInterval = 3000; // Poll every 3 seconds
          const startTime = Date.now();
          let completed = false;
          let currentOperationName = operationName;
          let currentSceneId = sceneId;
          let currentApiKey = apiKey;
          let currentRotationToken = rotationToken;

          while (!completed && (Date.now() - startTime) < maxWaitTime) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));

            try {
              const statusResult = await checkVideoStatus(currentOperationName, currentSceneId, currentApiKey);

              if (statusResult.status === 'COMPLETED' || 
                  statusResult.status === 'MEDIA_GENERATION_STATUS_COMPLETE' || 
                  statusResult.status === 'MEDIA_GENERATION_STATUS_SUCCESSFUL') {
                completed = true;
                
                if (statusResult.videoUrl) {
                  try {
                    console.log(`[Image to Video Regenerate] Uploading video ${videoId} to Cloudinary...`);
                    const cloudinaryUrl = await uploadVideoToCloudinary(statusResult.videoUrl);
                    console.log(`[Image to Video Regenerate] Video ${videoId} uploaded to Cloudinary: ${cloudinaryUrl}`);
                    
                    await storage.updateVideoHistoryFields(videoId, {
                      videoUrl: cloudinaryUrl,
                      status: 'completed',
                    });
                    console.log(`[Image to Video Regenerate] Video ${videoId} completed successfully`);
                  } catch (uploadError) {
                    console.error(`[Image to Video Regenerate] Failed to upload video ${videoId} to Cloudinary:`, uploadError);
                    await storage.updateVideoHistoryFields(videoId, {
                      videoUrl: statusResult.videoUrl,
                      status: 'completed',
                    });
                  }
                }
              } else if (statusResult.status === 'FAILED' || 
                         statusResult.status === 'MEDIA_GENERATION_STATUS_FAILED') {
                completed = true;
                await storage.updateVideoHistoryFields(videoId, { status: 'failed' });
                console.error(`[Image to Video Regenerate] Video ${videoId} failed`);
                
                if (currentRotationToken) {
                  storage.recordTokenError(currentRotationToken.id);
                }
              }
            } catch (pollError) {
              console.error(`[Image to Video Regenerate] Error polling status for ${videoId}:`, pollError);
            }
          }

          // Timeout - mark as failed
          if (!completed) {
            console.error(`[Image to Video Regenerate] Video ${videoId} timed out after 4 minutes`);
            await storage.updateVideoHistoryFields(videoId, { status: 'failed' });
            
            if (currentRotationToken) {
              storage.recordTokenError(currentRotationToken.id);
            }
          }
        } catch (bgError) {
          console.error(`[Image to Video Regenerate] Background polling error for ${videoId}:`, bgError);
        }
      })();

      res.json({
        success: true,
        operationName,
        sceneId,
        videoId,
        message: "Image to video regeneration started",
        tokenId: rotationToken?.id || null,
        tokenLabel: rotationToken?.label || null
      });
    } catch (error) {
      console.error("Error in /api/regenerate-image-to-video:", error);
      
      if (rotationToken) {
        storage.recordTokenError(rotationToken.id);
      }
      
      res.status(500).json({ 
        error: "Failed to regenerate image to video",
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


  // Merge all videos into one
  app.post("/api/merge-videos", requireAuth, async (req, res) => {
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

  // Merge selected videos from history using FFmpeg
  app.post("/api/merge-selected-videos", requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        videoIds: z.array(z.string()).min(2).max(18)
      });

      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: validationResult.error.errors 
        });
      }

      const { videoIds } = validationResult.data;
      const userId = req.session.userId!;

      console.log(`[Merge Selected] Starting FFmpeg merge of ${videoIds.length} selected videos for user ${userId}`);

      // Security: Verify all videos belong to the authenticated user
      const userVideos = await storage.getUserVideoHistory(userId);
      const videoUrls: string[] = [];

      for (const videoId of videoIds) {
        const video = userVideos.find(v => v.id === videoId);
        
        if (!video) {
          return res.status(403).json({ 
            error: "Forbidden",
            message: `Video ${videoId} not found or does not belong to you`
          });
        }

        if (video.status !== 'completed' || !video.videoUrl) {
          return res.status(400).json({ 
            error: "Invalid video",
            message: `Video ${videoId} is not completed or has no URL`
          });
        }

        // Additional security: Verify URL is from trusted sources (Cloudinary or Google Cloud Storage)
        const isCloudinary = video.videoUrl.startsWith('https://res.cloudinary.com/');
        const isGoogleStorage = video.videoUrl.startsWith('https://storage.googleapis.com/');
        if (!isCloudinary && !isGoogleStorage) {
          return res.status(400).json({ 
            error: "Invalid video URL",
            message: `Video ${videoId} has an invalid URL`
          });
        }

        // If video is from Google Cloud Storage, migrate it to Cloudinary first
        let finalVideoUrl = video.videoUrl;
        if (isGoogleStorage) {
          console.log(`[Merge Selected] Migrating video ${videoId} from Google Cloud Storage to Cloudinary...`);
          try {
            const { uploadVideoToCloudinary } = await import('./cloudinary');
            const cloudinaryUrl = await uploadVideoToCloudinary(video.videoUrl);
            
            // Update video history with new Cloudinary URL
            await storage.updateVideoHistoryFields(videoId, {
              videoUrl: cloudinaryUrl,
            });
            
            finalVideoUrl = cloudinaryUrl;
            console.log(`[Merge Selected] Migration successful for video ${videoId}`);
          } catch (uploadError) {
            console.error(`[Merge Selected] Failed to migrate video ${videoId}:`, uploadError);
            throw new Error(`Failed to migrate video to Cloudinary: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`);
          }
        }

        videoUrls.push(finalVideoUrl);
      }

      console.log(`[Merge Selected] All videos verified and migrated to Cloudinary, proceeding with merge`);

      // Create a video history entry for this merge operation
      const mergeHistoryEntry = await storage.addVideoHistory({
        userId,
        prompt: `Merged video from ${videoIds.length} selected videos`,
        aspectRatio: "16:9",
        status: "pending",
        metadata: JSON.stringify({ mergedVideoIds: videoIds }),
        title: `Merged Video (${videoIds.length} clips)`,
      });

      try {
        // Import the FFmpeg merger function
        const { mergeVideosWithFFmpeg } = await import('./videoMergerFFmpeg');
        
        // Merge videos using local FFmpeg
        const mergedVideoUrl = await mergeVideosWithFFmpeg(videoUrls);
        console.log(`[Merge Selected] Videos merged successfully with FFmpeg`);
        console.log(`[Merge Selected] Merged video URL: ${mergedVideoUrl}`);

        // Update the video history entry with success
        await storage.updateVideoHistoryFields(mergeHistoryEntry.id, {
          status: 'completed',
          videoUrl: mergedVideoUrl,
        });

        res.json({ 
          success: true,
          mergedVideoUrl: mergedVideoUrl,
          historyId: mergeHistoryEntry.id
        });
      } catch (mergeError) {
        console.error("[Merge Selected] Merge failed:", mergeError);
        
        // Update the video history entry with failure
        await storage.updateVideoHistoryFields(mergeHistoryEntry.id, {
          status: 'failed',
        });

        throw mergeError;
      }
    } catch (error) {
      console.error("Error in /api/merge-selected-videos:", error);
      res.status(500).json({ 
        error: "Failed to merge selected videos",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Retry a failed merge operation
  app.post("/api/retry-merge/:id", requireAuth, async (req, res) => {
    try {
      const videoId = req.params.id;
      const userId = req.session.userId!;

      console.log(`[Retry Merge] Starting retry for merge video ${videoId} by user ${userId}`);

      // Get the video history entry
      const userVideos = await storage.getUserVideoHistory(userId);
      const mergeVideo = userVideos.find(v => v.id === videoId);

      if (!mergeVideo) {
        return res.status(404).json({ 
          error: "Video not found",
          message: "Merge video not found or does not belong to you"
        });
      }

      // Parse metadata to get original video IDs
      if (!mergeVideo.metadata) {
        return res.status(400).json({ 
          error: "Invalid merge video",
          message: "This video does not have merge metadata"
        });
      }

      const metadata = JSON.parse(mergeVideo.metadata);
      const videoIds = metadata.mergedVideoIds as string[];

      if (!videoIds || !Array.isArray(videoIds) || videoIds.length < 2) {
        return res.status(400).json({ 
          error: "Invalid metadata",
          message: "Merge metadata is invalid or missing video IDs"
        });
      }

      console.log(`[Retry Merge] Retrying merge of ${videoIds.length} videos`);

      // Verify all videos still exist and are completed
      const videoUrls: string[] = [];
      for (const id of videoIds) {
        const video = userVideos.find(v => v.id === id);
        
        if (!video || video.status !== 'completed' || !video.videoUrl) {
          return res.status(400).json({ 
            error: "Invalid source videos",
            message: `One or more source videos are no longer available or completed`
          });
        }

        // Verify URL is from trusted sources (Cloudinary or Google Cloud Storage)
        const isCloudinary = video.videoUrl.startsWith('https://res.cloudinary.com/');
        const isGoogleStorage = video.videoUrl.startsWith('https://storage.googleapis.com/');
        if (!isCloudinary && !isGoogleStorage) {
          return res.status(400).json({ 
            error: "Invalid video URL",
            message: `Video ${id} has an invalid URL`
          });
        }

        // If video is from Google Cloud Storage, migrate it to Cloudinary first
        let finalVideoUrl = video.videoUrl;
        if (isGoogleStorage) {
          console.log(`[Retry Merge] Migrating video ${id} from Google Cloud Storage to Cloudinary...`);
          try {
            const { uploadVideoToCloudinary } = await import('./cloudinary');
            const cloudinaryUrl = await uploadVideoToCloudinary(video.videoUrl);
            
            // Update video history with new Cloudinary URL
            await storage.updateVideoHistoryFields(id, {
              videoUrl: cloudinaryUrl,
            });
            
            finalVideoUrl = cloudinaryUrl;
            console.log(`[Retry Merge] Migration successful for video ${id}`);
          } catch (uploadError) {
            console.error(`[Retry Merge] Failed to migrate video ${id}:`, uploadError);
            throw new Error(`Failed to migrate video to Cloudinary: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`);
          }
        }

        videoUrls.push(finalVideoUrl);
      }

      // Update status to pending
      await storage.updateVideoHistoryFields(videoId, {
        status: 'pending',
        videoUrl: null,
      });

      // Send immediate response
      res.json({ 
        success: true,
        message: "Merge retry started",
        videoId: videoId
      });

      // Perform merge in background
      (async () => {
        try {
          const { mergeVideosWithFFmpeg } = await import('./videoMergerFFmpeg');
          const mergedVideoUrl = await mergeVideosWithFFmpeg(videoUrls);
          
          console.log(`[Retry Merge] Retry successful for video ${videoId}`);
          
          await storage.updateVideoHistoryFields(videoId, {
            status: 'completed',
            videoUrl: mergedVideoUrl,
          });
        } catch (mergeError) {
          console.error(`[Retry Merge] Retry failed for video ${videoId}:`, mergeError);
          
          await storage.updateVideoHistoryFields(videoId, {
            status: 'failed',
          });
        }
      })();

    } catch (error) {
      console.error("Error in /api/retry-merge:", error);
      res.status(500).json({ 
        error: "Failed to retry merge",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Merge videos with FFmpeg and store temporarily (24 hours)
  app.post("/api/merge-videos-temporary", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { videoIds, expiryHours = 24 } = req.body;

      if (!Array.isArray(videoIds) || videoIds.length < 2) {
        return res.status(400).json({ 
          error: "Invalid input",
          message: "Please provide at least 2 video IDs to merge"
        });
      }

      if (videoIds.length > 18) {
        return res.status(400).json({ 
          error: "Too many videos",
          message: "Cannot merge more than 18 videos at once"
        });
      }

      console.log(`[Merge Temporary] Starting temporary merge of ${videoIds.length} videos for user ${userId}`);

      // Get all user videos
      const userVideos = await storage.getUserVideoHistory(userId);

      // Verify all videos exist and are completed
      const videoUrls: string[] = [];
      for (const id of videoIds) {
        const video = userVideos.find(v => v.id === id);
        
        if (!video || video.status !== 'completed' || !video.videoUrl) {
          return res.status(400).json({ 
            error: "Invalid video selection",
            message: `Video ${id} is not available or not completed`
          });
        }

        // Verify URL is from trusted sources (Cloudinary or Google Cloud Storage)
        const isCloudinary = video.videoUrl.startsWith('https://res.cloudinary.com/');
        const isGoogleStorage = video.videoUrl.startsWith('https://storage.googleapis.com/');
        if (!isCloudinary && !isGoogleStorage) {
          return res.status(400).json({ 
            error: "Invalid video URL",
            message: `Video ${id} has an invalid URL`
          });
        }

        // If video is from Google Cloud Storage, migrate it to Cloudinary first
        let finalVideoUrl = video.videoUrl;
        if (isGoogleStorage) {
          console.log(`[Merge Temporary] Migrating video ${id} from Google Cloud Storage to Cloudinary...`);
          try {
            const { uploadVideoToCloudinary } = await import('./cloudinary');
            const cloudinaryUrl = await uploadVideoToCloudinary(video.videoUrl);
            
            // Update video history with new Cloudinary URL
            await storage.updateVideoHistoryFields(id, {
              videoUrl: cloudinaryUrl,
            });
            
            finalVideoUrl = cloudinaryUrl;
            console.log(`[Merge Temporary] Migration successful for video ${id}`);
          } catch (uploadError) {
            console.error(`[Merge Temporary] Failed to migrate video ${id}:`, uploadError);
            throw new Error(`Failed to migrate video to Cloudinary: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`);
          }
        }

        videoUrls.push(finalVideoUrl);
      }

      console.log(`[Merge Temporary] All videos verified and migrated to Cloudinary, starting FFmpeg merge`);

      // Merge videos using FFmpeg with temporary storage
      const { mergeVideosWithFFmpegTemporary } = await import('./videoMergerFFmpeg');
      const { videoPath, expiresAt } = await mergeVideosWithFFmpegTemporary(videoUrls, expiryHours);

      console.log(`[Merge Temporary] Merge complete!`);
      console.log(`[Merge Temporary] Video path: ${videoPath}`);
      console.log(`[Merge Temporary] Expires at: ${expiresAt}`);

      res.json({ 
        success: true,
        videoPath,
        expiresAt,
        previewUrl: videoPath,
        message: `Video will be available for ${expiryHours} hours`
      });

    } catch (error) {
      console.error("Error in /api/merge-videos-temporary:", error);
      res.status(500).json({ 
        error: "Failed to merge videos temporarily",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get temporary video expiry information
  app.get("/api/temp-video-info", requireAuth, async (req, res) => {
    try {
      const { videoPath } = req.query;

      if (!videoPath || typeof videoPath !== 'string') {
        return res.status(400).json({ 
          error: "Invalid input",
          message: "videoPath is required"
        });
      }

      const { ObjectStorageService } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      
      const info = await objectStorageService.getVideoExpiryInfo(videoPath);

      res.json({ 
        success: true,
        ...info
      });

    } catch (error) {
      console.error("Error in /api/temp-video-info:", error);
      res.status(500).json({ 
        error: "Failed to get video info",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Cleanup expired temporary videos (admin only)
  app.post("/api/cleanup-expired-videos", requireAdmin, async (req, res) => {
    try {
      console.log(`[Cleanup] Starting cleanup of expired videos`);

      const { ObjectStorageService } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      
      const deletedCount = await objectStorageService.cleanupExpiredVideos();

      console.log(`[Cleanup] Cleanup complete, deleted ${deletedCount} videos`);

      res.json({ 
        success: true,
        deletedCount,
        message: `Deleted ${deletedCount} expired videos`
      });

    } catch (error) {
      console.error("Error in /api/cleanup-expired-videos:", error);
      res.status(500).json({ 
        error: "Failed to cleanup expired videos",
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
