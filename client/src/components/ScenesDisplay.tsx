import { Button } from "@/components/ui/button";
import { Download, RotateCcw, RefreshCw } from "lucide-react";
import SceneCard from "./SceneCard";
import type { Scene } from "@shared/schema";

interface ScenesDisplayProps {
  scenes: Scene[];
  onStartNew: () => void;
  onRegenerate: () => void;
  isRegenerating?: boolean;
}

export default function ScenesDisplay({ scenes, onStartNew, onRegenerate, isRegenerating = false }: ScenesDisplayProps) {
  const handleExport = () => {
    const dataStr = JSON.stringify(scenes, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scenes.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
      <div className="flex flex-col gap-4 mb-6 sm:mb-8">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">Generated Scenes</h2>
          <p className="text-sm sm:text-base text-muted-foreground">
            {scenes.length} scene{scenes.length !== 1 ? 's' : ''} created for your story
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <Button
            variant="secondary"
            onClick={onStartNew}
            disabled={isRegenerating}
            data-testid="button-start-new"
            className="w-full sm:w-auto text-sm sm:text-base bg-slate-700 hover:bg-slate-600 text-white border-0"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Start New
          </Button>
          <Button
            variant="secondary"
            onClick={onRegenerate}
            disabled={isRegenerating}
            data-testid="button-regenerate-scenes"
            className="w-full sm:w-auto text-sm sm:text-base bg-slate-700 hover:bg-slate-600 text-white border-0"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRegenerating ? 'animate-spin' : ''}`} />
            Regenerate Scenes
          </Button>
          <Button
            onClick={handleExport}
            disabled={isRegenerating}
            data-testid="button-export"
            className="w-full sm:w-auto text-sm sm:text-base bg-purple-600 hover:bg-purple-700 text-white border-0"
          >
            <Download className="w-4 h-4 mr-2" />
            Export JSON
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {scenes.map((scene) => (
          <SceneCard key={scene.scene} scene={scene} />
        ))}
      </div>
    </div>
  );
}
