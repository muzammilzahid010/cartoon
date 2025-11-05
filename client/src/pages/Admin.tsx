import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Shield, LogOut, UserPlus, Home, Edit, Key, Calendar, RefreshCw, TrendingUp, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { useEffect, useState, useMemo } from "react";

const createUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  isAdmin: z.boolean().default(false),
});

const updatePlanSchema = z.object({
  planType: z.enum(["free", "basic", "premium"]),
  planStatus: z.enum(["active", "expired", "cancelled"]),
  planExpiry: z.string().optional(),
});

const updateTokenSchema = z.object({
  apiToken: z.string().min(1, "API token is required"),
});

const addApiTokenSchema = z.object({
  token: z.string().min(1, "Token is required"),
  label: z.string().min(1, "Label is required"),
});

const tokenRotationSettingsSchema = z.object({
  rotationEnabled: z.boolean(),
  rotationIntervalMinutes: z.string().min(1, "Interval is required"),
  maxRequestsPerToken: z.string().min(1, "Max requests is required"),
  videosPerBatch: z.string().min(1, "Videos per batch is required"),
  batchDelaySeconds: z.string().min(1, "Batch delay is required"),
});

const bulkReplaceTokensSchema = z.object({
  tokens: z.string().min(1, "Please enter at least one token"),
});

type CreateUserFormData = z.infer<typeof createUserSchema>;
type UpdatePlanFormData = z.infer<typeof updatePlanSchema>;
type UpdateTokenFormData = z.infer<typeof updateTokenSchema>;
type AddApiTokenFormData = z.infer<typeof addApiTokenSchema>;
type TokenRotationSettingsFormData = z.infer<typeof tokenRotationSettingsSchema>;
type BulkReplaceTokensFormData = z.infer<typeof bulkReplaceTokensSchema>;

interface UserData {
  id: string;
  username: string;
  isAdmin: boolean;
  planType: string;
  planStatus: string;
  planExpiry: string | null;
  apiToken: string | null;
}

interface ApiTokenData {
  id: string;
  token: string;
  label: string;
  isActive: boolean;
  lastUsedAt: string | null;
  requestCount: string;
  createdAt: string;
}

interface TokenRotationSettings {
  id: string;
  rotationEnabled: boolean;
  rotationIntervalMinutes: string;
  maxRequestsPerToken: string;
  videosPerBatch: string;
  batchDelaySeconds: string;
}

