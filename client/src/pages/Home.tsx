import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, useLocation } from "wouter";
import { LogIn, Shield, LogOut, User, Menu, PlayCircle, History as HistoryIcon, Film, Sparkles, Wand2, Video, ImageIcon, FileVideo, Crown, Calendar, TrendingUp } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export default function Home() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: session } = useQuery<{
    authenticated: boolean;
    user?: { 
      id: string; 
      username: string; 
      isAdmin: boolean;
      planType: string;
      planStatus: string;
      planExpiry: string | null;
      dailyVideoCount: number;
    };
  }>({
    queryKey: ["/api/session"],
  });

  // Calculate plan details
  const getPlanConfig = () => {
    if (!session?.user) return null;
    
    const { planType, isAdmin } = session.user;
    
    if (isAdmin) {
      return {
        name: "Admin",
        dailyLimit: Infinity,
        color: "from-purple-500 to-pink-500",
        badge: "Unlimited",
      };
    }

    switch (planType) {
      case "scale":
        return {
          name: "Scale Plan",
          dailyLimit: 1000,
          color: "from-blue-500 to-cyan-500",
          badge: "900 PKR",
        };
      case "empire":
        return {
          name: "Empire Plan",
          dailyLimit: 2000,
          color: "from-orange-500 to-red-500",
          badge: "1500 PKR",
        };
      default:
        return {
          name: "Free Plan",
          dailyLimit: 0,
          color: "from-gray-500 to-gray-600",
          badge: "Free",
        };
    }
  };

  const planConfig = getPlanConfig();
  const dailyUsagePercent = session?.user && planConfig && planConfig.dailyLimit > 0
    ? (session.user.dailyVideoCount / planConfig.dailyLimit) * 100
    : 0;

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
    },
  });

  const tools = [
    {
      title: "VEO 3.1 Video Generator",
      description: "Generate single videos from prompts using VEO 3.1 AI",
      icon: PlayCircle,
      href: "/veo-generator",
      gradient: "from-purple-500 to-pink-500",
      testId: "link-veo-generator"
    },
    {
      title: "Bulk Video Generator",
      description: "Generate multiple videos simultaneously with batch processing",
      icon: Video,
      href: "/bulk-generator",
      gradient: "from-blue-500 to-cyan-500",
      testId: "link-bulk-generator"
    },
    {
      title: "Text to Image Generator",
      description: "Create stunning AI-generated images from text descriptions",
      icon: ImageIcon,
      href: "/text-to-image",
      gradient: "from-pink-500 to-rose-500",
      testId: "link-text-to-image"
    },
    {
      title: "Image to Video",
      description: "Transform static images into dynamic videos with AI",
      icon: FileVideo,
      href: "/image-to-video",
      gradient: "from-indigo-500 to-purple-500",
      testId: "link-image-to-video"
    },
    {
      title: "Script Creator",
      description: "Create detailed animated storyboards with AI (GPT-5)",
      icon: Wand2,
      href: "/script-creator",
      gradient: "from-green-500 to-emerald-500",
      testId: "link-script-creator"
    },
    {
      title: "Video History",
      description: "View, manage, and download all your generated videos",
      icon: HistoryIcon,
      href: "/history",
      gradient: "from-orange-500 to-red-500",
      testId: "link-history"
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a2332] via-[#1e2838] to-[#242d3f] dark:from-[#141a25] dark:via-[#181e2a] dark:to-[#1c2230]">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#1c2534]/80 dark:bg-[#161c28]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Film className="w-5 h-5 sm:w-6 sm:h-6 text-purple-400" />
            <h1 className="text-sm sm:text-base md:text-lg font-semibold text-white">AI Video Generator</h1>
          </div>
          
          <div className="flex items-center gap-2">
            {session?.authenticated ? (
              <>
                <div className="hidden sm:flex items-center gap-2 mr-2">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-300">{session.user?.username}</span>
                </div>
                
                {session.user?.isAdmin && (
                  <Link href="/admin">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="border-white/20 text-white hover:bg-white/10"
                      data-testid="link-admin"
                    >
                      <Shield className="w-4 h-4 sm:mr-1" />
                      <span className="hidden sm:inline">Admin</span>
                    </Button>
                  </Link>
                )}
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => logoutMutation.mutate()}
                  className="border-white/20 text-white hover:bg-white/10"
                  data-testid="button-logout"
                >
                  <LogOut className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">Logout</span>
                </Button>
              </>
            ) : (
              <Link href="/login">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="border-white/20 text-white hover:bg-white/10"
                  data-testid="link-login"
                >
                  <LogIn className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">Login</span>
                </Button>
              </Link>
            )}
            
            {/* Mobile menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="sm:hidden border-white/20 text-white hover:bg-white/10"
                  data-testid="button-mobile-menu"
                >
                  <Menu className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-[#1e2838] border-white/10">
                <DropdownMenuItem asChild>
                  <Link href="/veo-generator" className="text-white cursor-pointer">
                    <PlayCircle className="w-4 h-4 mr-2" />
                    VEO Generator
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/bulk-generator" className="text-white cursor-pointer">
                    <Video className="w-4 h-4 mr-2" />
                    Bulk Generator
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/script-creator" className="text-white cursor-pointer">
                    <Wand2 className="w-4 h-4 mr-2" />
                    Script Creator
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/history" className="text-white cursor-pointer">
                    <HistoryIcon className="w-4 h-4 mr-2" />
                    Video History
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 sm:py-12">
        {/* Hero Section */}
        <div className="text-center mb-12 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 mb-6">
            <Film className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-gray-200 font-medium">AI-Powered Video Generation Platform</span>
          </div>
          
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-4">
            AI Video Generator
          </h1>
          
          <p className="text-lg sm:text-xl text-gray-300 max-w-3xl mx-auto">
            Transform your ideas into stunning Disney Pixar-style 3D animated videos using cutting-edge AI technology
          </p>
        </div>

        {/* Plan Information Card - Only show for authenticated users */}
        {session?.authenticated && planConfig && (
          <Card className="max-w-2xl mx-auto mb-8 bg-white/5 backdrop-blur-sm border-white/10 animate-slide-up">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${planConfig.color}`}>
                    <Crown className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-white text-lg">{planConfig.name}</CardTitle>
                    <CardDescription className="text-gray-300 text-sm">
                      {session.user?.username}
                    </CardDescription>
                  </div>
                </div>
                <Badge className={`bg-gradient-to-br ${planConfig.color} text-white border-0`}>
                  {planConfig.badge}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {session.user?.planExpiry && (
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-gray-300">
                    <Calendar className="w-4 h-4" />
                    <span>Expires:</span>
                  </div>
                  <span className="text-white font-medium">
                    {new Date(session.user.planExpiry).toLocaleDateString()}
                  </span>
                </div>
              )}
              
              {planConfig.dailyLimit > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-gray-300">
                      <TrendingUp className="w-4 h-4" />
                      <span>Daily Usage:</span>
                    </div>
                    <span className="text-white font-medium">
                      {session.user?.dailyVideoCount || 0} / {planConfig.dailyLimit}
                    </span>
                  </div>
                  <Progress 
                    value={dailyUsagePercent} 
                    className="h-2 bg-white/10"
                  />
                  {dailyUsagePercent >= 90 && (
                    <p className="text-xs text-orange-300 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      You're close to your daily limit!
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tools Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {tools.map((tool, index) => {
            const Icon = tool.icon;
            return (
              <Link key={tool.href} href={tool.href}>
                <Card 
                  className="group bg-white/5 backdrop-blur-sm border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-300 cursor-pointer h-full animate-slide-up"
                  style={{ animationDelay: `${index * 0.1}s` }}
                  data-testid={tool.testId}
                >
                  <CardHeader>
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-xl bg-gradient-to-br ${tool.gradient} shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-white text-xl mb-2">{tool.title}</CardTitle>
                        <CardDescription className="text-gray-300">
                          {tool.description}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>

        {/* Footer Info */}
        <div className="mt-16 text-center">
          <div className="inline-flex items-center gap-2 text-gray-400 text-sm">
            <Sparkles className="w-4 h-4" />
            <span>Powered by VEO 3.1 and GPT-5</span>
          </div>
        </div>
      </main>
    </div>
  );
}
