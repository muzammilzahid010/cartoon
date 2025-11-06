import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { Home, Loader2, Image as ImageIcon, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function TextToImage() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<string>("IMAGE_ASPECT_RATIO_LANDSCAPE");
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);

  const generateMutation = useMutation({
    mutationFn: async ({ imagePrompt, ratio }: { imagePrompt: string; ratio: string }) => {
      const response = await fetch('/api/text-to-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ 
          prompt: imagePrompt,
          aspectRatio: ratio 
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate image');
      }

      return response.json();
    },
    onSuccess: (data) => {
      if (data.imageUrl) {
        setGeneratedImage(data.imageUrl);
        toast({
          title: "Image Generated!",
          description: "Your image has been created successfully.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    if (!prompt.trim()) {
      toast({
        title: "Prompt Required",
        description: "Please enter a description for your image.",
        variant: "destructive",
      });
      return;
    }

    setGeneratedImage(null);
    generateMutation.mutate({ imagePrompt: prompt, ratio: aspectRatio });
  };

  const handleDownload = () => {
    if (!generatedImage) return;

    const link = document.createElement('a');
    link.href = generatedImage;
    link.download = `ai-image-${Date.now()}.png`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a2332] via-[#1e2838] to-[#242d3f] dark:from-[#141a25] dark:via-[#181e2a] dark:to-[#1c2230]">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#1c2534]/80 dark:bg-[#161c28]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex justify-between items-center">
          <h1 className="text-sm sm:text-base md:text-lg font-semibold text-white">Text to Image Generator</h1>
          <Link href="/">
            <Button variant="outline" size="sm" className="border-white/20 text-white hover:bg-white/10" data-testid="link-home">
              <Home className="w-4 h-4 sm:mr-1" />
              <span className="hidden sm:inline">Home</span>
            </Button>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="mb-4 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">Create AI Images</h2>
          <p className="text-sm sm:text-base text-gray-300">
            Describe your image and let AI bring it to life
          </p>
        </div>

        {/* Input Card */}
        <Card className="bg-white/5 border-white/10 backdrop-blur-sm mb-6">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-purple-400" />
              Image Prompt
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Describe Your Image
              </label>
              <Textarea
                placeholder="Example: A serene landscape with mountains at sunset, vibrant colors, photorealistic style..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                className="bg-white/5 border-white/20 text-white placeholder:text-gray-500 focus:border-purple-500"
                data-testid="input-prompt"
              />
              <p className="text-xs text-gray-400 mt-2">
                Be detailed and specific for best results
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Aspect Ratio
              </label>
              <Select value={aspectRatio} onValueChange={setAspectRatio}>
                <SelectTrigger className="bg-white/5 border-white/20 text-white" data-testid="select-aspect-ratio">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IMAGE_ASPECT_RATIO_LANDSCAPE">Landscape (16:9)</SelectItem>
                  <SelectItem value="IMAGE_ASPECT_RATIO_PORTRAIT">Portrait (9:16)</SelectItem>
                  <SelectItem value="IMAGE_ASPECT_RATIO_SQUARE">Square (1:1)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={generateMutation.isPending || !prompt.trim()}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 border-0"
              size="lg"
              data-testid="button-generate"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <ImageIcon className="w-5 h-5 mr-2" />
                  Generate Image
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Generated Image Display */}
        {generatedImage && (
          <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-green-400" />
                  Generated Image
                </span>
                <Button
                  onClick={handleDownload}
                  variant="outline"
                  size="sm"
                  className="border-white/20 text-white hover:bg-white/10"
                  data-testid="button-download"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg overflow-hidden bg-black/20">
                <img
                  src={generatedImage}
                  alt="AI Generated"
                  className="w-full h-auto"
                  data-testid="image-generated"
                />
              </div>
              <p className="text-xs text-gray-400 mt-3">
                <strong>Prompt:</strong> {prompt}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {generateMutation.isPending && (
          <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center gap-4">
                <Loader2 className="w-12 h-12 animate-spin text-purple-400" />
                <p className="text-white text-lg">Creating your image...</p>
                <p className="text-gray-400 text-sm">This may take a few moments</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
