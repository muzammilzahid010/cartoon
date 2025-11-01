import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Film } from "lucide-react";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const response = await apiRequest("POST", "/api/login", data);
      const result = await response.json();
      return result as { success: boolean; user: { id: string; username: string; isAdmin: boolean } };
    },
    onSuccess: async (data) => {
      // Invalidate session cache to force refetch with new session data
      await queryClient.invalidateQueries({ queryKey: ["/api/session"] });
      
      toast({
        title: "Login successful",
        description: `Welcome back, ${data.user.username}!`,
      });
      
      // Small delay to allow session query to update
      setTimeout(() => {
        if (data.user.isAdmin) {
          setLocation("/admin");
        } else {
          setLocation("/");
        }
      }, 100);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Login failed",
        description: error.message || "Invalid username or password",
      });
    },
  });

  const onSubmit = (data: LoginFormData) => {
    loginMutation.mutate(data);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1a2332] via-[#1e2838] to-[#242d3f] dark:from-[#141a25] dark:via-[#181e2a] dark:to-[#1c2230] p-4 md:p-8">
      <Card className="w-full max-w-md shadow-2xl bg-[#1e2838] dark:bg-[#181e2a] border border-white/10 animate-scale-in backdrop-blur-sm">
        <CardHeader className="space-y-3 text-center pb-6">
          <div className="flex justify-center mb-2">
            <div className="p-4 rounded-2xl bg-purple-600/30 border border-purple-500/50 shadow-lg transform transition-transform hover:scale-105 duration-300">
              <Film className="w-10 h-10 text-purple-400" />
            </div>
          </div>
          <CardTitle className="text-3xl md:text-4xl font-bold text-white">Welcome Back</CardTitle>
          <CardDescription className="text-base text-gray-300">
            Sign in to create amazing AI-powered videos
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
                    <FormLabel className="text-white">Username</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Enter your username"
                        data-testid="input-username"
                        className="bg-[#242d3f]/50 border-white/10 text-white placeholder:text-gray-400"
                        disabled={loginMutation.isPending}
                      />
                    </FormControl>
                    <FormMessage className="text-red-300" />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Password</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="Enter your password"
                        data-testid="input-password"
                        className="bg-[#242d3f]/50 border-white/10 text-white placeholder:text-gray-400"
                        disabled={loginMutation.isPending}
                      />
                    </FormControl>
                    <FormMessage className="text-red-300" />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full bg-purple-600 hover:bg-purple-700 text-white border-0"
                disabled={loginMutation.isPending}
                data-testid="button-login"
              >
                {loginMutation.isPending ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
