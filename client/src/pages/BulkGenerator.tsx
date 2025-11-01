import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { Home, Loader2, CheckCircle, XCircle, Clock, AlertCircle, Layers } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";

type AspectRatio = "landscape" | "portrait";

interface VideoGenerationStatus {
  prompt: string;
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl?: string;
  error?: string;
}

export default function BulkGenerator() {
  const [prompts, setPrompts] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("landscape");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<VideoGenerationStatus[]>([]);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: session, isLoading: sessionLoading } = useQuery<{
    authenticated: boolean;
    user?: { id: string; username: string; isAdmin: boolean };
  }>({
    queryKey: ["/api/session"],
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!sessionLoading && session && !session.authenticated) {
      toast({
        title: "Authentication required",
        description: "Please log in to generate videos.",
        variant: "destructive",
      });
      setLocation("/login");
    }
  }, [session, sessionLoading, setLocation, toast]);

  const handleGenerate = async () => {
    // Parse prompts (one per line)
    const promptLines = prompts
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    // Validate
    if (promptLines.length === 0) {
      toast({
        title: "No prompts found",
        description: "Please enter at least one prompt",
        variant: "destructive",
      });
      return;
    }

    if (promptLines.length > 20) {
      toast({
        title: "Too many prompts",
        description: "Maximum 20 prompts allowed. Please remove some prompts.",
        variant: "destructive",
      });
      return;
    }

    // Initialize progress tracking
    const initialProgress: VideoGenerationStatus[] = promptLines.map(prompt => ({
      prompt,
      status: "pending",
    }));
    setGenerationProgress(initialProgress);
    setIsGenerating(true);

    // STEP 1: Save ALL videos to history IMMEDIATELY (with "queued" status)
    // This ensures all videos appear in history even if user reloads the page
    const historyEntryIds: (string | null)[] = [];
    
    for (let i = 0; i < promptLines.length; i++) {
      const currentPrompt = promptLines[i];
      try {
        const historyResponse = await fetch('/api/video-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            prompt: currentPrompt,
            aspectRatio,
            status: 'queued',
            title: `Bulk VEO ${aspectRatio} video ${i + 1}`,
          }),
        });
        
        if (historyResponse.ok) {
          const historyData = await historyResponse.json();
          historyEntryIds.push(historyData.video.id);
          console.log(`Saved video ${i + 1} to history with ID: ${historyData.video.id}`);
        } else {
          historyEntryIds.push(null);
          console.error(`Failed to save video ${i + 1} to history`);
        }
      } catch (historyError) {
        historyEntryIds.push(null);
        console.error('Failed to save to history:', historyError);
      }
    }

    // STEP 2: Start video generation with 20-second delay between each
    // Videos will process in parallel/background
    let startedCount = 0;
    let failedToStartCount = 0;
    
    for (let i = 0; i < promptLines.length; i++) {
      const currentPrompt = promptLines[i];
      const historyEntryId = historyEntryIds[i];

      // Update status to processing in UI
      setGenerationProgress(prev => 
        prev.map((item, idx) => 
          idx === i ? { ...item, status: "processing" } : item
        )
      );

      // Skip if history entry wasn't created
      if (!historyEntryId) {
        console.error(`Skipping video ${i + 1} - no history entry ID`);
        setGenerationProgress(prev => 
          prev.map((item, idx) => 
            idx === i ? { ...item, status: "failed", error: "Failed to create history entry" } : item
          )
        );
        failedToStartCount++;
        continue;
      }

      try {
        // Use the regenerate endpoint which has background polling
        const response = await fetch('/api/regenerate-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ 
            videoId: historyEntryId,
            prompt: currentPrompt,
            aspectRatio: aspectRatio,
            sceneNumber: i + 1,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          console.error(`Failed to start video ${i + 1}:`, result.error);
          setGenerationProgress(prev => 
            prev.map((item, idx) => 
              idx === i ? { ...item, status: "failed", error: result.error } : item
            )
          );
          failedToStartCount++;
        } else {
          console.log(`Started video ${i + 1} generation - will complete in background`);
          startedCount++;
        }

      } catch (error: any) {
        console.error(`Error starting video ${i + 1}:`, error);
        setGenerationProgress(prev => 
          prev.map((item, idx) => 
            idx === i ? { ...item, status: "failed", error: error.message } : item
          )
        );
        failedToStartCount++;
      }

      // Add 20-second delay before starting next video (except for last one)
      if (i < promptLines.length - 1) {
        console.log(`Waiting 20 seconds before starting video ${i + 2}...`);
        await new Promise(resolve => setTimeout(resolve, 20000));
      }
    }

    // STEP 3: Poll for completion status to update UI
    // This is just for UI feedback - backend already handles actual completion
    if (startedCount > 0) {
      let pollingAttempts = 0;
      const maxPollingAttempts = 150; // Poll for up to 5 minutes (150 * 2 sec)
      
      const pollInterval = setInterval(async () => {
        pollingAttempts++;
        
        try {
          // Fetch latest history to check status
          const historyResponse = await fetch('/api/video-history', {
            credentials: 'include',
          });
          
          if (historyResponse.ok) {
            const historyData = await historyResponse.json();
            
            // Update progress for each video
            for (let i = 0; i < historyEntryIds.length; i++) {
              const entryId = historyEntryIds[i];
              if (!entryId) continue;
              
              const videoInHistory = historyData.videos.find((v: any) => v.id === entryId);
              if (videoInHistory) {
                setGenerationProgress(prev => 
                  prev.map((item, idx) => {
                    if (idx !== i) return item;
                    
                    if (videoInHistory.status === 'completed') {
                      return { ...item, status: "completed", videoUrl: videoInHistory.videoUrl };
                    } else if (videoInHistory.status === 'failed') {
                      return { ...item, status: "failed", error: "Generation failed" };
                    }
                    return item;
                  })
                );
              }
            }
            
            // Check if all are done
            const allDone = historyEntryIds.every(entryId => {
              if (!entryId) return true;
              const video = historyData.videos.find((v: any) => v.id === entryId);
              return video && (video.status === 'completed' || video.status === 'failed');
            });
            
            if (allDone || pollingAttempts >= maxPollingAttempts) {
              clearInterval(pollInterval);
              setIsGenerating(false);
            }
          }
        } catch (error) {
          console.error('Error polling history:', error);
        }
      }, 2000);
    } else {
      setIsGenerating(false);
    }
    
    // Show completion toast with summary
    toast({
      title: "Bulk generation started",
      description: `${startedCount} video${startedCount !== 1 ? 's' : ''} are being generated${failedToStartCount > 0 ? `, ${failedToStartCount} failed to start` : ''}. Progress will update automatically.`,
    });
  };

  const promptCount = prompts.split('\n').filter(line => line.trim().length > 0).length;
  const completedCount = generationProgress.filter(v => v.status === "completed").length;
  const failedCount = generationProgress.filter(v => v.status === "failed").length;
  const progressPercentage = generationProgress.length > 0 
    ? ((completedCount + failedCount) / generationProgress.length) * 100 
    : 0;

  if (sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600 dark:text-purple-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto py-6 md:py-10">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8 animate-slide-up">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold gradient-text mb-2">
              Bulk Video Generator
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-base md:text-lg">
              Generate up to 20 videos at once with smart API token rotation
            </p>
          </div>
          <Link href="/">
            <Button variant="outline" className="hover-lift self-start md:self-auto" data-testid="button-home">
              <Home className="w-4 h-4 mr-2" />
              Home
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Section */}
          <Card className="shadow-2xl hover-lift transition-all duration-300 animate-fade-in border-0 bg-white dark:bg-gray-800">
            <CardHeader className="border-b border-gray-100 dark:border-gray-700 pb-4">
              <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-purple-600" />
                Video Prompts
              </CardTitle>
              <CardDescription className="text-gray-600 dark:text-gray-400">
                Enter up to 20 prompts (one per line)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label htmlFor="prompts" className="text-gray-700 dark:text-gray-300 font-semibold">
                    Prompts ({promptCount}/20)
                  </Label>
                  {promptCount > 0 && promptCount <= 20 && (
                    <span className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-1 rounded-full">
                      ✓ Ready
                    </span>
                  )}
                </div>
                <Textarea
                  id="prompts"
                  value={prompts}
                  onChange={(e) => setPrompts(e.target.value)}
                  placeholder="A dog running on the beach&#10;A sunset over mountains&#10;A city street at night&#10;..."
                  className="min-h-[280px] md:min-h-[320px] transition-smooth focus:ring-2 focus:ring-purple-500 dark:bg-gray-700/50 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 text-sm md:text-base"
                  disabled={isGenerating}
                  data-testid="input-bulk-prompts"
                />
                {promptCount > 20 && (
                  <p className="text-sm text-red-600 dark:text-red-400 mt-2 flex items-center gap-2 animate-slide-up">
                    <AlertCircle className="w-4 h-4" />
                    Maximum 20 prompts allowed
                  </p>
                )}
              </div>

              <div>
                <Label className="text-gray-700 dark:text-gray-300 mb-4 block font-semibold">Aspect Ratio</Label>
                <RadioGroup
                  value={aspectRatio}
                  onValueChange={(value) => setAspectRatio(value as AspectRatio)}
                  disabled={isGenerating}
                  className="grid grid-cols-2 gap-3"
                >
                  <div className="flex items-center space-x-2 border-2 border-gray-200 dark:border-gray-600 rounded-xl p-3 md:p-4 hover:border-purple-500 dark:hover:border-purple-500 transition-all hover-lift cursor-pointer">
                    <RadioGroupItem value="landscape" id="landscape" data-testid="radio-landscape" />
                    <Label htmlFor="landscape" className="cursor-pointer dark:text-gray-300 text-sm md:text-base font-medium">
                      Landscape (16:9)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 border-2 border-gray-200 dark:border-gray-600 rounded-xl p-3 md:p-4 hover:border-purple-500 dark:hover:border-purple-500 transition-all hover-lift cursor-pointer">
                    <RadioGroupItem value="portrait" id="portrait" data-testid="radio-portrait" />
                    <Label htmlFor="portrait" className="cursor-pointer dark:text-gray-300 text-sm md:text-base font-medium">
                      Portrait (9:16)
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <Button
                onClick={handleGenerate}
                disabled={isGenerating || promptCount === 0 || promptCount > 20}
                className="w-full h-12 md:h-14 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 shadow-lg hover-lift text-base md:text-lg font-semibold"
                data-testid="button-generate-bulk"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Generating ({completedCount + failedCount}/{generationProgress.length})
                  </>
                ) : (
                  <>
                    <Layers className="w-5 h-5 mr-2" />
                    Generate {promptCount} Video{promptCount !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Progress Section */}
          <Card className="shadow-2xl hover-lift transition-all duration-300 animate-fade-in border-0 bg-white dark:bg-gray-800" style={{animationDelay: '0.1s'}}>
            <CardHeader className="border-b border-gray-100 dark:border-gray-700 pb-4">
              <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                Generation Progress
              </CardTitle>
              <CardDescription className="text-gray-600 dark:text-gray-400">
                Track the status of each video in real-time
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {generationProgress.length > 0 && (
                <div className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-xl">
                  <div className="flex justify-between text-sm mb-3">
                    <span className="text-gray-700 dark:text-gray-300 font-medium">
                      Overall Progress
                    </span>
                    <span className="text-gray-900 dark:text-white font-bold">
                      {completedCount + failedCount}/{generationProgress.length}
                    </span>
                  </div>
                  <Progress value={progressPercentage} className="h-3" />
                </div>
              )}

              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {generationProgress.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No videos in progress</p>
                  </div>
                ) : (
                  generationProgress.map((video, index) => (
                    <div
                      key={index}
                      className="border rounded-lg p-4 dark:border-gray-600"
                      data-testid={`video-status-${index}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          {video.status === "pending" && (
                            <Clock className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                          )}
                          {video.status === "processing" && (
                            <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
                          )}
                          {video.status === "completed" && (
                            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                          )}
                          {video.status === "failed" && (
                            <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                            Video {index + 1}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                            {video.prompt}
                          </p>
                          {video.status === "completed" && video.videoUrl && (
                            <a
                              href={video.videoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-purple-600 dark:text-purple-400 hover:underline mt-2 inline-block"
                              data-testid={`link-video-${index}`}
                            >
                              View Video
                            </a>
                          )}
                          {video.status === "failed" && video.error && (
                            <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                              {video.error}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
