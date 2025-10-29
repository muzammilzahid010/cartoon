import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Loader2, Video, AlertCircle } from "lucide-react";

interface VideoProgress {
  sceneNumber: number;
  sceneTitle: string;
  status: 'pending' | 'starting' | 'generating' | 'completed' | 'failed';
  videoUrl?: string;
  error?: string;
  message?: string;
  timestamp?: string;
}

interface VideoGenerationProgressProps {
  progress: VideoProgress[];
  currentScene: number;
  totalScenes: number;
}

export default function VideoGenerationProgress({ 
  progress, 
  currentScene, 
  totalScenes 
}: VideoGenerationProgressProps) {
  const percentage = (currentScene / totalScenes) * 100;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-2">Generating Videos</h2>
        <p className="text-muted-foreground">
          Processing scene {currentScene} of {totalScenes}
        </p>
      </div>

      <Card className="p-6 mb-6">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Overall Progress</span>
            <span className="text-muted-foreground">
              {Math.round(percentage)}%
            </span>
          </div>
          <Progress value={percentage} className="h-3" />
        </div>
      </Card>

      <div className="space-y-4">
        {progress.map((item) => (
          <Card 
            key={item.sceneNumber} 
            className="p-4"
            data-testid={`video-progress-${item.sceneNumber}`}
          >
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0">
                {item.status === 'completed' && (
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                )}
                {(item.status === 'generating' || item.status === 'starting') && (
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                )}
                {item.status === 'pending' && (
                  <Video className="w-6 h-6 text-muted-foreground" />
                )}
                {item.status === 'failed' && (
                  <AlertCircle className="w-6 h-6 text-destructive" />
                )}
              </div>

              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold">
                      Scene {item.sceneNumber}: {item.sceneTitle}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {item.message || (
                        <>
                          {item.status === 'starting' && 'Preparing video...'}
                          {item.status === 'generating' && 'Generating video...'}
                          {item.status === 'completed' && 'Video ready'}
                          {item.status === 'pending' && 'Waiting...'}
                          {item.status === 'failed' && `Failed: ${item.error}`}
                        </>
                      )}
                    </p>
                    {item.timestamp && (
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
