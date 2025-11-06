import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { Home, Loader2, Upload, X, PlayCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

type AspectRatio = "landscape" | "portrait";

export default function ImageToVideo() {
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("landscape");
  const [isGenerating, setIsGenerating] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid file",
          description: "Please select an image file",
          variant: "destructive",
        });
        return;
      }

      setSelectedImage(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const convertImageToBase64 = (file: File): Promise<{ base64: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
        const base64 = result.split(',')[1];
        resolve({ base64, mimeType: file.type });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({
        title: "Prompt required",
        description: "Please enter a video prompt",
        variant: "destructive",
      });
      return;
    }

    if (!selectedImage) {
      toast({
        title: "Image required",
        description: "Please select an image to convert to video",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setVideoUrl(null);
    setError(null);

    let historyEntryId: string | null = null;

    try {
      // Convert image to base64
      const { base64, mimeType } = await convertImageToBase64(selectedImage);

      // Start video generation (backend will create history entry)
      const response = await fetch('/api/generate-image-to-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ 
          imageBase64: base64,
          mimeType: mimeType,
          prompt, 
          aspectRatio 
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to start video generation');
      }

      const { operationName, sceneId, historyId, tokenId } = result;
      historyEntryId = historyId; // Use history ID from backend

      // Poll for video status
      let completed = false;
      let attempts = 0;
      const maxAttempts = 16; // 4 minutes max (15 second intervals)

      while (!completed && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 15000));
        attempts++;

        const statusResponse = await fetch('/api/check-video-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ operationName, sceneId, tokenId }),
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a2332] via-[#1e2838] to-[#242d3f] dark:from-[#141a25] dark:via-[#181e2a] dark:to-[#1c2230]">
      <header className="border-b border-white/10 bg-[#1c2534]/80 dark:bg-[#161c28]/80 backdrop-blur-md sticky top-0 z-50 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4 flex justify-between items-center">
          <h1 className="text-base sm:text-lg md:text-xl font-bold text-white">Image to Video Generator</h1>
          <Link href="/">
            <Button variant="outline" size="sm" className="hover-lift border-white/20 text-white hover:bg-white/10" data-testid="link-home">
              <Home className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Home</span>
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <Card className="bg-white/5 dark:bg-white/5 border-white/10 backdrop-blur-sm shadow-2xl overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 pb-8">
            <CardTitle className="text-2xl md:text-3xl text-white flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl">
                <PlayCircle className="w-6 h-6 md:w-8 md:h-8 text-white" />
              </div>
              Convert Image to Video
            </CardTitle>
            <CardDescription className="text-gray-300 mt-2">
              Upload an image and add a prompt to bring it to life with VEO 3.1
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 pt-8">
            {/* Image Upload */}
            <div className="space-y-4">
              <Label htmlFor="image-upload" className="text-white text-lg font-medium">
                Upload Image
              </Label>
              
              {!imagePreview ? (
                <div className="border-2 border-dashed border-white/20 rounded-lg p-8 text-center hover:border-purple-500/50 transition-colors">
                  <input
                    ref={fileInputRef}
                    id="image-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                    data-testid="input-image-upload"
                  />
                  <label htmlFor="image-upload" className="cursor-pointer">
                    <Upload className="w-12 h-12 mx-auto mb-4 text-purple-400" />
                    <p className="text-white font-medium mb-2">Click to upload image</p>
                    <p className="text-gray-400 text-sm">PNG, JPG, or GIF (max 10MB)</p>
                  </label>
                </div>
              ) : (
                <div className="relative">
                  <img 
                    src={imagePreview} 
                    alt="Selected"
                    className="w-full max-h-96 object-contain rounded-lg border border-white/20"
                    data-testid="image-preview"
                  />
                  <Button
                    onClick={handleRemoveImage}
                    variant="destructive"
                    size="sm"
                    className="absolute top-2 right-2"
                    data-testid="button-remove-image"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Prompt */}
            <div className="space-y-3">
              <Label htmlFor="prompt" className="text-white text-lg font-medium">
                Video Prompt
              </Label>
              <Textarea
                id="prompt"
                placeholder="Describe the motion or action you want in the video (e.g., 'the character starts smiling and waving')"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                className="bg-white/5 border-white/20 text-white placeholder:text-gray-500 focus:border-purple-500 resize-none"
                data-testid="input-prompt"
              />
            </div>

            {/* Aspect Ratio */}
            <div className="space-y-3">
              <Label className="text-white text-lg font-medium">Aspect Ratio</Label>
              <RadioGroup value={aspectRatio} onValueChange={(value) => setAspectRatio(value as AspectRatio)}>
                <div className="grid grid-cols-2 gap-4">
                  <Label
                    htmlFor="landscape"
                    className={`flex items-center space-x-3 border rounded-lg p-4 cursor-pointer transition-all ${
                      aspectRatio === "landscape"
                        ? "border-purple-500 bg-purple-500/10"
                        : "border-white/20 bg-white/5 hover:border-white/40"
                    }`}
                    data-testid="radio-landscape"
                  >
                    <RadioGroupItem value="landscape" id="landscape" className="text-purple-500" />
                    <span className="text-white">Landscape (16:9)</span>
                  </Label>
                  <Label
                    htmlFor="portrait"
                    className={`flex items-center space-x-3 border rounded-lg p-4 cursor-pointer transition-all ${
                      aspectRatio === "portrait"
                        ? "border-purple-500 bg-purple-500/10"
                        : "border-white/20 bg-white/5 hover:border-white/40"
                    }`}
                    data-testid="radio-portrait"
                  >
                    <RadioGroupItem value="portrait" id="portrait" className="text-purple-500" />
                    <span className="text-white">Portrait (9:16)</span>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !selectedImage || !prompt.trim()}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-6 text-lg rounded-lg shadow-lg transition-all hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
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

            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Generated Video */}
            {videoUrl && (
              <div className="space-y-4 pt-6 border-t border-white/10">
                <h3 className="text-white text-lg font-semibold">Generated Video</h3>
                <video 
                  src={videoUrl} 
                  controls 
                  className="w-full rounded-lg"
                  data-testid="video-player"
                />
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
