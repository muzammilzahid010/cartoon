import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Hero from "@/components/Hero";
import ProgressStepper from "@/components/ProgressStepper";
import ScriptForm from "@/components/ScriptForm";
import ProcessingState from "@/components/ProcessingState";
import ScenesDisplay from "@/components/ScenesDisplay";
import type { StoryInput, Scene } from "@shared/schema";

const STEPS = [
  { id: 1, title: "Story & Characters", description: "Input details" },
  { id: 2, title: "Generate Scenes", description: "AI processing" },
  { id: 3, title: "Review & Export", description: "View results" },
];

export default function Home() {
  const [currentStep, setCurrentStep] = useState(0);
  const [scenes, setScenes] = useState<Scene[]>([]);
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
  };

  return (
    <div className="min-h-screen bg-background">
      {currentStep === 0 ? (
        <Hero onGetStarted={handleGetStarted} />
      ) : (
        <>
          <ProgressStepper currentStep={currentStep} steps={STEPS} />
          
          {currentStep === 1 && <ScriptForm onSubmit={handleFormSubmit} />}
          
          {currentStep === 2 && <ProcessingState />}
          
          {currentStep === 3 && <ScenesDisplay scenes={scenes} onStartNew={handleStartNew} />}
        </>
      )}
    </div>
  );
}
