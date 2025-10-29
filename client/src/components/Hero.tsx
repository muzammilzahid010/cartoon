import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import heroImage from "@assets/generated_images/Cartoon_animation_studio_workspace_7756f1d7.png";

interface HeroProps {
  onGetStarted: () => void;
}

export default function Hero({ onGetStarted }: HeroProps) {
  return (
    <div className="relative min-h-[500px] md:min-h-[600px] w-full overflow-hidden">
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${heroImage})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/70" />
      </div>
      
      <div className="relative z-10 flex flex-col items-center justify-center min-h-[500px] md:min-h-[600px] px-4 text-center">
        <div className="max-w-4xl">
          <div className="flex items-center justify-center gap-2 mb-6">
            <Sparkles className="w-8 h-8 text-primary" />
            <h1 className="text-5xl md:text-6xl font-bold text-white">
              Create Cartoon Story Videos
            </h1>
          </div>
          
          <p className="text-xl md:text-2xl text-white/90 mb-8 max-w-3xl mx-auto">
            Transform your scripts into detailed animated scene prompts with AI-powered Disney Pixar-style descriptions
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
            <Button 
              size="lg" 
              onClick={onGetStarted}
              className="h-14 px-12 text-lg rounded-full bg-primary text-primary-foreground border-primary-border hover-elevate active-elevate-2"
              data-testid="button-get-started"
            >
              Start Creating Stories
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto text-white">
            <div className="space-y-2">
              <div className="text-4xl font-bold text-primary">01</div>
              <p className="text-sm">Input your story script and character details</p>
            </div>
            <div className="space-y-2">
              <div className="text-4xl font-bold text-primary">02</div>
              <p className="text-sm">AI generates detailed scene descriptions</p>
            </div>
            <div className="space-y-2">
              <div className="text-4xl font-bold text-primary">03</div>
              <p className="text-sm">Review and export your scenes</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
