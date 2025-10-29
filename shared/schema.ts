import { sql } from "drizzle-orm";
import { pgTable, text, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Character schema for the story
export const characterSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Character name is required"),
  description: z.string().min(1, "Character description is required"),
});

export type Character = z.infer<typeof characterSchema>;

// Story input schema
export const storyInputSchema = z.object({
  script: z.string().min(50, "Script must be at least 50 characters"),
  characters: z.array(characterSchema).min(1, "At least one character is required"),
});

export type StoryInput = z.infer<typeof storyInputSchema>;

// Scene schema for generated output
export const sceneSchema = z.object({
  scene: z.number(),
  title: z.string(),
  description: z.string(),
});

export type Scene = z.infer<typeof sceneSchema>;
