import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import Hero from "@/components/Hero";
import ProgressStepper from "@/components/ProgressStepper";
import ScriptForm from "@/components/ScriptForm";
import ProcessingState from "@/components/ProcessingState";
import ScenesDisplay from "@/components/ScenesDisplay";
import VideoGenerationProgress from "@/components/VideoGenerationProgress";
import VideosDisplay from "@/components/VideosDisplay";
import type { StoryInput, Scene } from "@shared/schema";
import { LogIn, Shield, LogOut, User, Menu, PlayCircle, History as HistoryIcon, Film, Layers, Sparkles } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STEPS = [
  { id: 1, title: "Story & Characters", description: "Input details" },
  { id: 2, title: "Generate Scenes", description: "AI processing" },
  { id: 3, title: "Review Scenes", description: "View scenes" },
  { id: 4, title: "Generate Videos", description: "Create videos" },
  { id: 5, title: "View Videos", description: "Watch & download" },
];

interface VideoProgress {
  sceneNumber: number;
  sceneTitle: string;
  status: 'pending' | 'starting' | 'generating' | 'completed' | 'failed';
  videoUrl?: string;
  error?: string;
  message?: string;
  timestamp?: string;
}

interface GeneratedVideo {
  sceneNumber: number;
  sceneTitle: string;
  videoUrl?: string;
  status: string;
  error?: string;
}

