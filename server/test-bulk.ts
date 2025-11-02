#!/usr/bin/env tsx
/**
 * Test script for bulk video generation
 * Usage: tsx server/test-bulk.ts
 */

import { storage } from "./storage";
import fs from "fs";
import path from "path";

async function testBulkGeneration() {
  console.log("\n🧪 BULK VIDEO GENERATION TEST SUITE");
  console.log("====================================\n");
  
  // Read test prompts
  const promptsFile = path.join(process.cwd(), "test_prompts.txt");
  const prompts = fs.readFileSync(promptsFile, "utf-8")
    .split("\n")
    .filter(line => line.trim().length > 0);
  
  console.log(`📝 Loaded ${prompts.length} test prompts`);
  
  // Check API tokens
  const tokens = await storage.getActiveApiTokens();
  console.log(`🔑 Found ${tokens.length} active API tokens`);
  tokens.forEach(token => {
    console.log(`   - ${token.label}: ${token.requestCount} requests`);
  });
  
  // Simulate bulk generation request
  console.log("\n🚀 Starting test with following configuration:");
  console.log(`   - Number of videos: ${prompts.length}`);
  console.log(`   - Aspect ratio: landscape`);
  console.log(`   - Token rotation: Round-robin across ${tokens.length} tokens`);
  console.log(`   - Delay between requests: 20 seconds`);
  console.log(`   - Expected completion time: ~${Math.ceil(prompts.length * 20 / 60)} minutes`);
  
  // Calculate token distribution
  const tokensPerVideo = prompts.length / tokens.length;
  console.log(`\n📊 Expected token distribution:`);
  console.log(`   - Each token will handle ~${Math.ceil(tokensPerVideo)} videos`);
  
  // Check current queue status
  const { getQueueStatus } = await import("./bulkQueue");
  const queueStatus = getQueueStatus();
  console.log(`\n📦 Current queue status:`);
  console.log(`   - Queue length: ${queueStatus.queueLength}`);
  console.log(`   - Processing: ${queueStatus.isProcessing}`);
  
  // Check pending videos in database
  const db = await import("./db").then(m => m.db);
  const { videoHistory } = await import("@shared/schema");
  const { sql } = await import("drizzle-orm");
  
  const pendingCount = await db.execute(sql`
    SELECT COUNT(*) as count 
    FROM video_history 
    WHERE status = 'pending'
  `);
  
  console.log(`\n🔄 Pending videos in database: ${pendingCount.rows[0].count}`);
  
  // Monitor performance
  console.log("\n⚡ Performance metrics to monitor:");
  console.log("   1. Request timeout errors (30 second timeout)");
  console.log("   2. VEO API errors (rate limits, quota)");
  console.log("   3. Token rotation fairness");
  console.log("   4. Memory usage");
  console.log("   5. Queue processing speed");
  
  // Check memory usage
  const memUsage = process.memoryUsage();
  console.log(`\n💾 Current memory usage:`);
  console.log(`   - RSS: ${Math.round(memUsage.rss / 1024 / 1024)} MB`);
  console.log(`   - Heap: ${Math.round(memUsage.heapUsed / 1024 / 1024)} MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`);
  
  console.log("\n✅ Test configuration complete!");
  console.log("📌 Next steps:");
  console.log("   1. Go to Bulk Video Generator page");
  console.log("   2. Paste the test prompts from test_prompts.txt");
  console.log("   3. Click Generate");
  console.log("   4. Monitor Video History page for progress");
  console.log("   5. Check Admin panel for token statistics");
  console.log("   6. Watch server logs for any errors");
  
  // Clean up old failed videos
  const cleanupResult = await db.execute(sql`
    UPDATE video_history 
    SET status = 'failed', 
        error_message = 'Cleaned up old stuck video'
    WHERE status = 'pending' 
    AND (NOW() - created_at::timestamp) > INTERVAL '10 minutes'
    RETURNING id
  `);
  
  if (cleanupResult.rowCount && cleanupResult.rowCount > 0) {
    console.log(`\n🧹 Cleaned up ${cleanupResult.rowCount} old stuck videos`);
  }
  
  console.log("\n====================================");
  console.log("🏁 Test suite ready! You can now start the bulk generation.\n");
}

// Run the test
testBulkGeneration().catch(console.error);