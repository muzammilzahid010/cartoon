import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  planType: text("plan_type").notNull().default("free"),
  planStatus: text("plan_status").notNull().default("active"),
  planExpiry: text("plan_expiry").default(sql`null`),
  apiToken: text("api_token").default(sql`null`),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  isAdmin: true,
});

export const updateUserPlanSchema = z.object({
  planType: z.enum(["free", "basic", "premium"]),
  planStatus: z.enum(["active", "expired", "cancelled"]),
  planExpiry: z.string().optional(),
});

export const updateUserApiTokenSchema = z.object({
  apiToken: z.string(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type UpdateUserPlan = z.infer<typeof updateUserPlanSchema>;
export type UpdateUserApiToken = z.infer<typeof updateUserApiTokenSchema>;

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

// API Token Pool for automatic rotation
export const apiTokens = pgTable("api_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  token: text("token").notNull().unique(),
  label: text("label").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: text("last_used_at"),
  requestCount: text("request_count").notNull().default("0"),
  createdAt: text("created_at").notNull().default(sql`now()::text`),
});

// Token rotation settings
export const tokenSettings = pgTable("token_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rotationEnabled: boolean("rotation_enabled").notNull().default(false),
  rotationIntervalMinutes: text("rotation_interval_minutes").notNull().default("60"),
  maxRequestsPerToken: text("max_requests_per_token").notNull().default("1000"),
  videosPerBatch: text("videos_per_batch").notNull().default("10"),
  batchDelaySeconds: text("batch_delay_seconds").notNull().default("20"),
});

export const insertApiTokenSchema = createInsertSchema(apiTokens).pick({
  token: true,
  label: true,
});

export const bulkReplaceTokensSchema = z.object({
  tokens: z.string().min(1, "Please enter at least one token"),
});

export const updateTokenSettingsSchema = z.object({
  rotationEnabled: z.boolean(),
  rotationIntervalMinutes: z.string(),
  maxRequestsPerToken: z.string(),
  videosPerBatch: z.string(),
  batchDelaySeconds: z.string(),
});

export type ApiToken = typeof apiTokens.$inferSelect;
export type InsertApiToken = z.infer<typeof insertApiTokenSchema>;
export type BulkReplaceTokens = z.infer<typeof bulkReplaceTokensSchema>;
export type TokenSettings = typeof tokenSettings.$inferSelect;
export type UpdateTokenSettings = z.infer<typeof updateTokenSettingsSchema>;

// Video history schema for storing generated videos
export const videoHistory = pgTable("video_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  prompt: text("prompt").notNull(),
  aspectRatio: text("aspect_ratio").notNull(),
  videoUrl: text("video_url"),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull().default(sql`now()::text`),
  title: text("title"),
  tokenUsed: varchar("token_used").references(() => apiTokens.id),
  metadata: text("metadata"), // JSON string for merge info: { mergedVideoIds: string[] }
  errorMessage: text("error_message"), // Store error details for failed videos
  referenceImageUrl: text("reference_image_url"), // Reference image for image-to-video generation
});

export const insertVideoHistorySchema = createInsertSchema(videoHistory).omit({
  id: true,
  createdAt: true,
});

export type VideoHistory = typeof videoHistory.$inferSelect;
export type InsertVideoHistory = z.infer<typeof insertVideoHistorySchema>;
