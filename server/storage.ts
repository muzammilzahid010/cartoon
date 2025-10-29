import { type User, type InsertUser, type UpdateUserPlan, type UpdateUserApiToken } from "@shared/schema";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUserPlan(userId: string, plan: UpdateUserPlan): Promise<User | undefined>;
  updateUserApiToken(userId: string, token: UpdateUserApiToken): Promise<User | undefined>;
  verifyPassword(user: User, password: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;

  constructor() {
    this.users = new Map();
    
    // Create default admin user (username: muzi, password: muzi123)
    // Password is hashed using bcrypt (synchronously in constructor)
    const adminId = randomUUID();
    const hashedPassword = bcrypt.hashSync("muzi123", SALT_ROUNDS);
    const defaultAdmin: User = {
      id: adminId,
      username: "muzi",
      password: hashedPassword,
      isAdmin: true,
      planType: "premium",
      planStatus: "active",
      planExpiry: null,
      apiToken: null,
    };
    this.users.set(adminId, defaultAdmin);
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const hashedPassword = await bcrypt.hash(insertUser.password, SALT_ROUNDS);
    const user: User = { 
      ...insertUser, 
      id,
      password: hashedPassword,
      isAdmin: insertUser.isAdmin ?? false,
      planType: "free",
      planStatus: "active",
      planExpiry: null,
      apiToken: null,
    };
    this.users.set(id, user);
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async updateUserPlan(userId: string, plan: UpdateUserPlan): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;

    const updatedUser: User = {
      ...user,
      planType: plan.planType,
      planStatus: plan.planStatus,
      planExpiry: plan.planExpiry ?? null,
    };
    
    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  async updateUserApiToken(userId: string, token: UpdateUserApiToken): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;

    const updatedUser: User = {
      ...user,
      apiToken: token.apiToken,
    };
    
    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  async verifyPassword(user: User, password: string): Promise<boolean> {
    return await bcrypt.compare(password, user.password);
  }
}

export const storage = new MemStorage();
