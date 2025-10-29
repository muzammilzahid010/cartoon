import { useState } from "react";
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

  const handleGetStarted = () => {
    setCurrentStep(1);
  };

  const handleFormSubmit = async (data: StoryInput) => {
    console.log("Form submitted:", data);
    setCurrentStep(2);

    //todo: remove mock functionality - Replace with actual API call
    setTimeout(() => {
      const mockScenes: Scene[] = [
        {
          scene: 1,
          title: "Opening Scene",
          description: `visuals: A wide, vibrant shot of the city, filled with towering, colorful buildings and flying vehicles. Sunlight glints off reflective surfaces. Camera slowly pans across the bustling cityscape.
dialogue_action: N/A (establishing shot)
music: Upbeat, optimistic orchestral music with a driving rhythm (strings, brass, light percussion).
sound_effects: Distant city hum, occasional whoosh of flying vehicles.
transition: Fade in from black.`
        },
        {
          scene: 2,
          title: "Character Introduction",
          description: `visuals: Close-up on ${data.characters[0]?.name || "the main character"} as they stride confidently into view. ${data.characters[0]?.description || "A determined expression on their face"}.
dialogue_action: ${data.characters[0]?.name || "Character"} (with enthusiasm): "Let's make this happen!"
music: Energetic theme music with building intensity.
sound_effects: Footsteps, ambient sounds.
transition: Quick cut.`
        }
      ];
      
      setScenes(mockScenes);
      setCurrentStep(3);
    }, 3000);
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
