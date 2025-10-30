import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { Home, Loader2, Download, PlayCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

type AspectRatio = "landscape" | "portrait";

export default function VeoGenerator() {
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("landscape");
  const [isGenerating, setIsGenerating] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    if (!prompt.trim()) {
      toast({
        title: "Prompt required",
        description: "Please enter a video prompt",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setVideoUrl(null);
    setError(null);

    let historyEntryId: string | null = null;

    try {
      // Save to history as pending first
      try {
        const historyResponse = await fetch('/api/video-history', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: '', // Will be set by backend
            prompt,
            aspectRatio,
            status: 'pending',
            title: `VEO ${aspectRatio} video`,
          }),
        });
        
        if (historyResponse.ok) {
          const historyData = await historyResponse.json();
          historyEntryId = historyData.video.id;
        }
      } catch (historyError) {
        console.error('Failed to save pending video to history:', historyError);
        // Continue with generation even if history save fails
      }

      // Start video generation
      const response = await fetch('/api/generate-veo-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt, aspectRatio }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to start video generation');
      }

      const { operationName, sceneId } = result;

      // Poll for video status
      let completed = false;
      let attempts = 0;
      const maxAttempts = 120; // 4 minutes max (2 second intervals)

      while (!completed && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;

        const statusResponse = await fetch('/api/check-video-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ operationName, sceneId }),
        });

        const statusData = await statusResponse.json();

        if (statusData.status === 'COMPLETED' || 
            statusData.status === 'MEDIA_GENERATION_STATUS_COMPLETE' || 
            statusData.status === 'MEDIA_GENERATION_STATUS_SUCCESSFUL') {
          setVideoUrl(statusData.videoUrl);
          completed = true;
          
          // Update history with completed status and video URL
          if (historyEntryId) {
            try {
              await fetch(`/api/video-history/${historyEntryId}`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  status: 'completed',
                  videoUrl: statusData.videoUrl,
                }),
              });
            } catch (historyError) {
              console.error('Failed to update history:', historyError);
            }
          }
          
          toast({
            title: "Video generated!",
            description: "Your video is ready to watch and download.",
          });
        } else if (statusData.status === 'FAILED' || 
                   statusData.status === 'MEDIA_GENERATION_STATUS_FAILED') {
          throw new Error(statusData.error || 'Video generation failed');
        }
      }

      if (!completed) {
        throw new Error('Video generation timed out');
      }
    } catch (err) {
      console.error("Error generating video:", err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate video';
      setError(errorMessage);
      
      // Update history with failed status
      if (historyEntryId) {
        try {
          await fetch(`/api/video-history/${historyEntryId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              status: 'failed',
            }),
          });
        } catch (historyError) {
          console.error('Failed to update history:', historyError);
        }
      }
      
      toast({
        title: "Generation failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (videoUrl) {
      window.open(videoUrl, '_blank');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex justify-between items-center">
          <h1 className="text-sm sm:text-base md:text-lg font-semibold text-gray-900 dark:text-white truncate">VEO 3.1 Video Generator</h1>
          <Link href="/">
            <Button variant="outline" size="sm" data-testid="link-home">
              <Home className="w-4 h-4 sm:mr-1" />
              <span className="hidden sm:inline">Home</span>
            </Button>
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
              <PlayCircle className="w-5 h-5 sm:w-6 sm:h-6" />
              Generate VEO 3.1 Video
            </CardTitle>
            <CardDescription className="text-sm sm:text-base">
              Create stunning videos using Google's VEO 3.1 model. Choose your aspect ratio and describe what you want to see.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6">
            <div className="space-y-2">
              <Label htmlFor="prompt" className="text-sm sm:text-base">Video Prompt</Label>
              <Textarea
                id="prompt"
                placeholder="Describe the video you want to generate... (e.g., A serene sunset over a calm ocean with gentle waves)"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                disabled={isGenerating}
                data-testid="textarea-prompt"
                className="resize-none text-sm sm:text-base"
              />
              <p className="text-xs sm:text-sm text-muted-foreground">
                Be specific and descriptive for best results
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm sm:text-base">Aspect Ratio</Label>
              <RadioGroup
                value={aspectRatio}
                onValueChange={(value) => setAspectRatio(value as AspectRatio)}
                disabled={isGenerating}
                className="space-y-3"
              >
                <div className="flex items-start space-x-2">
                  <RadioGroupItem value="landscape" id="landscape" data-testid="radio-landscape" className="mt-0.5" />
                  <Label htmlFor="landscape" className="font-normal cursor-pointer text-sm sm:text-base leading-snug">
                    <span className="font-medium">Landscape (16:9)</span>
                    <span className="hidden sm:inline"> - Best for YouTube, presentations</span>
                  </Label>
                </div>
                <div className="flex items-start space-x-2">
                  <RadioGroupItem value="portrait" id="portrait" data-testid="radio-portrait" className="mt-0.5" />
                  <Label htmlFor="portrait" className="font-normal cursor-pointer text-sm sm:text-base leading-snug">
                    <span className="font-medium">Portrait (9:16)</span>
                    <span className="hidden sm:inline"> - Best for TikTok, Instagram Reels, Stories</span>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {error && (
              <div className="p-3 sm:p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-red-800 dark:text-red-200 text-xs sm:text-sm">{error}</p>
              </div>
            )}

            {videoUrl && (
              <div className="space-y-3 sm:space-y-4">
                <div className="aspect-video bg-black rounded-lg overflow-hidden">
                  <video
                    src={videoUrl}
                    controls
                    autoPlay
                    loop
                    className="w-full h-full"
                    data-testid="video-result"
                  />
                </div>
                <Button
                  onClick={handleDownload}
                  className="w-full text-sm sm:text-base"
                  data-testid="button-download"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Video
                </Button>
              </div>
            )}

            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="w-full text-sm sm:text-base h-11 sm:h-12"
              size="lg"
              data-testid="button-generate"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating Video...
                </>
              ) : (
                <>
                  <PlayCircle className="w-4 h-4 mr-2" />
                  Generate Video
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
