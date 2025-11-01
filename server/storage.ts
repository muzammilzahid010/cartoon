import {
  type User,
  type InsertUser,
  type UpdateUserPlan,
  type UpdateUserApiToken,
  type ApiToken,
  type InsertApiToken,
  type TokenSettings,
  type UpdateTokenSettings,
  type VideoHistory,
  type InsertVideoHistory,
  type Project,
  type InsertProject,
  users,
  apiTokens,
  tokenSettings,
  videoHistory,
  projects,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

// Token error tracking: tokenId -> array of error timestamps
const tokenErrorTracking = new Map<string, number[]>();
// Token cooldown: tokenId -> cooldown end timestamp
const tokenCooldowns = new Map<string, number>();

const ERROR_THRESHOLD = 5; // Max errors allowed
const ERROR_WINDOW_MS = 20 * 60 * 1000; // 20 minutes in milliseconds
const COOLDOWN_DURATION_MS = 60 * 60 * 1000; // 1 hour in milliseconds

// Storage interface for user operations
export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUserPlan(userId: string, plan: UpdateUserPlan): Promise<User | undefined>;
  updateUserApiToken(userId: string, token: UpdateUserApiToken): Promise<User | undefined>;
  verifyPassword(user: User, password: string): Promise<boolean>;
  initializeDefaultAdmin(): Promise<void>;
  
  // Token pool management
  getAllApiTokens(): Promise<ApiToken[]>;
  getActiveApiTokens(): Promise<ApiToken[]>;
  addApiToken(token: InsertApiToken): Promise<ApiToken>;
  deleteApiToken(tokenId: string): Promise<void>;
  toggleApiTokenStatus(tokenId: string, isActive: boolean): Promise<ApiToken | undefined>;
  getNextRotationToken(): Promise<ApiToken | undefined>;
  updateTokenUsage(tokenId: string): Promise<void>;
  replaceAllTokens(tokens: string[]): Promise<ApiToken[]>;
  recordTokenError(tokenId: string): void;
  isTokenInCooldown(tokenId: string): boolean;
  
  // Token settings
  getTokenSettings(): Promise<TokenSettings | undefined>;
  updateTokenSettings(settings: UpdateTokenSettings): Promise<TokenSettings>;
  initializeTokenSettings(): Promise<void>;
  
  // Video history
  getUserVideoHistory(userId: string): Promise<VideoHistory[]>;
  addVideoHistory(video: InsertVideoHistory): Promise<VideoHistory>;
  updateVideoHistoryStatus(videoId: string, userId: string, status: string, videoUrl?: string): Promise<VideoHistory | undefined>;
  
  // Projects
  getUserProjects(userId: string): Promise<Project[]>;
  getProject(projectId: string, userId: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(projectId: string, userId: string, updates: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(projectId: string, userId: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const hashedPassword = await bcrypt.hash(insertUser.password, SALT_ROUNDS);
    const [user] = await db
      .insert(users)
      .values({
        username: insertUser.username,
        password: hashedPassword,
        isAdmin: insertUser.isAdmin ?? false,
      })
      .returning();
    return user;
  }

  async updateUserPlan(userId: string, plan: UpdateUserPlan): Promise<User | undefined> {
    try {
      const [updatedUser] = await db
        .update(users)
        .set({
          planType: plan.planType,
          planStatus: plan.planStatus,
          planExpiry: plan.planExpiry || null,
        })
        .where(eq(users.id, userId))
        .returning();
      
      return updatedUser || undefined;
    } catch (error) {
      console.error("Error updating user plan:", error);
      throw error;
    }
  }

  async updateUserApiToken(userId: string, token: UpdateUserApiToken): Promise<User | undefined> {
    try {
      const [updatedUser] = await db
        .update(users)
        .set({
          apiToken: token.apiToken,
        })
        .where(eq(users.id, userId))
        .returning();
      
      return updatedUser || undefined;
    } catch (error) {
      console.error("Error updating user API token:", error);
      throw error;
    }
  }

  async verifyPassword(user: User, password: string): Promise<boolean> {
    return await bcrypt.compare(password, user.password);
  }

  async initializeDefaultAdmin(): Promise<void> {
    try {
      // Check if default admin already exists
      const existingAdmin = await this.getUserByUsername("muzi");
      
      if (!existingAdmin) {
        // Create default admin user
        const hashedPassword = await bcrypt.hash("muzi123", SALT_ROUNDS);
        await db.insert(users).values({
          username: "muzi",
          password: hashedPassword,
          isAdmin: true,
          planType: "premium",
          planStatus: "active",
        });
        console.log("✓ Default admin user created (username: muzi, password: muzi123)");
      }
    } catch (error) {
      // If unique constraint error, admin already exists (race condition)
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        console.log("✓ Default admin user already exists");
      } else {
        console.error("Error initializing default admin:", error);
        throw error;
      }
    }
  }

  // Token pool management methods
  async getAllApiTokens(): Promise<ApiToken[]> {
    return await db.select().from(apiTokens).orderBy(desc(apiTokens.createdAt));
  }

  async getActiveApiTokens(): Promise<ApiToken[]> {
    return await db.select().from(apiTokens).where(eq(apiTokens.isActive, true));
  }

  async addApiToken(token: InsertApiToken): Promise<ApiToken> {
    const [newToken] = await db.insert(apiTokens).values(token).returning();
    return newToken;
  }

  async deleteApiToken(tokenId: string): Promise<void> {
    await db.delete(apiTokens).where(eq(apiTokens.id, tokenId));
  }

  async toggleApiTokenStatus(tokenId: string, isActive: boolean): Promise<ApiToken | undefined> {
    const [updatedToken] = await db
      .update(apiTokens)
      .set({ isActive })
      .where(eq(apiTokens.id, tokenId))
      .returning();
    return updatedToken || undefined;
  }

  async getNextRotationToken(): Promise<ApiToken | undefined> {
    // Get active tokens ordered by least recently used
    const tokens = await db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.isActive, true))
      .orderBy(apiTokens.lastUsedAt);
    
    // Filter out tokens in cooldown or close to error threshold
    // Use threshold-1 to prevent race conditions with concurrent requests
    const SAFE_THRESHOLD = ERROR_THRESHOLD - 1;
    
    for (const token of tokens) {
      if (this.isTokenInCooldown(token.id)) {
        console.log(`[Token Rotation] Skipping token ${token.id} - in cooldown`);
        continue;
      }
      
      const errorCount = this.getRecentErrorCount(token.id);
      if (errorCount >= SAFE_THRESHOLD) {
        console.log(`[Token Rotation] Skipping token ${token.id} - ${errorCount}/${ERROR_THRESHOLD} errors (too close to threshold)`);
        continue;
      }
      
      return token;
    }
    
    console.log('[Token Rotation] All active tokens are in cooldown or near error threshold');
    return undefined;
  }

  async updateTokenUsage(tokenId: string): Promise<void> {
    const token = await db.select().from(apiTokens).where(eq(apiTokens.id, tokenId));
    if (token[0]) {
      const currentCount = parseInt(token[0].requestCount || "0");
      await db
        .update(apiTokens)
        .set({
          lastUsedAt: new Date().toISOString(),
          requestCount: (currentCount + 1).toString(),
        })
        .where(eq(apiTokens.id, tokenId));
    }
  }

  async replaceAllTokens(tokens: string[]): Promise<ApiToken[]> {
    // Check for duplicates in input
    const uniqueTokens = new Set(tokens);
    if (uniqueTokens.size !== tokens.length) {
      throw new Error("Duplicate tokens found in input");
    }
    
    // Execute deletion and insertion in a single transaction
    return await db.transaction(async (tx) => {
      // Delete all existing tokens
      await tx.delete(apiTokens);
      
      // Add all new tokens with auto-generated labels
      const newTokens: ApiToken[] = [];
      for (let i = 0; i < tokens.length; i++) {
        const [token] = await tx
          .insert(apiTokens)
          .values({
            token: tokens[i],
            label: `Token ${i + 1}`,
            isActive: true,
          })
          .returning();
        newTokens.push(token);
      }
      
      return newTokens;
    });
  }

  recordTokenError(tokenId: string): void {
    const now = Date.now();
    
    // Get or initialize error array for this token
    const errors = tokenErrorTracking.get(tokenId) || [];
    
    // Add new error timestamp
    errors.push(now);
    
    // Remove errors older than ERROR_WINDOW_MS (20 minutes)
    const recentErrors = errors.filter(timestamp => now - timestamp < ERROR_WINDOW_MS);
    
    tokenErrorTracking.set(tokenId, recentErrors);
    
    // Check if we've exceeded the threshold
    if (recentErrors.length >= ERROR_THRESHOLD) {
      const cooldownEnd = now + COOLDOWN_DURATION_MS;
      tokenCooldowns.set(tokenId, cooldownEnd);
      console.log(`[Token Error Tracking] Token ${tokenId} exceeded ${ERROR_THRESHOLD} errors in 20 minutes. Disabled for 1 hour until ${new Date(cooldownEnd).toISOString()}`);
    } else {
      console.log(`[Token Error Tracking] Recorded error for token ${tokenId}. ${recentErrors.length}/${ERROR_THRESHOLD} errors in last 20 minutes`);
    }
  }

  isTokenInCooldown(tokenId: string): boolean {
    const cooldownEnd = tokenCooldowns.get(tokenId);
    
    if (!cooldownEnd) {
      return false;
    }
    
    const now = Date.now();
    
    // Check if cooldown has expired
    if (now >= cooldownEnd) {
      tokenCooldowns.delete(tokenId);
      tokenErrorTracking.delete(tokenId);
      console.log(`[Token Error Tracking] Token ${tokenId} cooldown expired. Re-enabled.`);
      return false;
    }
    
    return true;
  }

  getRecentErrorCount(tokenId: string): number {
    const errors = tokenErrorTracking.get(tokenId) || [];
    const now = Date.now();
    
    // Count errors within the last 20 minutes
    const recentErrors = errors.filter(timestamp => now - timestamp < ERROR_WINDOW_MS);
    return recentErrors.length;
  }

  // Token settings methods
  async getTokenSettings(): Promise<TokenSettings | undefined> {
    const [settings] = await db.select().from(tokenSettings).limit(1);
    return settings || undefined;
  }

  async updateTokenSettings(settings: UpdateTokenSettings): Promise<TokenSettings> {
    const existing = await this.getTokenSettings();
    
    if (existing) {
      const [updated] = await db
        .update(tokenSettings)
        .set(settings)
        .where(eq(tokenSettings.id, existing.id))
        .returning();
      return updated;
    } else {
      const [newSettings] = await db.insert(tokenSettings).values(settings).returning();
      return newSettings;
    }
  }

  async initializeTokenSettings(): Promise<void> {
    const existing = await this.getTokenSettings();
    if (!existing) {
      await db.insert(tokenSettings).values({});
      console.log("✓ Token rotation settings initialized");
    }
  }

  // Video history methods
  async getUserVideoHistory(userId: string): Promise<VideoHistory[]> {
    return await db
      .select()
      .from(videoHistory)
      .where(eq(videoHistory.userId, userId))
      .orderBy(desc(videoHistory.createdAt));
  }

  async addVideoHistory(video: InsertVideoHistory): Promise<VideoHistory> {
    const [newVideo] = await db
      .insert(videoHistory)
      .values(video)
      .returning();
    return newVideo;
  }

  async updateVideoHistoryStatus(
    videoId: string,
    userId: string,
    status: string,
    videoUrl?: string
  ): Promise<VideoHistory | undefined> {
    const updateData: Partial<VideoHistory> = { status };
    if (videoUrl) {
      updateData.videoUrl = videoUrl;
    }

    const [updated] = await db
      .update(videoHistory)
      .set(updateData)
      .where(and(eq(videoHistory.id, videoId), eq(videoHistory.userId, userId)))
      .returning();
    return updated || undefined;
  }

  // Project methods
  async getUserProjects(userId: string): Promise<Project[]> {
    return await db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.createdAt));
  }

  async getProject(projectId: string, userId: string): Promise<Project | undefined> {
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    return project || undefined;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [newProject] = await db
      .insert(projects)
      .values(project)
      .returning();
    return newProject;
  }

  async updateProject(
    projectId: string,
    userId: string,
    updates: Partial<InsertProject>
  ): Promise<Project | undefined> {
    const [updated] = await db
      .update(projects)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async deleteProject(projectId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
