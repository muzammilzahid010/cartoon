import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import heroImage from "@assets/generated_images/Cartoon_animation_studio_workspace_7756f1d7.png";

interface HeroProps {
  onGetStarted: () => void;
}

export default function Hero({ onGetStarted }: HeroProps) {
  return (
    <div className="relative min-h-[450px] sm:min-h-[500px] md:min-h-[600px] w-full overflow-hidden">
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${heroImage})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/70" />
      </div>
      
      <div className="relative z-10 flex flex-col items-center justify-center min-h-[450px] sm:min-h-[500px] md:min-h-[600px] px-4 text-center">
        <div className="max-w-4xl">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 mb-4 sm:mb-6">
            <Sparkles className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight">
              Create Cartoon Story Videos
            </h1>
          </div>
          
          <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-white/90 mb-6 sm:mb-8 max-w-3xl mx-auto px-2">
            Transform your scripts into detailed animated scene prompts with AI-powered Disney Pixar-style descriptions
          </p>
          
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center mb-8 sm:mb-12">
            <Button 
              size="lg" 
              onClick={onGetStarted}
              className="h-12 sm:h-14 px-8 sm:px-12 text-base sm:text-lg rounded-full bg-primary text-primary-foreground border-primary-border hover-elevate active-elevate-2 w-full sm:w-auto max-w-xs"
              data-testid="button-get-started"
            >
              Start Creating Stories
            </Button>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 max-w-3xl mx-auto text-white px-2">
            <div className="space-y-2 bg-black/20 rounded-lg p-4 sm:bg-transparent sm:p-0">
              <div className="text-3xl sm:text-4xl font-bold text-primary">01</div>
              <p className="text-sm sm:text-base">Input your story script and character details</p>
            </div>
            <div className="space-y-2 bg-black/20 rounded-lg p-4 sm:bg-transparent sm:p-0">
              <div className="text-3xl sm:text-4xl font-bold text-primary">02</div>
              <p className="text-sm sm:text-base">AI generates detailed scene descriptions</p>
            </div>
            <div className="space-y-2 bg-black/20 rounded-lg p-4 sm:bg-transparent sm:p-0">
              <div className="text-3xl sm:text-4xl font-bold text-primary">03</div>
              <p className="text-sm sm:text-base">Review and export your scenes</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
