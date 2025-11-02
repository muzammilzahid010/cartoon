import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import MemoryStore from "memorystore";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

const MemoryStoreSession = MemoryStore(session);

app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    store: new MemoryStoreSession({
      checkPeriod: 86400000,
    }),
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
    },
  })
);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize database, default admin user, and token settings
  const { storage } = await import("./storage");
  await storage.initializeDefaultAdmin();
  await storage.initializeTokenSettings();
  
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Daily cleanup job - runs at midnight Pakistan time (UTC+5)
  // Initialize to empty string so cleanup runs on first midnight after server start
  let lastCleanupDate = '';
  
  const checkAndCleanupHistory = async () => {
    try {
      const now = new Date();
      const pktTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
      const currentDate = pktTime.toLocaleDateString('en-US', { timeZone: 'Asia/Karachi' });
      const currentHour = pktTime.getHours();
      const currentMinute = pktTime.getMinutes();
      
      // Check if it's midnight (00:00-00:01) and we haven't run cleanup today
      if (currentHour === 0 && currentMinute === 0 && currentDate !== lastCleanupDate) {
        console.log(`[Daily Cleanup] Running cleanup tasks at midnight PKT (${currentDate})`);
        
        // Cleanup video history
        await storage.clearAllVideoHistory();
        console.log('[Daily Cleanup] Video history cleared successfully');
        
        // Cleanup expired temporary videos
        try {
          const { ObjectStorageService } = await import('./objectStorage');
          const objectStorageService = new ObjectStorageService();
          const deletedCount = await objectStorageService.cleanupExpiredVideos();
          console.log(`[Daily Cleanup] Deleted ${deletedCount} expired temporary videos`);
        } catch (tempVideoError) {
          console.error('[Daily Cleanup] Error cleaning up temporary videos:', tempVideoError);
        }
        
        lastCleanupDate = currentDate;
        console.log('[Daily Cleanup] All cleanup tasks completed');
      }
    } catch (error) {
      console.error('[Daily Cleanup] Error during cleanup:', error);
    }
  };
  
  // Also run temporary video cleanup every hour (independent of midnight cleanup)
  const checkAndCleanupTempVideos = async () => {
    try {
      const { ObjectStorageService } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      const deletedCount = await objectStorageService.cleanupExpiredVideos();
      if (deletedCount > 0) {
        console.log(`[Hourly Cleanup] Deleted ${deletedCount} expired temporary videos`);
      }
    } catch (error) {
      console.error('[Hourly Cleanup] Error cleaning up temporary videos:', error);
    }
  };
  
  // Run daily cleanup check every minute
  setInterval(checkAndCleanupHistory, 60000);
  console.log('[Daily Cleanup] History cleanup job scheduled for midnight PKT');
  
  // Run temporary video cleanup every hour
  setInterval(checkAndCleanupTempVideos, 60 * 60 * 1000);
  console.log('[Hourly Cleanup] Temporary video cleanup scheduled (runs every hour)');

  // Timeout cleanup for stuck pending videos
  const checkAndTimeoutPendingVideos = async () => {
    try {
      const { db } = await import('./db');
      const { videoHistory } = await import('@shared/schema');
      const { sql } = await import('drizzle-orm');
      
      const result = await db.execute(sql`
        UPDATE video_history 
        SET status = 'failed' 
        WHERE status = 'pending' 
        AND (NOW() - created_at::timestamp) > INTERVAL '4 minutes'
        RETURNING id
      `);
      
      const count = result.rowCount || 0;
      if (count > 0) {
        console.log(`[Timeout Cleanup] Marked ${count} stuck videos as failed (pending > 4 minutes)`);
      }
    } catch (error) {
      console.error('[Timeout Cleanup] Error timing out pending videos:', error);
    }
  };
  
  // Run timeout cleanup every 2 minutes
  setInterval(checkAndTimeoutPendingVideos, 2 * 60 * 1000);
  console.log('[Timeout Cleanup] Pending video timeout job scheduled (runs every 2 minutes)');

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
