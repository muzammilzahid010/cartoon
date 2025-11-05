import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { Home, Loader2, Copy, Wand2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export default function ScriptCreator() {
  const [storyAbout, setStoryAbout] = useState("");
  const [numberOfPrompts, setNumberOfPrompts] = useState(10);
  const [finalStep, setFinalStep] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedScript, setGeneratedScript] = useState<string | null>(null);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: session, isLoading: sessionLoading } = useQuery<{
    authenticated: boolean;
    user?: { id: string; username: string; isAdmin: boolean };
  }>({
    queryKey: ["/api/session"],
  });

  useEffect(() => {
    if (!sessionLoading && session && !session.authenticated) {
      toast({
        title: "Authentication required",
        description: "Please log in to use the script creator.",
        variant: "destructive",
      });
      setLocation("/login");
    }
  }, [session, sessionLoading, setLocation, toast]);

  const handleGenerate = async () => {
    if (!storyAbout.trim()) {
      toast({
        title: "Story required",
        description: "Please describe what your story is about",
        variant: "destructive",
      });
      return;
    }

    if (!finalStep.trim()) {
      toast({
        title: "Final step required",
        description: "Please describe what the final step should be",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setGeneratedScript(null);

    try {
      const response = await fetch('/api/generate-script', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ storyAbout, numberOfPrompts, finalStep }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate script');
      }

      setGeneratedScript(result.script);
      
      toast({
        title: "Script generated!",
        description: "Your storyboard has been created successfully.",
      });
    } catch (error) {
      console.error('Error generating script:', error);
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (generatedScript) {
      navigator.clipboard.writeText(generatedScript);
      toast({
        title: "Copied!",
        description: "Script copied to clipboard",
      });
    }
  };

  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-purple-900/20 via-transparent to-transparent" />
      
      <div className="relative z-10 container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex justify-between items-center mb-8">
          <Link href="/">
            <Button variant="outline" size="sm" className="border-slate-700 hover:bg-slate-800" data-testid="button-home">
              <Home className="h-4 w-4 mr-2" />
              Home
            </Button>
          </Link>
        </div>

        <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-2xl">
          <CardHeader className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg">
                <Wand2 className="h-6 w-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-3xl text-white">Script Creator</CardTitle>
                <CardDescription className="text-slate-400">
                  Generate detailed animated storyboards with AI
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="storyAbout" className="text-white">
                Story About
              </Label>
              <Input
                id="storyAbout"
                placeholder="e.g., a brave knight on a quest to save a kingdom"
                value={storyAbout}
                onChange={(e) => setStoryAbout(e.target.value)}
                className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                disabled={isGenerating}
                data-testid="input-story-about"
              />
              <p className="text-xs text-slate-500">
                Describe what your animated story is about
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="numberOfPrompts" className="text-white">
                Number of Steps
              </Label>
              <Input
                id="numberOfPrompts"
                type="number"
                min={1}
                max={100}
                value={numberOfPrompts}
                onChange={(e) => setNumberOfPrompts(parseInt(e.target.value) || 10)}
                className="bg-slate-800/50 border-slate-700 text-white"
                disabled={isGenerating}
                data-testid="input-number-of-prompts"
              />
              <p className="text-xs text-slate-500">
                How many steps/scenes should the storyboard have? (1-100)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="finalStep" className="text-white">
                Final Step Description
              </Label>
              <Input
                id="finalStep"
                placeholder="e.g., end with the hero returning home victorious"
                value={finalStep}
                onChange={(e) => setFinalStep(e.target.value)}
                className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                disabled={isGenerating}
                data-testid="input-final-step"
              />
              <p className="text-xs text-slate-500">
                Describe how the final step should conclude
              </p>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !storyAbout.trim() || !finalStep.trim()}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-medium py-6 text-lg"
              data-testid="button-generate-script"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Generating Script...
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-5 w-5" />
                  Generate Storyboard
                </>
              )}
            </Button>

            {generatedScript && (
              <div className="mt-8 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-semibold text-white">Generated Storyboard</h3>
                  <Button
                    onClick={handleCopy}
                    variant="outline"
                    size="sm"
                    className="border-slate-700 hover:bg-slate-800"
                    data-testid="button-copy-script"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </Button>
                </div>
                
                <Textarea
                  value={generatedScript}
                  readOnly
                  className="min-h-[400px] bg-slate-800/50 border-slate-700 text-white font-mono text-sm"
                  data-testid="textarea-generated-script"
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
