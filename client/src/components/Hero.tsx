import { Button } from "@/components/ui/button";
import { Sparkles, Film, Zap, Wand2 } from "lucide-react";

interface HeroProps {
  onGetStarted: () => void;
}

export default function Hero({ onGetStarted }: HeroProps) {
  return (
    <div className="relative min-h-[500px] sm:min-h-[550px] md:min-h-[650px] w-full overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-600 via-blue-600 to-indigo-700 dark:from-purple-900 dark:via-blue-900 dark:to-indigo-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.1),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(255,255,255,0.08),transparent_50%)]" />
      </div>
      
      <div className="relative z-10 flex flex-col items-center justify-center min-h-[500px] sm:min-h-[550px] md:min-h-[650px] px-4 text-center">
        <div className="max-w-5xl animate-fade-in">
          {/* Icon badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 mb-6 animate-slide-up">
            <Film className="w-4 h-4 text-white" />
            <span className="text-sm text-white font-medium">AI-Powered Video Generation</span>
          </div>

          <div className="flex flex-col items-center justify-center gap-3 mb-6 sm:mb-8">
            <Sparkles className="w-10 h-10 sm:w-12 sm:h-12 text-yellow-300 animate-pulse-subtle" />
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-tight animate-slide-up">
              Create Cartoon Story Videos
            </h1>
          </div>
          
          <p className="text-lg sm:text-xl md:text-2xl text-white/95 mb-8 sm:mb-10 max-w-3xl mx-auto px-2 animate-slide-up" style={{animationDelay: '0.1s'}}>
            Transform your scripts into stunning Disney Pixar-style animated videos with the power of AI
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12 sm:mb-16 animate-slide-up" style={{animationDelay: '0.2s'}}>
            <Button 
              size="lg" 
              onClick={onGetStarted}
              className="h-14 px-10 text-lg rounded-full bg-white text-purple-700 hover:bg-gray-100 shadow-2xl hover-lift transform transition-all duration-300 w-full sm:w-auto max-w-xs font-semibold"
              data-testid="button-get-started"
            >
              <Zap className="w-5 h-5 mr-2" />
              Start Creating Now
            </Button>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto px-2">
            <div className="space-y-3 glass rounded-2xl p-6 hover-lift animate-slide-up" style={{animationDelay: '0.3s'}}>
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center mb-2">
                <Wand2 className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-white">AI Scene Generation</h3>
              <p className="text-sm text-white/80">Automatically break your story into cinematic scenes with detailed descriptions</p>
            </div>
            <div className="space-y-3 glass rounded-2xl p-6 hover-lift animate-slide-up" style={{animationDelay: '0.4s'}}>
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center mb-2">
                <Film className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-white">VEO 3.1 Powered</h3>
              <p className="text-sm text-white/80">Generate high-quality videos using Google's latest VEO 3.1 AI model</p>
            </div>
            <div className="space-y-3 glass rounded-2xl p-6 hover-lift animate-slide-up" style={{animationDelay: '0.5s'}}>
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center mb-2">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-white">Pixar-Style Animation</h3>
              <p className="text-sm text-white/80">Create videos in Disney Pixar's signature 3D animation style</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
