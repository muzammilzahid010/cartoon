import { type User, type InsertUser } from "@shared/schema";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  verifyPassword(user: User, password: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;

  constructor() {
    this.users = new Map();
    
    // Create default admin user (username: admin, password: admin123)
    // Password is hashed using bcrypt (synchronously in constructor)
    const adminId = randomUUID();
    const hashedPassword = bcrypt.hashSync("admin123", SALT_ROUNDS);
    const defaultAdmin: User = {
      id: adminId,
      username: "admin",
      password: hashedPassword,
      isAdmin: true,
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
      isAdmin: insertUser.isAdmin ?? false 
    };
    this.users.set(id, user);
    return user;
  }

  async verifyPassword(user: User, password: string): Promise<boolean> {
    return await bcrypt.compare(password, user.password);
  }
}

export const storage = new MemStorage();
