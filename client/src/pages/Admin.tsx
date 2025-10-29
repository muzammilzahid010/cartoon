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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Shield, LogOut, UserPlus, Home } from "lucide-react";
import { useEffect } from "react";

const createUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  isAdmin: z.boolean().default(false),
});

type CreateUserFormData = z.infer<typeof createUserSchema>;

export default function Admin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: session, isLoading: isLoadingSession } = useQuery<{
    authenticated: boolean;
    user?: { id: string; username: string; isAdmin: boolean };
  }>({
    queryKey: ["/api/session"],
  });

  useEffect(() => {
    if (!isLoadingSession && (!session?.authenticated || !session?.user?.isAdmin)) {
      toast({
        variant: "destructive",
        title: "Access denied",
        description: "You must be an admin to access this page",
      });
      setLocation("/login");
    }
  }, [session, isLoadingSession, setLocation, toast]);

  const form = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      username: "",
      password: "",
      isAdmin: false,
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: CreateUserFormData) => {
      const response = await apiRequest("POST", "/api/users", data);
      const result = await response.json();
      return result as { success: boolean; user: { id: string; username: string; isAdmin: boolean } };
    },
    onSuccess: (data) => {
      toast({
        title: "User created successfully",
        description: `${data.user.username} has been added${data.user.isAdmin ? " as an admin" : ""}`,
      });
      form.reset();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to create user",
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

  const onSubmit = (data: CreateUserFormData) => {
    createUserMutation.mutate(data);
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
      <div className="max-w-4xl mx-auto py-8">
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
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-700 dark:text-gray-300">Username</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Enter username (min 3 characters)"
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
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-700 dark:text-gray-300">Password</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          placeholder="Enter password (min 6 characters)"
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
                  control={form.control}
                  name="isAdmin"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-gray-200 dark:border-gray-600 p-4 bg-gray-50 dark:bg-gray-700">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base text-gray-900 dark:text-white">
                          Admin privileges
                        </FormLabel>
                        <FormDescription className="text-gray-600 dark:text-gray-400">
                          Grant this user administrator access
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
    </div>
  );
}
