import { useState, useEffect, useRef } from "react";
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
  tokenLabel?: string | null;
}

const STORAGE_KEY = 'bulkGeneratorResults';
const STORAGE_META_KEY = 'bulkGeneratorMeta';

interface BulkGenerationMeta {
  historyEntryIds: (string | null)[];
  isGenerating: boolean;
  timestamp: number;
}

export default function BulkGenerator() {
  const [prompts, setPrompts] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("landscape");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<VideoGenerationStatus[]>([]);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const historyEntryIdsRef = useRef<(string | null)[]>([]);

  const { data: session, isLoading: sessionLoading } = useQuery<{
    authenticated: boolean;
    user?: { id: string; username: string; isAdmin: boolean };
  }>({
    queryKey: ["/api/session"],
  });

  // Load previous results from localStorage on mount and check for updates
  useEffect(() => {
    const loadAndSync = async () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        const savedMeta = localStorage.getItem(STORAGE_META_KEY);
        
        if (saved && savedMeta) {
          const parsed = JSON.parse(saved);
          const meta: BulkGenerationMeta = JSON.parse(savedMeta);
          
          if (Array.isArray(parsed) && parsed.length > 0) {
            setGenerationProgress(parsed);
            historyEntryIdsRef.current = meta.historyEntryIds;
            
            // Check if there are any in-progress videos
            const hasInProgress = parsed.some(v => 
              v.status === 'pending' || v.status === 'processing'
            );
            
            if (hasInProgress && meta.historyEntryIds.length > 0) {
              // Sync with server immediately to update status
              try {
                const historyResponse = await fetch('/api/video-history', {
                  credentials: 'include',
                });
                
                if (historyResponse.ok) {
                  const historyData = await historyResponse.json();
                  
                  // Update progress with latest status from server
                  setGenerationProgress(prev => 
                    prev.map((item, idx) => {
                      const entryId = meta.historyEntryIds[idx];
                      if (!entryId) return item;
                      
                      const videoInHistory = historyData.videos.find((v: any) => v.id === entryId);
                      if (videoInHistory) {
                        if (videoInHistory.status === 'completed') {
                          return { ...item, status: "completed", videoUrl: videoInHistory.videoUrl };
                        } else if (videoInHistory.status === 'failed') {
                          return { ...item, status: "failed", error: "Generation failed" };
                        }
                      }
                      return item;
                    })
                  );
                }
              } catch (syncError) {
                console.error('Failed to sync with server:', syncError);
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to load saved results:', error);
      }
    };
    
    loadAndSync();
  }, []);

  // Save results to localStorage whenever they change
  useEffect(() => {
    if (generationProgress.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(generationProgress));
        
        // Also save metadata
        const meta: BulkGenerationMeta = {
          historyEntryIds: historyEntryIdsRef.current,
          isGenerating,
          timestamp: Date.now(),
        };
        localStorage.setItem(STORAGE_META_KEY, JSON.stringify(meta));
      } catch (error) {
        console.error('Failed to save results:', error);
      }
    }
  }, [generationProgress, isGenerating]);

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

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
    // Clear any existing polling interval before starting new generation
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

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

    if (promptLines.length > 200) {
      toast({
        title: "Too many prompts",
        description: "Maximum 200 prompts allowed. Please remove some prompts.",
        variant: "destructive",
      });
      return;
    }

    // Initialize progress tracking (this also clears previous results)
    const initialProgress: VideoGenerationStatus[] = promptLines.map(prompt => ({
      prompt,
      status: "pending",
    }));
    setGenerationProgress(initialProgress);
    setIsGenerating(true);

    const historyEntryIds: (string | null)[] = [];
    historyEntryIdsRef.current = historyEntryIds;

    let startedCount = 0;
    let failedToStartCount = 0;
    
    // Start polling immediately for status updates (runs in background)
    let pollingAttempts = 0;
    const maxPollingAttempts = 300; // Poll for up to 10 minutes (300 * 2 sec)
    
    pollingIntervalRef.current = setInterval(async () => {
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
                  } else if (videoInHistory.status === 'pending') {
                    return { ...item, status: "processing" };
                  }
                  return item;
                })
              );
            }
          }
          
          // Check if all are done
          const allDone = historyEntryIds.length > 0 && historyEntryIds.every(entryId => {
            if (!entryId) return true;
            const video = historyData.videos.find((v: any) => v.id === entryId);
            return video && (video.status === 'completed' || video.status === 'failed');
          });
          
          if (allDone || pollingAttempts >= maxPollingAttempts) {
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
            setIsGenerating(false);
          }
        }
      } catch (error) {
        console.error('Error polling history:', error);
      }
    }, 2000);
    
    // Start video generation with 20-second delay between each
    // Polling runs in background while we send requests
    for (let i = 0; i < promptLines.length; i++) {
      const currentPrompt = promptLines[i];

      // Update status to processing in UI
      setGenerationProgress(prev => 
        prev.map((item, idx) => 
          idx === i ? { ...item, status: "processing" } : item
        )
      );

      try {
        // Create history entry and start generation immediately
        const response = await fetch('/api/video-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            prompt: currentPrompt,
            aspectRatio,
            status: 'pending',
            title: `Bulk VEO ${aspectRatio} video ${i + 1}`,
          }),
        });

        if (!response.ok) {
          console.error(`Failed to create history entry for video ${i + 1}`);
          historyEntryIds.push(null);
          setGenerationProgress(prev => 
            prev.map((item, idx) => 
              idx === i ? { ...item, status: "failed", error: "Failed to create history entry" } : item
            )
          );
          failedToStartCount++;
          continue;
        }

        const historyData = await response.json();
        const historyEntryId = historyData.video.id;
        historyEntryIds.push(historyEntryId);
        console.log(`Created history entry for video ${i + 1} with ID: ${historyEntryId}`);

        // Start video generation
        const genResponse = await fetch('/api/regenerate-video', {
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

        const result = await genResponse.json();

        if (!genResponse.ok) {
          console.error(`Failed to start video ${i + 1}:`, result.error);
          setGenerationProgress(prev => 
            prev.map((item, idx) => 
              idx === i ? { ...item, status: "failed", error: result.error } : item
            )
          );
          failedToStartCount++;
        } else {
          console.log(`Started video ${i + 1} generation with token: ${result.tokenLabel || 'N/A'} - will complete in background`);
          // Update progress with token label information
          setGenerationProgress(prev => 
            prev.map((item, idx) => 
              idx === i ? { ...item, tokenLabel: result.tokenLabel } : item
            )
          );
          startedCount++;
        }

      } catch (error: any) {
        console.error(`Error starting video ${i + 1}:`, error);
        historyEntryIds.push(null);
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

    // If no videos started successfully, stop polling
    if (startedCount === 0) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
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
    <div className="min-h-screen bg-gradient-to-br from-[#1a2332] via-[#1e2838] to-[#242d3f] dark:from-[#141a25] dark:via-[#181e2a] dark:to-[#1c2230] p-4 md:p-6">
      <div className="max-w-7xl mx-auto py-6 md:py-10">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8 animate-slide-up">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
              Bulk Video Generator
            </h1>
            <p className="text-gray-300 text-base md:text-lg">
              Generate up to 200 videos at once with smart API token rotation
            </p>
          </div>
          <Link href="/">
            <Button variant="outline" className="hover-lift self-start md:self-auto border-white/20 text-white hover:bg-white/10" data-testid="button-home">
              <Home className="w-4 h-4 mr-2" />
              Home
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Section */}
          <Card className="shadow-2xl hover-lift transition-all duration-300 animate-fade-in border border-white/10 bg-[#1e2838] dark:bg-[#181e2a]">
            <CardHeader className="border-b border-white/10 pb-4">
              <CardTitle className="text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-purple-400" />
                Video Prompts
              </CardTitle>
              <CardDescription className="text-gray-300">
                Enter up to 200 prompts (one per line)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label htmlFor="prompts" className="text-white font-semibold">
                    Prompts ({promptCount}/200)
                  </Label>
                  {promptCount > 0 && promptCount <= 200 && (
                    <span className="text-xs bg-green-600/30 border border-green-500/50 text-green-300 px-2 py-1 rounded-full">
                      ✓ Ready
                    </span>
                  )}
                </div>
                <Textarea
                  id="prompts"
                  value={prompts}
                  onChange={(e) => setPrompts(e.target.value)}
                  placeholder="A dog running on the beach&#10;A sunset over mountains&#10;A city street at night&#10;..."
                  className="min-h-[280px] md:min-h-[320px] transition-smooth focus:ring-2 focus:ring-purple-500 bg-[#242d3f]/50 border-white/10 text-white placeholder:text-gray-400 text-sm md:text-base"
                  disabled={isGenerating}
                  data-testid="input-bulk-prompts"
                />
                {promptCount > 200 && (
                  <p className="text-sm text-red-300 mt-2 flex items-center gap-2 animate-slide-up">
                    <AlertCircle className="w-4 h-4" />
                    Maximum 200 prompts allowed
                  </p>
                )}
              </div>

              <div>
                <Label className="text-white mb-4 block font-semibold">Aspect Ratio</Label>
                <RadioGroup
                  value={aspectRatio}
                  onValueChange={(value) => setAspectRatio(value as AspectRatio)}
                  disabled={isGenerating}
                  className="grid grid-cols-2 gap-3"
                >
                  <div className="flex items-center space-x-2 border-2 border-white/10 rounded-xl p-3 md:p-4 hover:border-purple-500 transition-all hover-lift cursor-pointer bg-white/5">
                    <RadioGroupItem value="landscape" id="landscape" data-testid="radio-landscape" />
                    <Label htmlFor="landscape" className="cursor-pointer text-white text-sm md:text-base font-medium">
                      Landscape (16:9)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 border-2 border-white/10 rounded-xl p-3 md:p-4 hover:border-purple-500 transition-all hover-lift cursor-pointer bg-white/5">
                    <RadioGroupItem value="portrait" id="portrait" data-testid="radio-portrait" />
                    <Label htmlFor="portrait" className="cursor-pointer text-white text-sm md:text-base font-medium">
                      Portrait (9:16)
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <Button
                onClick={handleGenerate}
                disabled={isGenerating || promptCount === 0 || promptCount > 200}
                className="w-full h-12 md:h-14 bg-purple-600 hover:bg-purple-700 shadow-lg hover-lift text-base md:text-lg font-semibold border-0"
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
          <Card className="shadow-2xl hover-lift transition-all duration-300 animate-fade-in border border-white/10 bg-[#1e2838] dark:bg-[#181e2a]" style={{animationDelay: '0.1s'}}>
            <CardHeader className="border-b border-white/10 pb-4">
              <CardTitle className="text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-purple-400" />
                Generation Progress
              </CardTitle>
              <CardDescription className="text-gray-300">
                Track the status of each video in real-time
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {generationProgress.length > 0 && (
                <div className="mb-6 p-4 bg-purple-600/10 border border-purple-500/30 rounded-xl">
                  <div className="flex justify-between text-sm mb-3">
                    <span className="text-gray-300 font-medium">
                      Overall Progress
                    </span>
                    <span className="text-white font-bold">
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
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              Video {index + 1}
                            </p>
                            {video.tokenLabel && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                                {video.tokenLabel}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 truncate mb-2">
                            {video.prompt}
                          </p>
                          {video.status === "completed" && video.videoUrl && (
                            <div className="mt-3">
                              <video
                                src={video.videoUrl}
                                controls
                                className="w-full rounded-lg border border-gray-200 dark:border-gray-600"
                                data-testid={`video-player-${index}`}
                                style={{ maxHeight: "240px" }}
                              >
                                Your browser does not support the video tag.
                              </video>
                              <a
                                href={video.videoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-purple-600 dark:text-purple-400 hover:underline mt-2 inline-block"
                                data-testid={`link-video-${index}`}
                              >
                                Open in new tab
                              </a>
                            </div>
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
