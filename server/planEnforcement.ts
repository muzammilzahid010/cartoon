import type { User } from "@shared/schema";

// Plan configuration constants
export const PLAN_CONFIGS = {
  free: {
    name: "Free",
    dailyVideoLimit: 0, // Free users have limited access
    allowedTools: ["veo"] as const, // Only VEO 3
    bulkGeneration: {
      maxBatch: 0,
      delaySeconds: 0,
      maxPrompts: 0,
    },
  },
  scale: {
    name: "Scale",
    price: "900 PKR",
    duration: "10 days",
    dailyVideoLimit: 1000,
    allowedTools: ["veo", "bulk"] as const, // VEO 3 + Bulk generation
    bulkGeneration: {
      maxBatch: 7,
      delaySeconds: 30,
      maxPrompts: 50,
    },
  },
  empire: {
    name: "Empire",
    price: "1500 PKR",
    duration: "10 days",
    dailyVideoLimit: 2000,
    allowedTools: ["veo", "bulk", "script", "textToImage", "imageToVideo"] as const, // All tools
    bulkGeneration: {
      maxBatch: 20,
      delaySeconds: 15,
      maxPrompts: 100,
    },
  },
} as const;

export type PlanType = keyof typeof PLAN_CONFIGS;
export type AllowedTool = "veo" | "bulk" | "script" | "textToImage" | "imageToVideo";

export interface PlanCheckResult {
  allowed: boolean;
  reason?: string;
  remainingVideos?: number;
}

/**
 * Check if a user's plan has expired
 */
export function isPlanExpired(user: User): boolean {
  // Admin never expires
  if (user.isAdmin) {
    return false;
  }

  // Free plan never expires
  if (user.planType === "free") {
    return false;
  }

  // Check if plan has expiry date and if it's past
  if (user.planExpiry) {
    const expiryDate = new Date(user.planExpiry);
    const now = new Date();
    return now > expiryDate;
  }

  return false;
}

/**
 * Check if user has reached their daily video limit
 */
export function hasReachedDailyLimit(user: User): boolean {
  // Admin has no limits
  if (user.isAdmin) {
    return false;
  }

  const config = PLAN_CONFIGS[user.planType as PlanType];
  if (!config) {
    return true; // Unknown plan type, restrict access
  }

  return user.dailyVideoCount >= config.dailyVideoLimit;
}

/**
 * Get remaining videos for the day
 */
export function getRemainingVideos(user: User): number {
  // Admin has unlimited
  if (user.isAdmin) {
    return Infinity;
  }

  const config = PLAN_CONFIGS[user.planType as PlanType];
  if (!config) {
    return 0;
  }

  const remaining = config.dailyVideoLimit - user.dailyVideoCount;
  return Math.max(0, remaining);
}

/**
 * Check if user can access a specific tool
 */
export function canAccessTool(user: User, tool: AllowedTool): PlanCheckResult {
  // Admin can access everything
  if (user.isAdmin) {
    return { allowed: true };
  }

  // Check if plan is expired
  if (isPlanExpired(user)) {
    return {
      allowed: false,
      reason: "Your plan has expired. Please contact admin to renew.",
    };
  }

  const config = PLAN_CONFIGS[user.planType as PlanType];
  if (!config) {
    return {
      allowed: false,
      reason: "Invalid plan type. Please contact admin.",
    };
  }

  // Check if tool is allowed for this plan
  if (!config.allowedTools.includes(tool as any)) {
    return {
      allowed: false,
      reason: `This tool is not available on your ${config.name} plan. Please upgrade to access this feature.`,
    };
  }

  return { allowed: true };
}

/**
 * Check if user can generate videos (considering daily limit)
 */
export function canGenerateVideo(user: User): PlanCheckResult {
  // Admin can always generate
  if (user.isAdmin) {
    return { allowed: true };
  }

  // Check if plan is expired
  if (isPlanExpired(user)) {
    return {
      allowed: false,
      reason: "Your plan has expired. Please contact admin to renew.",
    };
  }

  // Check daily limit
  if (hasReachedDailyLimit(user)) {
    const config = PLAN_CONFIGS[user.planType as PlanType];
    return {
      allowed: false,
      reason: `You have reached your daily limit of ${config.dailyVideoLimit} videos. Limit resets at midnight.`,
    };
  }

  const remaining = getRemainingVideos(user);
  return {
    allowed: true,
    remainingVideos: remaining,
  };
}

/**
 * Check if user can perform bulk generation with specified count
 */
export function canBulkGenerate(user: User, videoCount: number): PlanCheckResult {
  // Admin can always generate
  if (user.isAdmin) {
    return { allowed: true };
  }

  // Check tool access first
  const toolCheck = canAccessTool(user, "bulk");
  if (!toolCheck.allowed) {
    return toolCheck;
  }

  const config = PLAN_CONFIGS[user.planType as PlanType];
  
  // Check if total prompts exceeds plan limit
  if (videoCount > config.bulkGeneration.maxPrompts) {
    return {
      allowed: false,
      reason: `Your ${config.name} plan allows a maximum of ${config.bulkGeneration.maxPrompts} prompts in total. Please reduce the number of prompts.`,
    };
  }
  
  // Check if batch size exceeds plan limit (not enforced here, enforced by backend delay/batch processing)
  // This is informational only
  if (config.bulkGeneration.maxBatch > 0 && videoCount > config.bulkGeneration.maxBatch) {
    // Note: This won't block submission but videos will be processed in batches
  }

  // Check daily limit
  const remaining = getRemainingVideos(user);
  if (videoCount > remaining) {
    return {
      allowed: false,
      reason: `You have ${remaining} videos remaining today. Cannot generate ${videoCount} videos.`,
    };
  }

  return {
    allowed: true,
    remainingVideos: remaining,
  };
}

/**
 * Get batch configuration for user's plan
 */
export function getBatchConfig(user: User): { maxBatch: number; delaySeconds: number } {
  // Admin gets empire config
  if (user.isAdmin) {
    return PLAN_CONFIGS.empire.bulkGeneration;
  }

  const config = PLAN_CONFIGS[user.planType as PlanType];
  if (!config) {
    return { maxBatch: 0, delaySeconds: 0 };
  }

  return config.bulkGeneration;
}

/**
 * Get user's plan configuration
 */
export function getPlanConfig(user: User) {
  if (user.isAdmin) {
    return {
      ...PLAN_CONFIGS.empire,
      name: "Admin (Unlimited)",
      dailyVideoLimit: Infinity,
    };
  }

  return PLAN_CONFIGS[user.planType as PlanType] || PLAN_CONFIGS.free;
}

/**
 * Format plan expiry date for display
 */
export function formatPlanExpiry(expiryDate: string | null): string {
  if (!expiryDate) {
    return "Never";
  }

  const date = new Date(expiryDate);
  const now = new Date();
  
  // If expired
  if (date < now) {
    return "Expired";
  }

  // Calculate days remaining
  const diffTime = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return "Expires today";
  } else if (diffDays === 1) {
    return "Expires tomorrow";
  } else {
    return `${diffDays} days remaining`;
  }
}
