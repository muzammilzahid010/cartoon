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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Shield, LogOut, UserPlus, Home, Edit, Key, Calendar, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

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

type CreateUserFormData = z.infer<typeof createUserSchema>;
type UpdatePlanFormData = z.infer<typeof updatePlanSchema>;
type UpdateTokenFormData = z.infer<typeof updateTokenSchema>;

interface UserData {
  id: string;
  username: string;
  isAdmin: boolean;
  planType: string;
  planStatus: string;
  planExpiry: string | null;
  apiToken: string | null;
}

export default function Admin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingTokenUserId, setEditingTokenUserId] = useState<string | null>(null);

  const { data: session, isLoading: isLoadingSession } = useQuery<{
    authenticated: boolean;
    user?: { id: string; username: string; isAdmin: boolean };
  }>({
    queryKey: ["/api/session"],
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  const { data: usersData, isLoading: isLoadingUsers } = useQuery<{ users: UserData[] }>({
    queryKey: ["/api/users"],
    enabled: !isLoadingSession && session?.authenticated === true && session?.user?.isAdmin === true,
  });

  useEffect(() => {
    if (!isLoadingSession && session) {
      if (!session.authenticated || !session.user?.isAdmin) {
        toast({
          variant: "destructive",
          title: "Access denied",
          description: "You must be an admin to access this page",
        });
        setLocation("/login");
      }
    }
  }, [session, isLoadingSession, setLocation, toast]);

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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <p className="text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!session?.authenticated || !session?.user?.isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4">
      <div className="max-w-7xl mx-auto py-8">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 dark:from-purple-500 dark:to-blue-500">
              <Shield className="w-6 h-6 text-white dark:text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Admin Panel</h1>
              <p className="text-gray-600 dark:text-gray-400">
                Logged in as <span className="font-medium text-gray-900 dark:text-white">{session.user.username}</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setLocation("/")}
              data-testid="button-home"
              className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <Home className="w-4 h-4 mr-2" />
              Home
            </Button>
            <Button
              variant="outline"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              data-testid="button-logout"
              className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>

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
      </div>
    </div>
  );
}
