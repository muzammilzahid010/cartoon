import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import Hero from "@/components/Hero";
import ProgressStepper from "@/components/ProgressStepper";
import ScriptForm from "@/components/ScriptForm";
import ProcessingState from "@/components/ProcessingState";
import ScenesDisplay from "@/components/ScenesDisplay";
import VideoGenerationProgress from "@/components/VideoGenerationProgress";
import VideosDisplay from "@/components/VideosDisplay";
import type { StoryInput, Scene } from "@shared/schema";

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
  const [videoProgress, setVideoProgress] = useState<VideoProgress[]>([]);
  const [generatedVideos, setGeneratedVideos] = useState<GeneratedVideo[]>([]);
  const [currentVideoScene, setCurrentVideoScene] = useState(0);
  const { toast } = useToast();
  const abortControllersRef = useRef<Map<number, AbortController>>(new Map());

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
      return result as { scenes: Scene[] };
    },
    onSuccess: (data) => {
      setScenes(data.scenes);
      setCurrentStep(3);
      toast({
        title: "Success!",
        description: `Generated ${data.scenes.length} scenes for your story.`,
      });
    },
    onError: (error: Error) => {
      console.error("Error generating scenes:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate scenes. Please try again.",
        variant: "destructive",
      });
      setCurrentStep(1);
    },
  });

  const handleGetStarted = () => {
    setCurrentStep(1);
  };

  const handleFormSubmit = async (data: StoryInput) => {
    setStoryInput(data); // Store the story input for later use
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
      const maxAttempts = 60; // 5 minutes max
      
      for (let i = 0; i < maxAttempts; i++) {
        if (abortController.signal.aborted) break;
        
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        
        if (abortController.signal.aborted) break;
        
        const statusResponse = await fetch('/api/check-video-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ operationName, sceneId }),
          signal: abortController.signal,
        });

        const statusData = await statusResponse.json();
        
        if (statusData.status === 'COMPLETED' || statusData.status === 'MEDIA_GENERATION_STATUS_COMPLETE') {
          if (abortController.signal.aborted) break;
          
          // Use functional update to ensure we work with latest state
          setGeneratedVideos(prev => prev.map(v => 
            v.sceneNumber === sceneNumber 
              ? { sceneNumber: v.sceneNumber, sceneTitle: v.sceneTitle, status: 'completed', videoUrl: statusData.videoUrl }
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

              if (data.type === 'progress') {
                setCurrentVideoScene(data.current);
                setVideoProgress(prev => prev.map(p => 
                  p.sceneNumber === data.sceneNumber 
                    ? { ...p, status: data.status }
                    : p
                ));
              } else if (data.type === 'video_complete') {
                setVideoProgress(prev => prev.map(p => 
                  p.sceneNumber === data.sceneNumber 
                    ? { ...p, status: 'completed', videoUrl: data.videoUrl }
                    : p
                ));
              } else if (data.type === 'error') {
                setVideoProgress(prev => prev.map(p => 
                  p.sceneNumber === data.sceneNumber 
                    ? { ...p, status: 'failed', error: data.error }
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
    <div className="min-h-screen bg-background">
      {currentStep === 0 ? (
        <Hero onGetStarted={handleGetStarted} />
      ) : (
        <>
          <ProgressStepper currentStep={currentStep} steps={STEPS} />
          
          {currentStep === 1 && <ScriptForm onSubmit={handleFormSubmit} />}
          
          {currentStep === 2 && <ProcessingState status="Analyzing your script and generating scenes..." />}
          
          {currentStep === 3 && (
            <div>
              <ScenesDisplay scenes={scenes} onStartNew={handleStartNew} />
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
            <VideoGenerationProgress 
              progress={videoProgress}
              currentScene={currentVideoScene}
              totalScenes={scenes.length}
            />
          )}
          
          {currentStep === 5 && (
            <VideosDisplay 
              videos={generatedVideos}
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