export default function Home() {
  const [currentStep, setCurrentStep] = useState(0);
  const [storyInput, setStoryInput] = useState<StoryInput | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [videoProgress, setVideoProgress] = useState<VideoProgress[]>([]);
  const [generatedVideos, setGeneratedVideos] = useState<GeneratedVideo[]>([]);
  const [currentVideoScene, setCurrentVideoScene] = useState(0);
  const [sceneGenerationError, setSceneGenerationError] = useState<string | null>(null);
  const { toast } = useToast();
  const abortControllersRef = useRef<Map<number, AbortController>>(new Map());
  const [, setLocation] = useLocation();

  const { data: session, isLoading: sessionLoading } = useQuery<{
    authenticated: boolean;
    user?: { id: string; username: string; isAdmin: boolean };
  }>({
    queryKey: ["/api/session"],
  });

  // Redirect to login if not authenticated and trying to create content
  useEffect(() => {
    if (!sessionLoading && session && !session.authenticated && currentStep > 0) {
      toast({
        title: "Authentication required",
        description: "Please log in to create videos and cartoons.",
        variant: "destructive",
      });
      setLocation("/login");
    }
  }, [session, sessionLoading, currentStep, setLocation, toast]);

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

  // Cleanup abort controllers on unmount or step change
  useEffect(() => {
    return () => {
      // Abort all ongoing retries when component unmounts or step changes
      abortControllersRef.current.forEach(controller => controller.abort());
      abortControllersRef.current.clear();
    };
  }, [currentStep]);

  const generateScenesMutation = useMutation({
    mutationFn: async (data: StoryInput) => {
      const response = await apiRequest("POST", "/api/generate-scenes", data);
      const result = await response.json();
      return result as { scenes: Scene[]; projectId: string };
    },
    onSuccess: (data) => {
      setScenes(data.scenes);
      setCurrentProjectId(data.projectId);
      setSceneGenerationError(null);
      setCurrentStep(3);
      toast({
        title: "Success!",
        description: `Generated ${data.scenes.length} scenes for your story.`,
      });
    },
    onError: (error: Error) => {
      console.error("Error generating scenes:", error);
      setSceneGenerationError(error.message || "Failed to generate scenes. Please try again.");
      toast({
        title: "Scene Generation Failed",
        description: error.message || "Failed to generate scenes. Please try again.",
        variant: "destructive",
      });
      // Stay on step 2 to show error with retry button
    },
  });

  const handleGetStarted = () => {
    if (!session?.authenticated) {
      toast({
        title: "Authentication required",
        description: "Please log in to create videos and cartoons.",
        variant: "destructive",
      });
      setLocation("/login");
      return;
    }
    setCurrentStep(1);
  };

  const handleFormSubmit = async (data: StoryInput) => {
    setStoryInput(data); // Store the story input for later use
    setSceneGenerationError(null); // Clear any previous errors
    setCurrentStep(2);
    generateScenesMutation.mutate(data);
  };

  const handleStartNew = () => {
    setCurrentStep(1);
    setStoryInput(null);
    setScenes([]);
    setVideoProgress([]);
    setGeneratedVideos([]);
    setCurrentVideoScene(0);
    setSceneGenerationError(null);
  };

  const handleRegenerateScenes = () => {
    if (!storyInput) {
      toast({
        title: "Error",
        description: "No story input found. Please start a new story.",
        variant: "destructive",
      });
      return;
    }
    
    setSceneGenerationError(null); // Clear error before retry
    setCurrentStep(2);
    generateScenesMutation.mutate(storyInput);
  };

  const handleRetrySceneGeneration = () => {
    if (!storyInput) {
      toast({
        title: "Error",
        description: "No story input found. Please start a new story.",
        variant: "destructive",
      });
      return;
    }
    
    setSceneGenerationError(null); // Clear error before retry
    generateScenesMutation.mutate(storyInput);
  };

  const handleRetryVideo = async (sceneNumber: number) => {
    // Find the scene to retry
    const scene = scenes.find(s => s.scene === sceneNumber);
    if (!scene) {
      toast({
        title: "Error",
        description: "Scene not found",
        variant: "destructive",
      });
      return;
    }

    // Abort any existing retry for this scene to prevent concurrent retries
    const existingController = abortControllersRef.current.get(sceneNumber);
    if (existingController) {
      existingController.abort();
      abortControllersRef.current.delete(sceneNumber);
    }

    // Create abort controller for this retry
    const abortController = new AbortController();
    abortControllersRef.current.set(sceneNumber, abortController);

    // Update the video status to show it's being regenerated (functional update)
    setGeneratedVideos(prev => prev.map(v => 
      v.sceneNumber === sceneNumber 
        ? { ...v, status: 'generating', error: undefined }
        : v
    ));

    try {
      const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scene }),
        signal: abortController.signal,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to start video generation');
      }

      // Poll for completion
      const { operationName, sceneId } = result;
      const maxAttempts = 300; // 5 minutes max with 1s polling
      
      for (let i = 0; i < maxAttempts; i++) {
        if (abortController.signal.aborted) break;
        
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        
        if (abortController.signal.aborted) break;
        
        const statusResponse = await fetch('/api/check-video-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ operationName, sceneId }),
          signal: abortController.signal,
        });

        const statusData = await statusResponse.json();
        
        if (statusData.status === 'COMPLETED' || statusData.status === 'MEDIA_GENERATION_STATUS_COMPLETE' || statusData.status === 'MEDIA_GENERATION_STATUS_SUCCESSFUL') {
          if (abortController.signal.aborted) break;
          
          // Use functional update to ensure we work with latest state
          // Add cache-busting timestamp to force browser to reload the new video
          const cacheBustedUrl = statusData.videoUrl ? `${statusData.videoUrl}${statusData.videoUrl.includes('?') ? '&' : '?'}t=${Date.now()}` : undefined;
          setGeneratedVideos(prev => prev.map(v => 
            v.sceneNumber === sceneNumber 
              ? { sceneNumber: v.sceneNumber, sceneTitle: v.sceneTitle, status: 'completed', videoUrl: cacheBustedUrl }
              : v
          ));
          toast({
            title: "Video Regenerated!",
            description: `Scene ${sceneNumber} has been successfully regenerated.`,
          });
          return;
        } else if (statusData.status === 'FAILED' || statusData.status === 'MEDIA_GENERATION_STATUS_FAILED') {
          throw new Error(statusData.error || 'Video generation failed');
        }
      }

      if (!abortController.signal.aborted) {
        throw new Error('Video generation timed out');
      }
    } catch (error) {
      // Don't show errors if aborted
      if (abortController.signal.aborted) return;
      
      console.error("Error regenerating video:", error);
      // Use functional update to ensure we work with latest state
      setGeneratedVideos(prev => prev.map(v => 
        v.sceneNumber === sceneNumber 
          ? { ...v, status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' }
          : v
      ));
      toast({
        title: "Regeneration Failed",
        description: error instanceof Error ? error.message : "Failed to regenerate video.",
        variant: "destructive",
      });
    } finally {
      // Clean up abort controller
      abortControllersRef.current.delete(sceneNumber);
    }
  };

  const handleRetryAllFailed = async () => {
    // Get current failed videos using functional state access
    let failedSceneNumbers: number[] = [];
    setGeneratedVideos(prev => {
      failedSceneNumbers = prev.filter(v => v.status === 'failed').map(v => v.sceneNumber);
      return prev;
    });
    
    // Process each failed video sequentially
    for (const sceneNumber of failedSceneNumbers) {
      // Check if still failed (in case state changed)
      let shouldRetry = false;
      setGeneratedVideos(prev => {
        shouldRetry = prev.some(v => v.sceneNumber === sceneNumber && v.status === 'failed');
        return prev;
      });
      
      if (shouldRetry) {
        await handleRetryVideo(sceneNumber);
      }
    }
  };

  const handleGenerateVideos = async () => {
    setCurrentStep(4);
    
    // Initialize progress for all scenes
    const initialProgress: VideoProgress[] = scenes.map(scene => ({
      sceneNumber: scene.scene,
      sceneTitle: scene.title,
      status: 'pending' as const
    }));
    setVideoProgress(initialProgress);
    setCurrentVideoScene(0);

    try {
      const response = await fetch('/api/generate-all-videos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          scenes,
          characters: storyInput?.characters 
        }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response reader available');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete lines from buffer
        const lines = buffer.split('\n');
        
        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              
              // Log all SSE updates for debugging
              console.log('[SSE Received]', data.type, 'Scene:', data.sceneNumber, '-', data.message || data.status);

              if (data.type === 'progress') {
                if (data.current) {
                  setCurrentVideoScene(data.current);
                }
                setVideoProgress(prev => prev.map(p => 
                  p.sceneNumber === data.sceneNumber 
                    ? { 
                        ...p, 
                        status: data.status,
                        message: data.message,
                        timestamp: data.timestamp
                      }
                    : p
                ));
              } else if (data.type === 'video_complete') {
                setVideoProgress(prev => prev.map(p => 
                  p.sceneNumber === data.sceneNumber 
                    ? { 
                        ...p, 
                        status: 'completed', 
                        videoUrl: data.videoUrl,
                        message: 'Complete',
                        timestamp: data.timestamp
                      }
                    : p
                ));

                // Save completed video to history
                (async () => {
                  try {
                    const sceneData = scenes.find(s => s.scene === data.sceneNumber);
                    console.log('[Video History] Saving scene', data.sceneNumber, 'to history');
                    const response = await fetch('/api/video-history', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      credentials: 'include',
                      body: JSON.stringify({
                        prompt: sceneData?.description || 'Scene video',
                        aspectRatio: 'landscape',
                        status: 'completed',
                        videoUrl: data.videoUrl,
                        title: sceneData?.title || `Scene ${data.sceneNumber}`,
                      }),
                    });
                    
                    if (response.ok) {
                      const result = await response.json();
                      console.log('[Video History] Saved successfully:', result.video.id);
                    } else {
                      console.error('[Video History] Failed to save:', await response.text());
                    }
                  } catch (historyError) {
                    console.error('[Video History] Error:', historyError);
                  }
                })();
              } else if (data.type === 'error') {
                setVideoProgress(prev => prev.map(p => 
                  p.sceneNumber === data.sceneNumber 
                    ? { 
                        ...p, 
                        status: 'failed', 
                        error: data.error,
                        timestamp: data.timestamp
                      }
                    : p
                ));
              } else if (data.type === 'complete') {
                setGeneratedVideos(data.videos);
                setCurrentStep(5);
                toast({
                  title: "Videos Generated!",
                  description: `Successfully generated ${data.videos.filter((v: GeneratedVideo) => v.status === 'completed').length} videos.`,
                });
              }
            } catch (parseError) {
              console.error("Error parsing SSE data:", parseError, "Line:", line);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error generating videos:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate videos.",
        variant: "destructive",
      });
      setCurrentStep(3);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a2332] via-[#1e2838] to-[#242d3f] dark:from-[#141a25] dark:via-[#181e2a] dark:to-[#1c2230]">
      <header className="border-b border-white/10 bg-[#1c2534]/80 dark:bg-[#161c28]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 py-2 sm:py-3 flex justify-between items-center gap-2">
          <div className="flex items-center gap-1 sm:gap-3 flex-1 min-w-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" data-testid="button-menu" className="shrink-0 text-white hover:bg-white/10">
                  <Menu className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <Link href="/">
                  <DropdownMenuItem data-testid="menu-cartoon-generator">
                    <Sparkles className="w-4 h-4 mr-2" />
                    Cartoon Story Generator
                  </DropdownMenuItem>
                </Link>
                <Link href="/veo-generator">
                  <DropdownMenuItem data-testid="menu-veo-generator">
                    <PlayCircle className="w-4 h-4 mr-2" />
                    VEO 3.1 Video Generator
                  </DropdownMenuItem>
                </Link>
                <Link href="/bulk-generator">
                  <DropdownMenuItem data-testid="menu-bulk-generator">
                    <Layers className="w-4 h-4 mr-2" />
                    Bulk Video Generator
                  </DropdownMenuItem>
                </Link>
                <Link href="/projects">
                  <DropdownMenuItem data-testid="menu-projects">
                    <Film className="w-4 h-4 mr-2" />
                    My Projects
                  </DropdownMenuItem>
                </Link>
                <Link href="/history">
                  <DropdownMenuItem data-testid="menu-history">
                    <HistoryIcon className="w-4 h-4 mr-2" />
                    Video History
                  </DropdownMenuItem>
                </Link>
              </DropdownMenuContent>
            </DropdownMenu>
            <h1 className="text-sm sm:text-base md:text-lg font-semibold text-white truncate">
              <span className="hidden sm:inline">Cartoon Story Video Generator</span>
              <span className="sm:hidden">Story Generator</span>
            </h1>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {session?.authenticated ? (
              <>
                <div className="hidden md:flex items-center gap-2 text-sm text-gray-300">
                  <User className="w-4 h-4" />
                  <span className="text-white">{session.user?.username}</span>
                </div>
                {session.user?.isAdmin && (
                  <Link href="/admin">
                    <Button variant="outline" size="sm" data-testid="link-admin" className="border-white/20 text-white hover:bg-white/10 hidden sm:inline-flex">
                      <Shield className="w-4 h-4 sm:mr-1" />
                      <span className="hidden sm:inline">Admin</span>
                    </Button>
                  </Link>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => logoutMutation.mutate()}
                  disabled={logoutMutation.isPending}
                  data-testid="button-header-logout"
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  <LogOut className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">Logout</span>
                </Button>
              </>
            ) : (
              <Link href="/login">
                <Button variant="outline" size="sm" data-testid="link-login" className="border-white/20 text-white hover:bg-white/10">
                  <LogIn className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">Login</span>
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>
      {currentStep === 0 ? (
        <Hero onGetStarted={handleGetStarted} />
      ) : (
        <>
          <ProgressStepper currentStep={currentStep} steps={STEPS} />
          
          {currentStep === 1 && <ScriptForm onSubmit={handleFormSubmit} />}
          
          {currentStep === 2 && !sceneGenerationError && (
            <ProcessingState status="Analyzing your script and generating scenes..." />
          )}

          {currentStep === 2 && sceneGenerationError && (
            <div className="max-w-2xl mx-auto px-4 py-16">
              <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-2xl p-8 text-center">
                <div className="mb-6">
                  <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center mb-4">
                    <svg 
                      className="w-8 h-8 text-red-600 dark:text-red-400" 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={2} 
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
                      />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-red-900 dark:text-red-100 mb-2">
                    Scene Generation Failed
                  </h2>
                  <p className="text-red-700 dark:text-red-300 mb-6">
                    {sceneGenerationError}
                  </p>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button
                    size="lg"
                    onClick={handleRetrySceneGeneration}
                    disabled={generateScenesMutation.isPending}
                    className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 dark:from-purple-500 dark:to-blue-500 text-white"
                    data-testid="button-retry-scenes"
                  >
                    {generateScenesMutation.isPending ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Retrying...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Try Again
                      </>
                    )}
                  </Button>
                  
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={handleStartNew}
                    disabled={generateScenesMutation.isPending}
                    className="border-2"
                    data-testid="button-start-over"
                  >
                    Start Over
                  </Button>
                </div>
              </div>
            </div>
          )}
          
          {currentStep === 3 && (
            <div>
              <ScenesDisplay 
                scenes={scenes} 
                onStartNew={handleStartNew}
                onRegenerate={handleRegenerateScenes}
                isRegenerating={generateScenesMutation.isPending}
              />
              <div className="max-w-6xl mx-auto px-4 pb-8">
                <div className="flex justify-center">
                  <Button
                    size="lg"
                    onClick={handleGenerateVideos}
                    className="h-14 px-12 rounded-full"
                    data-testid="button-generate-videos"
                  >
                    Generate Videos with VEO 3
                  </Button>
                </div>
              </div>
            </div>
          )}
          
          {currentStep === 4 && (
            <>
              <VideoGenerationProgress 
                progress={videoProgress}
                currentScene={currentVideoScene}
                totalScenes={scenes.length}
              />
              {videoProgress.some(v => v.status !== 'completed' && v.status !== 'failed') && (
                <div className="max-w-4xl mx-auto px-4 pb-4">
                  <p className="text-center text-sm text-muted-foreground">
                    💡 Tip: If videos seem stuck, check <Link href="/history" className="text-purple-400 hover:text-purple-300 underline">Video History</Link> - they might already be ready!
                  </p>
                </div>
              )}
            </>
          )}
          
          {currentStep === 5 && (
            <VideosDisplay 
              videos={generatedVideos}
              projectId={currentProjectId}
              onStartNew={handleStartNew}
              onRetryVideo={handleRetryVideo}
              onRetryAllFailed={handleRetryAllFailed}
            />
          )}
        </>
      )}
    </div>
  );
}
