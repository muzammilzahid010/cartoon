import { Loader2, Sparkles } from "lucide-react";

interface ProcessingStateProps {
  status?: string;
}

export default function ProcessingState({ status = "Analyzing your script..." }: ProcessingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] px-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="relative">
          <div className="absolute inset-0 flex items-center justify-center">
            <Sparkles className="w-12 h-12 text-primary/20 animate-pulse" />
          </div>
          <Loader2 className="w-16 h-16 text-primary animate-spin mx-auto" />
        </div>
        
        <div>
          <h2 className="text-2xl font-bold mb-2">Creating Your Scenes</h2>
          <p className="text-muted-foreground" data-testid="text-processing-status">
            {status}
          </p>
        </div>
        
        <div className="bg-muted rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            <p className="text-sm">Analyzing script structure...</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse delay-150" />
            <p className="text-sm">Processing character details...</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse delay-300" />
            <p className="text-sm">Generating scene descriptions...</p>
          </div>
        </div>
      </div>
    </div>
  );
}
