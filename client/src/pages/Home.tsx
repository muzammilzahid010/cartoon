import { useState, useEffect } from "react";
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
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [videoProgress, setVideoProgress] = useState<VideoProgress[]>([]);
  const [generatedVideos, setGeneratedVideos] = useState<GeneratedVideo[]>([]);
  const [currentVideoScene, setCurrentVideoScene] = useState(0);
  const { toast } = useToast();

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
    setCurrentStep(2);
    generateScenesMutation.mutate(data);
  };

  const handleStartNew = () => {
    setCurrentStep(1);
    setScenes([]);
    setVideoProgress([]);
    setGeneratedVideos([]);
    setCurrentVideoScene(0);
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
        body: JSON.stringify({ scenes }),
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
            />
          )}
        </>
      )}
    </div>
  );
}