export default function Admin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingTokenUserId, setEditingTokenUserId] = useState<string | null>(null);
  const [viewingTokenErrors, setViewingTokenErrors] = useState<string | null>(null);

  const { data: session, isLoading: isLoadingSession } = useQuery<{
    authenticated: boolean;
    user?: { id: string; username: string; isAdmin: boolean };
  }>({
    queryKey: ["/api/session"],
  });

  const isAdmin = session?.authenticated && session?.user?.isAdmin;

  const { data: usersData, isLoading: isLoadingUsers } = useQuery<{ users: UserData[] }>({
    queryKey: ["/api/users"],
    enabled: isAdmin === true,
  });

  const { data: tokensData, isLoading: isLoadingTokens } = useQuery<{ tokens: ApiTokenData[] }>({
    queryKey: ["/api/tokens"],
    enabled: isAdmin === true,
  });

  const { data: tokenSettingsData } = useQuery<{ settings: TokenRotationSettings }>({
    queryKey: ["/api/token-settings"],
    enabled: isAdmin === true,
  });

  const { data: allVideoHistory } = useQuery<{ videos: Array<{
    id: string;
    userId: string;
    prompt: string;
    aspectRatio: string;
    videoUrl: string | null;
    status: string;
    createdAt: string;
    title: string | null;
    tokenUsed: string | null;
    errorMessage: string | null;
  }> }>({
    queryKey: ["/api/admin/video-history"],
    enabled: isAdmin === true,
  });

  // Calculate today's video statistics
  const todayStats = useMemo(() => {
    if (!allVideoHistory?.videos) return null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayVideos = allVideoHistory.videos.filter(video => {
      const videoDate = new Date(video.createdAt);
      videoDate.setHours(0, 0, 0, 0);
      return videoDate.getTime() === today.getTime();
    });
    
    // Always return stats, even with zeros
    return {
      total: todayVideos.length,
      completed: todayVideos.filter(v => v.status === 'completed').length,
      failed: todayVideos.filter(v => v.status === 'failed').length,
      pending: todayVideos.filter(v => v.status === 'pending').length,
    };
  }, [allVideoHistory]);

  // Calculate per-token statistics
  const tokenStats = useMemo(() => {
    if (!allVideoHistory?.videos || !tokensData?.tokens) return [];
    
    const stats = new Map<string, { tokenId: string; label: string; total: number; completed: number; failed: number }>();
    
    // Initialize stats for all tokens
    tokensData.tokens.forEach(token => {
      stats.set(token.id, {
        tokenId: token.id,
        label: token.label,
        total: 0,
        completed: 0,
        failed: 0,
      });
    });
    
    // Count videos by token
    allVideoHistory.videos.forEach(video => {
      if (video.tokenUsed && stats.has(video.tokenUsed)) {
        const stat = stats.get(video.tokenUsed)!;
        stat.total++;
        if (video.status === 'completed') stat.completed++;
        if (video.status === 'failed') stat.failed++;
      }
    });
    
    // Return all tokens, even those with zero usage to highlight inactivity
    return Array.from(stats.values());
  }, [allVideoHistory, tokensData]);

  useEffect(() => {
    if (isLoadingSession) return;
    
    if (!session?.authenticated || !session?.user?.isAdmin) {
      toast({
        variant: "destructive",
        title: "Access denied",
        description: "You must be an admin to access this page",
      });
      setLocation("/login");
    }
  }, [session, isLoadingSession, setLocation, toast]);

  useEffect(() => {
    if (tokenSettingsData?.settings) {
      rotationSettingsForm.reset({
        rotationEnabled: tokenSettingsData.settings.rotationEnabled,
        rotationIntervalMinutes: tokenSettingsData.settings.rotationIntervalMinutes,
        maxRequestsPerToken: tokenSettingsData.settings.maxRequestsPerToken,
        videosPerBatch: tokenSettingsData.settings.videosPerBatch,
        batchDelaySeconds: tokenSettingsData.settings.batchDelaySeconds,
      });
    }
  }, [tokenSettingsData]);

  const createForm = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      username: "",
      password: "",
      isAdmin: false,
    },
  });

  const planForm = useForm<UpdatePlanFormData>({
    resolver: zodResolver(updatePlanSchema),
    defaultValues: {
      planType: "free",
      planStatus: "active",
      planExpiry: "",
    },
  });

  const tokenForm = useForm<UpdateTokenFormData>({
    resolver: zodResolver(updateTokenSchema),
    defaultValues: {
      apiToken: "",
    },
  });

  const addTokenForm = useForm<AddApiTokenFormData>({
    resolver: zodResolver(addApiTokenSchema),
    defaultValues: {
      token: "",
      label: "",
    },
  });

  const rotationSettingsForm = useForm<TokenRotationSettingsFormData>({
    resolver: zodResolver(tokenRotationSettingsSchema),
    defaultValues: {
      rotationEnabled: false,
      rotationIntervalMinutes: "60",
      maxRequestsPerToken: "1000",
      videosPerBatch: "5",
      batchDelaySeconds: "20",
    },
  });

  const bulkReplaceForm = useForm<BulkReplaceTokensFormData>({
    resolver: zodResolver(bulkReplaceTokensSchema),
    defaultValues: {
      tokens: "",
    },
  });

  const [showBulkConfirmation, setShowBulkConfirmation] = useState(false);

  const createUserMutation = useMutation({
    mutationFn: async (data: CreateUserFormData) => {
      const response = await apiRequest("POST", "/api/users", data);
      const result = await response.json();
      return result as { success: boolean; user: UserData };
    },
    onSuccess: (data) => {
      toast({
        title: "User created successfully",
        description: `${data.user.username} has been added${data.user.isAdmin ? " as an admin" : ""}`,
      });
      createForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to create user",
        description: error.message || "An error occurred",
      });
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: UpdatePlanFormData }) => {
      const response = await apiRequest("PATCH", `/api/users/${userId}/plan`, data);
      const result = await response.json();
      return result;
    },
    onSuccess: () => {
      toast({
        title: "Plan updated successfully",
      });
      setEditingUserId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to update plan",
        description: error.message || "An error occurred",
      });
    },
  });

  const updateTokenMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: UpdateTokenFormData }) => {
      const response = await apiRequest("PATCH", `/api/users/${userId}/token`, data);
      const result = await response.json();
      return result;
    },
    onSuccess: () => {
      toast({
        title: "API token updated successfully",
      });
      setEditingTokenUserId(null);
      tokenForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to update token",
        description: error.message || "An error occurred",
      });
    },
  });

  const addTokenMutation = useMutation({
    mutationFn: async (data: AddApiTokenFormData) => {
      const response = await apiRequest("POST", "/api/tokens", data);
      const result = await response.json();
      return result;
    },
    onSuccess: () => {
      toast({
        title: "Token added successfully",
      });
      addTokenForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/tokens"] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to add token",
        description: error.message || "An error occurred",
      });
    },
  });

  const deleteTokenMutation = useMutation({
    mutationFn: async (tokenId: string) => {
      const response = await apiRequest("DELETE", `/api/tokens/${tokenId}`, {});
      const result = await response.json();
      return result;
    },
    onSuccess: () => {
      toast({
        title: "Token deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tokens"] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to delete token",
        description: error.message || "An error occurred",
      });
    },
  });

  const toggleTokenMutation = useMutation({
    mutationFn: async ({ tokenId, isActive }: { tokenId: string; isActive: boolean }) => {
      const response = await apiRequest("PATCH", `/api/tokens/${tokenId}/toggle`, { isActive });
      const result = await response.json();
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tokens"] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to update token status",
        description: error.message || "An error occurred",
      });
    },
  });

  const updateRotationSettingsMutation = useMutation({
    mutationFn: async (data: TokenRotationSettingsFormData) => {
      const response = await apiRequest("PUT", "/api/token-settings", {
        rotationEnabled: data.rotationEnabled,
        rotationIntervalMinutes: data.rotationIntervalMinutes,
        maxRequestsPerToken: data.maxRequestsPerToken,
        videosPerBatch: data.videosPerBatch,
        batchDelaySeconds: data.batchDelaySeconds,
      });
      const result = await response.json();
      return result;
    },
    onSuccess: () => {
      toast({
        title: "Settings updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/token-settings"] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to update settings",
        description: error.message || "An error occurred",
      });
    },
  });

  const bulkReplaceTokensMutation = useMutation({
    mutationFn: async (data: BulkReplaceTokensFormData) => {
      const response = await apiRequest("POST", "/api/tokens/bulk-replace", data);
      const result = await response.json();
      return result as { success: boolean; tokens: ApiTokenData[]; count: number };
    },
    onSuccess: (data) => {
      toast({
        title: "Tokens replaced successfully",
        description: `Added ${data.count} new tokens. All previous tokens have been removed.`,
      });
      bulkReplaceForm.reset();
      setShowBulkConfirmation(false);
      queryClient.invalidateQueries({ queryKey: ["/api/tokens"] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to replace tokens",
        description: error.message || "An error occurred",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/logout", {});
      const result = await response.json();
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/session"] });
      toast({
        title: "Logged out successfully",
      });
      setLocation("/login");
    },
  });

  const handleEditPlan = (user: UserData) => {
    setEditingUserId(user.id);
    planForm.reset({
      planType: user.planType as "free" | "basic" | "premium",
      planStatus: user.planStatus as "active" | "expired" | "cancelled",
      planExpiry: user.planExpiry || "",
    });
  };

  const handleEditToken = (user: UserData) => {
    setEditingTokenUserId(user.id);
    tokenForm.reset({
      apiToken: user.apiToken || "",
    });
  };

  const onCreateSubmit = (data: CreateUserFormData) => {
    createUserMutation.mutate(data);
  };

  const onPlanSubmit = (data: UpdatePlanFormData) => {
    if (editingUserId) {
      updatePlanMutation.mutate({ userId: editingUserId, data });
    }
  };

  const onTokenSubmit = (data: UpdateTokenFormData) => {
    if (editingTokenUserId) {
      updateTokenMutation.mutate({ userId: editingTokenUserId, data });
    }
  };

  if (isLoadingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1a2332] via-[#1e2838] to-[#242d3f] dark:from-[#141a25] dark:via-[#181e2a] dark:to-[#1c2230]">
        <p className="text-gray-300">Loading...</p>
      </div>
    );
  }

  if (!session?.authenticated || !session?.user?.isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a2332] via-[#1e2838] to-[#242d3f] dark:from-[#141a25] dark:via-[#181e2a] dark:to-[#1c2230] p-4">
      <div className="max-w-7xl mx-auto py-8">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-600/30 border border-purple-500/50">
              <Shield className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Admin Panel</h1>
              <p className="text-gray-300">
                Logged in as <span className="font-medium text-white">{session.user.username}</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setLocation("/")}
              data-testid="button-home"
              className="border-white/20 text-white hover:bg-white/10"
            >
              <Home className="w-4 h-4 mr-2" />
              Home
            </Button>
            <Button
              variant="outline"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              data-testid="button-logout"
              className="border-white/20 text-white hover:bg-white/10"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>

        {/* Today's Video Generation Statistics */}
        {todayStats && (
          <Card className="shadow-xl bg-[#1e2838] dark:bg-[#181e2a] border border-white/10 mb-6">
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-purple-400" />
                <CardTitle className="text-white">Today's Video Generation Statistics</CardTitle>
              </div>
              <CardDescription className="text-gray-300">
                Overview of videos generated today
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-purple-600/10 border border-purple-500/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-purple-400" />
                    <p className="text-sm font-medium text-gray-300">Total</p>
                  </div>
                  <p className="text-2xl font-bold text-white">{todayStats.total}</p>
                </div>
                <div className="p-4 bg-green-600/10 border border-green-500/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <p className="text-sm font-medium text-gray-300">Completed</p>
                  </div>
                  <p className="text-2xl font-bold text-white">{todayStats.completed}</p>
                </div>
                <div className="p-4 bg-red-600/10 border border-red-500/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="w-4 h-4 text-red-400" />
                    <p className="text-sm font-medium text-gray-300">Failed</p>
                  </div>
                  <p className="text-2xl font-bold text-white">{todayStats.failed}</p>
                </div>
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Pending</p>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{todayStats.pending}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Per-Token Statistics */}
        {tokenStats.length > 0 && (
          <Card className="shadow-xl dark:bg-gray-800 dark:border-gray-700 mb-6">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <CardTitle className="text-gray-900 dark:text-white">API Token Usage Statistics</CardTitle>
              </div>
              <CardDescription className="text-gray-600 dark:text-gray-400">
                Video generation statistics per API token
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="dark:border-gray-700">
                      <TableHead className="text-gray-700 dark:text-gray-300">Token Label</TableHead>
                      <TableHead className="text-gray-700 dark:text-gray-300">Total Videos</TableHead>
                      <TableHead className="text-gray-700 dark:text-gray-300">Completed</TableHead>
                      <TableHead className="text-gray-700 dark:text-gray-300">Failed</TableHead>
                      <TableHead className="text-gray-700 dark:text-gray-300">Success Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tokenStats.map((stat) => {
                      const successRate = stat.total > 0 ? ((stat.completed / stat.total) * 100).toFixed(1) : '0.0';
                      return (
                        <TableRow key={stat.tokenId} className="dark:border-gray-700">
                          <TableCell className="font-medium text-gray-900 dark:text-white">
                            {stat.label}
                          </TableCell>
                          <TableCell className="text-gray-700 dark:text-gray-300">
                            {stat.total}
                          </TableCell>
                          <TableCell className="text-gray-700 dark:text-gray-300">
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300 text-sm rounded">
                              <CheckCircle className="w-3 h-3" />
                              {stat.completed}
                            </span>
                          </TableCell>
                          <TableCell className="text-gray-700 dark:text-gray-300">
                            <button
                              onClick={() => stat.failed > 0 && setViewingTokenErrors(stat.tokenId)}
                              className={`inline-flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300 text-sm rounded ${
                                stat.failed > 0 ? 'cursor-pointer hover:bg-red-200 dark:hover:bg-red-900/30' : ''
                              }`}
                              disabled={stat.failed === 0}
                            >
                              <XCircle className="w-3 h-3" />
                              {stat.failed}
                            </button>
                          </TableCell>
                          <TableCell className="text-gray-700 dark:text-gray-300">
                            <span className={`px-2 py-1 text-sm rounded ${
                              parseFloat(successRate) >= 80 
                                ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                                : parseFloat(successRate) >= 50
                                ? 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300'
                                : 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300'
                            }`}>
                              {successRate}%
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error Details Dialog */}
        <Dialog open={!!viewingTokenErrors} onOpenChange={(open) => !open && setViewingTokenErrors(null)}>
          <DialogContent className="max-w-4xl dark:bg-gray-800 dark:border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-gray-900 dark:text-white flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-500" />
                Failed Video Details
              </DialogTitle>
              <DialogDescription className="text-gray-600 dark:text-gray-400">
                Error messages for failed video generations using {tokensData?.tokens.find(t => t.id === viewingTokenErrors)?.label || 'this token'}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[500px] pr-4">
              <div className="space-y-3">
                {allVideoHistory?.videos
                  .filter(v => v.tokenUsed === viewingTokenErrors && v.status === 'failed')
                  .map((video) => (
                    <div key={video.id} className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {video.title || 'Untitled Video'}
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              ID: {video.id}
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              Created: {new Date(video.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <Badge variant="destructive">Failed</Badge>
                        </div>
                        <div className="mt-2">
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Prompt:</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-600">
                            {video.prompt}
                          </p>
                        </div>
                        {video.errorMessage && (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-1 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              Error Message:
                            </p>
                            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-800">
                              {video.errorMessage}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                {allVideoHistory?.videos
                  .filter(v => v.tokenUsed === viewingTokenErrors && v.status === 'failed')
                  .length === 0 && (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                    No failed videos found for this token
                  </p>
                )}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card className="shadow-xl dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <CardTitle className="text-gray-900 dark:text-white">Create New User</CardTitle>
              </div>
              <CardDescription className="text-gray-600 dark:text-gray-400">
                Add a new user account to the system
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...createForm}>
                <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                  <FormField
                    control={createForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-700 dark:text-gray-300">Username</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Enter username"
                            data-testid="input-create-username"
                            className="dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                            disabled={createUserMutation.isPending}
                          />
                        </FormControl>
                        <FormMessage className="dark:text-red-400" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-700 dark:text-gray-300">Password</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            placeholder="Enter password"
                            data-testid="input-create-password"
                            className="dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                            disabled={createUserMutation.isPending}
                          />
                        </FormControl>
                        <FormMessage className="dark:text-red-400" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createForm.control}
                    name="isAdmin"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border border-gray-200 dark:border-gray-600 p-4 bg-gray-50 dark:bg-gray-700">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base text-gray-900 dark:text-white">
                            Admin privileges
                          </FormLabel>
                          <FormDescription className="text-gray-600 dark:text-gray-400">
                            Grant administrator access
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-admin"
                            disabled={createUserMutation.isPending}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 dark:from-purple-500 dark:to-blue-500 dark:hover:from-purple-600 dark:hover:to-blue-600 text-white dark:text-white"
                    disabled={createUserMutation.isPending}
                    data-testid="button-create-user"
                  >
                    {createUserMutation.isPending ? "Creating..." : "Create User"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-xl dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <CardTitle className="text-gray-900 dark:text-white">User Management</CardTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/users"] })}
                data-testid="button-refresh-users"
                className="dark:border-gray-600 dark:text-gray-300"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
            <CardDescription className="text-gray-600 dark:text-gray-400">
              Manage user plans and access tokens
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingUsers ? (
              <p className="text-gray-600 dark:text-gray-400 text-center py-4">Loading users...</p>
            ) : !usersData?.users || usersData.users.length === 0 ? (
              <p className="text-gray-600 dark:text-gray-400 text-center py-4">No users found</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="dark:border-gray-700">
                      <TableHead className="text-gray-700 dark:text-gray-300">Username</TableHead>
                      <TableHead className="text-gray-700 dark:text-gray-300">Role</TableHead>
                      <TableHead className="text-gray-700 dark:text-gray-300">Plan</TableHead>
                      <TableHead className="text-gray-700 dark:text-gray-300">Status</TableHead>
                      <TableHead className="text-gray-700 dark:text-gray-300">Expiry</TableHead>
                      <TableHead className="text-gray-700 dark:text-gray-300">API Token</TableHead>
                      <TableHead className="text-gray-700 dark:text-gray-300">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usersData.users.map((user) => (
                      <TableRow key={user.id} className="dark:border-gray-700" data-testid={`row-user-${user.id}`}>
                        <TableCell className="font-medium text-gray-900 dark:text-white" data-testid={`text-username-${user.id}`}>
                          {user.username}
                        </TableCell>
                        <TableCell className="text-gray-700 dark:text-gray-300">
                          {user.isAdmin ? (
                            <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 text-xs rounded-full">
                              Admin
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs rounded-full">
                              User
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-gray-700 dark:text-gray-300 capitalize" data-testid={`text-plan-${user.id}`}>
                          {user.planType}
                        </TableCell>
                        <TableCell className="text-gray-700 dark:text-gray-300">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            user.planStatus === "active" 
                              ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
                              : user.planStatus === "expired"
                              ? "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                          }`} data-testid={`text-status-${user.id}`}>
                            {user.planStatus}
                          </span>
                        </TableCell>
                        <TableCell className="text-gray-700 dark:text-gray-300 text-sm" data-testid={`text-expiry-${user.id}`}>
                          {user.planExpiry || "—"}
                        </TableCell>
                        <TableCell className="text-gray-700 dark:text-gray-300 font-mono text-xs" data-testid={`text-token-${user.id}`}>
                          {user.apiToken ? `${user.apiToken.slice(0, 20)}...` : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Dialog open={editingUserId === user.id} onOpenChange={(open) => !open && setEditingUserId(null)}>
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditPlan(user)}
                                  data-testid={`button-edit-plan-${user.id}`}
                                  className="dark:border-gray-600 dark:text-gray-300"
                                >
                                  <Edit className="w-3 h-3 mr-1" />
                                  Plan
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
                                <DialogHeader>
                                  <DialogTitle className="text-gray-900 dark:text-white">Edit User Plan</DialogTitle>
                                  <DialogDescription className="text-gray-600 dark:text-gray-400">
                                    Update plan settings for {user.username}
                                  </DialogDescription>
                                </DialogHeader>
                                <Form {...planForm}>
                                  <form onSubmit={planForm.handleSubmit(onPlanSubmit)} className="space-y-4">
                                    <FormField
                                      control={planForm.control}
                                      name="planType"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-gray-700 dark:text-gray-300">Plan Type</FormLabel>
                                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                              <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" data-testid="select-plan-type">
                                                <SelectValue placeholder="Select plan type" />
                                              </SelectTrigger>
                                            </FormControl>
                                            <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                                              <SelectItem value="free">Free</SelectItem>
                                              <SelectItem value="basic">Basic</SelectItem>
                                              <SelectItem value="premium">Premium</SelectItem>
                                            </SelectContent>
                                          </Select>
                                          <FormMessage className="dark:text-red-400" />
                                        </FormItem>
                                      )}
                                    />

                                    <FormField
                                      control={planForm.control}
                                      name="planStatus"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-gray-700 dark:text-gray-300">Plan Status</FormLabel>
                                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                              <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" data-testid="select-plan-status">
                                                <SelectValue placeholder="Select status" />
                                              </SelectTrigger>
                                            </FormControl>
                                            <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                                              <SelectItem value="active">Active</SelectItem>
                                              <SelectItem value="expired">Expired</SelectItem>
                                              <SelectItem value="cancelled">Cancelled</SelectItem>
                                            </SelectContent>
                                          </Select>
                                          <FormMessage className="dark:text-red-400" />
                                        </FormItem>
                                      )}
                                    />

                                    <FormField
                                      control={planForm.control}
                                      name="planExpiry"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-gray-700 dark:text-gray-300">
                                            <Calendar className="w-4 h-4 inline mr-1" />
                                            Plan Expiry (optional)
                                          </FormLabel>
                                          <FormControl>
                                            <Input
                                              {...field}
                                              type="date"
                                              data-testid="input-plan-expiry"
                                              className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                            />
                                          </FormControl>
                                          <FormMessage className="dark:text-red-400" />
                                        </FormItem>
                                      )}
                                    />

                                    <Button
                                      type="submit"
                                      className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 dark:from-purple-500 dark:to-blue-500 text-white dark:text-white"
                                      disabled={updatePlanMutation.isPending}
                                      data-testid="button-save-plan"
                                    >
                                      {updatePlanMutation.isPending ? "Saving..." : "Save Changes"}
                                    </Button>
                                  </form>
                                </Form>
                              </DialogContent>
                            </Dialog>

                            <Dialog open={editingTokenUserId === user.id} onOpenChange={(open) => !open && setEditingTokenUserId(null)}>
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditToken(user)}
                                  data-testid={`button-edit-token-${user.id}`}
                                  className="dark:border-gray-600 dark:text-gray-300"
                                >
                                  <Key className="w-3 h-3 mr-1" />
                                  Token
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
                                <DialogHeader>
                                  <DialogTitle className="text-gray-900 dark:text-white">Edit API Token</DialogTitle>
                                  <DialogDescription className="text-gray-600 dark:text-gray-400">
                                    Update bearer token for {user.username}
                                  </DialogDescription>
                                </DialogHeader>
                                <Form {...tokenForm}>
                                  <form onSubmit={tokenForm.handleSubmit(onTokenSubmit)} className="space-y-4">
                                    <FormField
                                      control={tokenForm.control}
                                      name="apiToken"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-gray-700 dark:text-gray-300">
                                            <Key className="w-4 h-4 inline mr-1" />
                                            API Token
                                          </FormLabel>
                                          <FormControl>
                                            <Input
                                              {...field}
                                              placeholder="Enter API token"
                                              data-testid="input-api-token"
                                              className="font-mono dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                                            />
                                          </FormControl>
                                          <FormMessage className="dark:text-red-400" />
                                        </FormItem>
                                      )}
                                    />

                                    <Button
                                      type="submit"
                                      className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 dark:from-purple-500 dark:to-blue-500 text-white dark:text-white"
                                      disabled={updateTokenMutation.isPending}
                                      data-testid="button-save-token"
                                    >
                                      {updateTokenMutation.isPending ? "Saving..." : "Save Token"}
                                    </Button>
                                  </form>
                                </Form>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Token Rotation Management */}
        <Card className="shadow-xl border-purple-100 dark:border-gray-700 dark:bg-gray-800">
          <CardHeader className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-gray-700 dark:to-gray-700">
            <CardTitle className="flex items-center gap-2 text-gray-800 dark:text-white">
              <RefreshCw className="w-5 h-5" />
              API Token Rotation
            </CardTitle>
            <CardDescription className="dark:text-gray-400">
              Manage multiple API tokens for load balancing and automatic rotation
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 dark:bg-gray-800">
            {/* Rotation Settings */}
            <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <h3 className="font-semibold mb-3 text-gray-800 dark:text-white">Rotation Settings</h3>
              <Form {...rotationSettingsForm}>
                <form
                  onSubmit={rotationSettingsForm.handleSubmit((data) =>
                    updateRotationSettingsMutation.mutate(data)
                  )}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={rotationSettingsForm.control}
                      name="rotationEnabled"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2">
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-rotation-enabled"
                            />
                          </FormControl>
                          <FormLabel className="text-gray-700 dark:text-gray-300 mb-0">
                            Enable Rotation
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={rotationSettingsForm.control}
                      name="rotationIntervalMinutes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-700 dark:text-gray-300">
                            Interval (minutes)
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              data-testid="input-rotation-interval"
                              className="dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={rotationSettingsForm.control}
                      name="maxRequestsPerToken"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-700 dark:text-gray-300">
                            Max Requests/Token
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              data-testid="input-max-requests"
                              className="dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Batch Processing Settings */}
                  <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
                    <h4 className="font-semibold mb-3 text-gray-800 dark:text-white">Batch Processing Configuration</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                      Configure how many videos are sent to the VEO API in each batch and the delay between batches to optimize generation performance.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={rotationSettingsForm.control}
                        name="videosPerBatch"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-gray-700 dark:text-gray-300">
                              Videos per Batch (1-50)
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="number"
                                min="1"
                                max="50"
                                data-testid="input-videos-per-batch"
                                className="dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                              />
                            </FormControl>
                            <FormDescription className="text-xs text-gray-500 dark:text-gray-400">
                              Number of videos sent in parallel in each batch
                            </FormDescription>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={rotationSettingsForm.control}
                        name="batchDelaySeconds"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-gray-700 dark:text-gray-300">
                              Batch Delay (10-120 seconds)
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="number"
                                min="10"
                                max="120"
                                data-testid="input-batch-delay"
                                className="dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                              />
                            </FormControl>
                            <FormDescription className="text-xs text-gray-500 dark:text-gray-400">
                              Delay in seconds between processing batches
                            </FormDescription>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 dark:from-purple-500 dark:to-blue-500 text-white"
                    disabled={updateRotationSettingsMutation.isPending}
                    data-testid="button-save-rotation-settings"
                  >
                    {updateRotationSettingsMutation.isPending ? "Saving..." : "Save Settings"}
                  </Button>
                </form>
              </Form>
            </div>

            {/* Bulk Replace Tokens */}
            <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <h3 className="font-semibold mb-2 text-gray-800 dark:text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Bulk Replace All Tokens
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                ⚠️ This will DELETE all existing tokens and replace them with new ones. "Bearer " prefix will be automatically removed.
              </p>
              <Form {...bulkReplaceForm}>
                <form
                  onSubmit={bulkReplaceForm.handleSubmit((data) => setShowBulkConfirmation(true))}
                  className="space-y-4"
                >
                  <FormField
                    control={bulkReplaceForm.control}
                    name="tokens"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-700 dark:text-gray-300">
                          Paste Tokens (one per line)
                        </FormLabel>
                        <FormControl>
                          <textarea
                            {...field}
                            rows={6}
                            placeholder="ya29.a0ARrdaM_example1&#10;Bearer ya29.a0ARrdaM_example2&#10;ya29.a0ARrdaM_example3"
                            className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm resize-vertical"
                            data-testid="textarea-bulk-tokens"
                          />
                        </FormControl>
                        <FormMessage className="dark:text-red-400" />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="bg-yellow-600 hover:bg-yellow-700 dark:bg-yellow-600 dark:hover:bg-yellow-700 text-white"
                    data-testid="button-bulk-replace"
                  >
                    Replace All Tokens
                  </Button>
                </form>
              </Form>
              
              {/* Confirmation Dialog */}
              {showBulkConfirmation && (
                <Dialog open={showBulkConfirmation} onOpenChange={setShowBulkConfirmation}>
                  <DialogContent className="dark:bg-gray-800">
                    <DialogHeader>
                      <DialogTitle className="text-red-600 dark:text-red-400">Confirm Token Replacement</DialogTitle>
                      <DialogDescription className="dark:text-gray-300">
                        Are you sure you want to replace ALL existing tokens? This action cannot be undone.
                        All current tokens will be permanently deleted.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="flex gap-3 justify-end mt-4">
                      <Button
                        variant="outline"
                        onClick={() => setShowBulkConfirmation(false)}
                        data-testid="button-cancel-bulk"
                      >
                        Cancel
                      </Button>
                      <Button
                        className="bg-red-600 hover:bg-red-700 text-white dark:bg-red-600 dark:hover:bg-red-700"
                        onClick={() => bulkReplaceTokensMutation.mutate(bulkReplaceForm.getValues())}
                        disabled={bulkReplaceTokensMutation.isPending}
                        data-testid="button-confirm-bulk"
                      >
                        {bulkReplaceTokensMutation.isPending ? "Replacing..." : "Yes, Replace All"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            {/* Add New Token */}
            <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <h3 className="font-semibold mb-3 text-gray-800 dark:text-white">Add New Token</h3>
              <Form {...addTokenForm}>
                <form
                  onSubmit={addTokenForm.handleSubmit((data) => addTokenMutation.mutate(data))}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={addTokenForm.control}
                      name="label"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-700 dark:text-gray-300">Label</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="e.g., Primary Token"
                              data-testid="input-token-label"
                              className="dark:bg-gray-600 dark:border-gray-500 dark:text-white dark:placeholder-gray-400"
                            />
                          </FormControl>
                          <FormMessage className="dark:text-red-400" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addTokenForm.control}
                      name="token"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-700 dark:text-gray-300">Token</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Enter API bearer token"
                              data-testid="input-new-token"
                              className="font-mono dark:bg-gray-600 dark:border-gray-500 dark:text-white dark:placeholder-gray-400"
                            />
                          </FormControl>
                          <FormMessage className="dark:text-red-400" />
                        </FormItem>
                      )}
                    />
                  </div>
                  <Button
                    type="submit"
                    className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 dark:from-purple-500 dark:to-blue-500 text-white"
                    disabled={addTokenMutation.isPending}
                    data-testid="button-add-token"
                  >
                    {addTokenMutation.isPending ? "Adding..." : "Add Token"}
                  </Button>
                </form>
              </Form>
            </div>

            {/* Token List */}
            {isLoadingTokens ? (
              <p className="text-center py-4 text-gray-600 dark:text-gray-400">Loading tokens...</p>
            ) : tokensData?.tokens.length === 0 ? (
              <p className="text-center py-4 text-gray-600 dark:text-gray-400">
                No tokens added yet. Add a token above to start.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="dark:border-gray-600">
                      <TableHead className="dark:text-gray-300">Label</TableHead>
                      <TableHead className="dark:text-gray-300">Token</TableHead>
                      <TableHead className="dark:text-gray-300">Status</TableHead>
                      <TableHead className="dark:text-gray-300">Requests</TableHead>
                      <TableHead className="dark:text-gray-300">Last Used</TableHead>
                      <TableHead className="dark:text-gray-300">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tokensData?.tokens.map((token) => (
                      <TableRow key={token.id} className="dark:border-gray-600">
                        <TableCell className="font-medium dark:text-white" data-testid={`token-label-${token.id}`}>
                          {token.label}
                        </TableCell>
                        <TableCell className="font-mono text-sm dark:text-gray-300" data-testid={`token-value-${token.id}`}>
                          {token.token.substring(0, 20)}...
                        </TableCell>
                        <TableCell data-testid={`token-status-${token.id}`}>
                          <Switch
                            checked={token.isActive}
                            onCheckedChange={(checked) =>
                              toggleTokenMutation.mutate({ tokenId: token.id, isActive: checked })
                            }
                            data-testid={`switch-token-status-${token.id}`}
                          />
                          <span className={`ml-2 text-sm ${token.isActive ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-500'}`}>
                            {token.isActive ? "Active" : "Inactive"}
                          </span>
                        </TableCell>
                        <TableCell className="dark:text-gray-300" data-testid={`token-requests-${token.id}`}>
                          {token.requestCount}
                        </TableCell>
                        <TableCell className="dark:text-gray-300" data-testid={`token-last-used-${token.id}`}>
                          {token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString() : "Never"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteTokenMutation.mutate(token.id)}
                            disabled={deleteTokenMutation.isPending}
                            data-testid={`button-delete-token-${token.id}`}
                            className="dark:bg-red-600 dark:hover:bg-red-700"
                          >
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
