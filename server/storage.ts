import { type User, type InsertUser, type UpdateUserPlan, type UpdateUserApiToken, users } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
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
}

export const storage = new DatabaseStorage();
