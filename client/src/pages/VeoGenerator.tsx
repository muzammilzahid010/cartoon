import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Home, Loader2, Download, PlayCircle } from "lucide-react";

type AspectRatio = "landscape" | "portrait";

export default function VeoGenerator() {
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("landscape");
  const [isGenerating, setIsGenerating] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

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

    try {
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
      <header className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">VEO 3.1 Video Generator</h1>
          <Link href="/">
            <Button variant="outline" size="sm" data-testid="link-home">
              <Home className="w-4 h-4 mr-1" />
              Home
            </Button>
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlayCircle className="w-6 h-6" />
              Generate VEO 3.1 Video
            </CardTitle>
            <CardDescription>
              Create stunning videos using Google's VEO 3.1 model. Choose your aspect ratio and describe what you want to see.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="prompt">Video Prompt</Label>
              <Textarea
                id="prompt"
                placeholder="Describe the video you want to generate... (e.g., A serene sunset over a calm ocean with gentle waves)"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                disabled={isGenerating}
                data-testid="textarea-prompt"
                className="resize-none"
              />
              <p className="text-sm text-muted-foreground">
                Be specific and descriptive for best results
              </p>
            </div>

            <div className="space-y-2">
              <Label>Aspect Ratio</Label>
              <RadioGroup
                value={aspectRatio}
                onValueChange={(value) => setAspectRatio(value as AspectRatio)}
                disabled={isGenerating}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="landscape" id="landscape" data-testid="radio-landscape" />
                  <Label htmlFor="landscape" className="font-normal cursor-pointer">
                    Landscape (16:9) - Best for YouTube, presentations
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="portrait" id="portrait" data-testid="radio-portrait" />
                  <Label htmlFor="portrait" className="font-normal cursor-pointer">
                    Portrait (9:16) - Best for TikTok, Instagram Reels, Stories
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
              </div>
            )}

            {videoUrl && (
              <div className="space-y-4">
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
                  className="w-full"
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
              className="w-full"
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
