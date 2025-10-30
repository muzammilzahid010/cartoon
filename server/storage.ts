import {
  type User,
  type InsertUser,
  type UpdateUserPlan,
  type UpdateUserApiToken,
  type ApiToken,
  type InsertApiToken,
  type TokenSettings,
  type UpdateTokenSettings,
  users,
  apiTokens,
  tokenSettings,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

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
  
  // Token settings
  getTokenSettings(): Promise<TokenSettings | undefined>;
  updateTokenSettings(settings: UpdateTokenSettings): Promise<TokenSettings>;
  initializeTokenSettings(): Promise<void>;
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
    
    return tokens[0] || undefined;
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
}

export const storage = new DatabaseStorage();
