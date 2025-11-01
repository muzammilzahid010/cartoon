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
          credentials: 'include',
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
        credentials: 'include',
        body: JSON.stringify({ prompt, aspectRatio }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to start video generation');
      }

      const { operationName, sceneId, tokenId } = result;

      // Update history with token ID if available
      if (historyEntryId && tokenId) {
        try {
          await fetch(`/api/video-history/${historyEntryId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
              tokenUsed: tokenId,
            }),
          });
        } catch (historyError) {
          console.error('Failed to update history with token ID:', historyError);
        }
      }

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
          credentials: 'include',
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
                credentials: 'include',
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
            credentials: 'include',
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
    <div className="min-h-screen bg-gradient-to-br from-[#1a2332] via-[#1e2838] to-[#242d3f] dark:from-[#141a25] dark:via-[#181e2a] dark:to-[#1c2230]">
      <header className="border-b border-white/10 bg-[#1c2534]/80 dark:bg-[#161c28]/80 backdrop-blur-md sticky top-0 z-50 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4 flex justify-between items-center">
          <h1 className="text-base sm:text-lg md:text-xl font-bold text-white">VEO 3.1 Video Generator</h1>
          <Link href="/">
            <Button variant="outline" size="sm" className="hover-lift border-white/20 text-white hover:bg-white/10" data-testid="link-home">
              <Home className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Home</span>
            </Button>
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <Card className="shadow-2xl hover-lift transition-all duration-300 animate-fade-in border border-white/10 bg-[#1e2838] dark:bg-[#181e2a]">
          <CardHeader className="p-6 md:p-8 border-b border-white/10">
            <CardTitle className="flex items-center gap-3 text-2xl md:text-3xl text-white">
              <div className="p-2 rounded-xl bg-purple-600/30 border border-purple-500/50">
                <PlayCircle className="w-6 h-6 text-purple-400" />
              </div>
              Generate AI Video
            </CardTitle>
            <CardDescription className="text-base mt-2 text-gray-300">
              Create stunning videos using Google's VEO 3.1 model. Choose your aspect ratio and describe what you want to see.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 p-6 md:p-8">
            <div className="space-y-3">
              <Label htmlFor="prompt" className="text-base font-semibold text-white">Video Prompt</Label>
              <Textarea
                id="prompt"
                placeholder="Describe your vision in detail... (e.g., A serene sunset over a calm ocean with gentle waves, seagulls flying in the distance)"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={6}
                disabled={isGenerating}
                data-testid="textarea-prompt"
                className="resize-none text-base transition-smooth focus:ring-2 focus:ring-purple-500 bg-[#242d3f]/50 border-white/10 text-white placeholder:text-gray-400"
              />
              <p className="text-sm text-gray-400 flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-purple-500 rounded-full animate-pulse"></span>
                Be specific and descriptive for best results
              </p>
            </div>

            <div className="space-y-4">
              <Label className="text-base font-semibold text-white">Aspect Ratio</Label>
              <RadioGroup
                value={aspectRatio}
                onValueChange={(value) => setAspectRatio(value as AspectRatio)}
                disabled={isGenerating}
                className="grid grid-cols-1 sm:grid-cols-2 gap-4"
              >
                <div className="flex items-center space-x-3 border-2 border-white/10 rounded-xl p-4 hover:border-purple-500 transition-all hover-lift cursor-pointer bg-white/5">
                  <RadioGroupItem value="landscape" id="landscape" data-testid="radio-landscape" />
                  <Label htmlFor="landscape" className="font-normal cursor-pointer flex-1 text-white">
                    <span className="font-semibold block mb-1">Landscape (16:9)</span>
                    <span className="text-xs text-gray-400">YouTube, presentations</span>
                  </Label>
                </div>
                <div className="flex items-center space-x-3 border-2 border-white/10 rounded-xl p-4 hover:border-purple-500 transition-all hover-lift cursor-pointer bg-white/5">
                  <RadioGroupItem value="portrait" id="portrait" data-testid="radio-portrait" />
                  <Label htmlFor="portrait" className="font-normal cursor-pointer flex-1 text-white">
                    <span className="font-semibold block mb-1">Portrait (9:16)</span>
                    <span className="text-xs text-gray-400">TikTok, Reels, Stories</span>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {error && (
              <div className="p-4 bg-red-900/30 border-2 border-red-500/50 rounded-xl animate-slide-up">
                <p className="text-red-200 text-sm">{error}</p>
              </div>
            )}

            {videoUrl && (
              <div className="space-y-4 animate-scale-in">
                <div className="aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl ring-4 ring-purple-500/30">
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
                  className="w-full h-12 text-base font-semibold bg-purple-600 hover:bg-purple-700 border-0"
                  data-testid="button-download"
                >
                  <Download className="w-5 h-5 mr-2" />
                  Download Video
                </Button>
              </div>
            )}

            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="w-full h-14 text-lg font-semibold bg-purple-600 hover:bg-purple-700 shadow-lg hover-lift border-0"
              size="lg"
              data-testid="button-generate"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Generating Video...
                </>
              ) : (
                <>
                  <PlayCircle className="w-5 h-5 mr-2" />
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
