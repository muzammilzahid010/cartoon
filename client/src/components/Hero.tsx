import { Button } from "@/components/ui/button";
import { Sparkles, Film, Wand2, Video, Layers, History } from "lucide-react";

interface HeroProps {
  onGetStarted: () => void;
}

export default function Hero({ onGetStarted }: HeroProps) {
  return (
    <div className="relative min-h-[600px] sm:min-h-[650px] md:min-h-[750px] w-full overflow-hidden bg-gradient-to-br from-[#1a2332] via-[#1e2838] to-[#242d3f] dark:from-[#141a25] dark:via-[#181e2a] dark:to-[#1c2230]">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.05),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(255,255,255,0.03),transparent_50%)]" />
      </div>
      
      <div className="relative z-10 flex flex-col items-center justify-center min-h-[600px] sm:min-h-[650px] md:min-h-[750px] px-4 text-center py-12">
        <div className="max-w-6xl animate-fade-in">
          {/* Icon badge */}
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 mb-8 animate-slide-up">
            <Film className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-gray-200 font-medium">AI-Powered Video Generation Platform</span>
          </div>

          <div className="flex flex-col items-center justify-center gap-4 mb-6 sm:mb-8">
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-tight animate-slide-up">
              Cartoon Story Video Generator
            </h1>
          </div>
          
          <p className="text-lg sm:text-xl md:text-2xl text-gray-300 mb-6 max-w-4xl mx-auto px-2 animate-slide-up" style={{animationDelay: '0.1s'}}>
            Transform your creative scripts into stunning Disney Pixar-style 3D animated videos using cutting-edge AI technology. From story to screen in minutes.
          </p>

          <div className="max-w-5xl mx-auto mb-10 sm:mb-12 animate-slide-up" style={{animationDelay: '0.15s'}}>
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 sm:p-8">
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">🎬 Complete Video Production Suite</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left text-gray-300 text-sm sm:text-base">
                <div className="flex items-start gap-3">
                  <Wand2 className="w-5 h-5 text-purple-400 mt-0.5 shrink-0" />
                  <div>
                    <strong className="text-white">Cartoon Story Generator:</strong> Input your script and characters, AI breaks it into 8-second cinematic scenes with detailed descriptions for perfect video generation
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Video className="w-5 h-5 text-purple-400 mt-0.5 shrink-0" />
                  <div>
                    <strong className="text-white">VEO 3.1 Video Generator:</strong> Create individual high-quality videos from any prompt using Google's latest VEO 3.1 AI model
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Layers className="w-5 h-5 text-purple-400 mt-0.5 shrink-0" />
                  <div>
                    <strong className="text-white">Bulk Video Generator:</strong> Generate up to 20 videos simultaneously with smart API token rotation for maximum efficiency
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <History className="w-5 h-5 text-purple-400 mt-0.5 shrink-0" />
                  <div>
                    <strong className="text-white">Video History & Projects:</strong> Track all your generated videos, manage projects, and access comprehensive analytics dashboard
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12 sm:mb-16 animate-slide-up" style={{animationDelay: '0.2s'}}>
            <Button 
              size="lg" 
              onClick={onGetStarted}
              className="h-14 px-10 text-lg rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-2xl hover-lift transform transition-all duration-300 w-full sm:w-auto max-w-xs font-semibold border-0"
              data-testid="button-get-started"
            >
              <Sparkles className="w-5 h-5 mr-2" />
              Start Creating Stories
            </Button>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-5xl mx-auto px-2">
            <div className="space-y-3 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover-lift animate-slide-up transition-all duration-300" style={{animationDelay: '0.3s'}}>
              <div className="w-14 h-14 rounded-xl bg-purple-600/20 flex items-center justify-center mb-2 border border-purple-500/30">
                <Wand2 className="w-7 h-7 text-purple-400" />
              </div>
              <h3 className="text-lg font-bold text-white">AI Scene Generation</h3>
              <p className="text-sm text-gray-300">Gemini AI analyzes your script and creates detailed scene descriptions optimized for video generation</p>
            </div>
            <div className="space-y-3 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover-lift animate-slide-up transition-all duration-300" style={{animationDelay: '0.4s'}}>
              <div className="w-14 h-14 rounded-xl bg-purple-600/20 flex items-center justify-center mb-2 border border-purple-500/30">
                <Film className="w-7 h-7 text-purple-400" />
              </div>
              <h3 className="text-lg font-bold text-white">VEO 3.1 Powered</h3>
              <p className="text-sm text-gray-300">Generate 8-second high-quality videos using Google's cutting-edge VEO 3.1 AI video generation model</p>
            </div>
            <div className="space-y-3 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover-lift animate-slide-up transition-all duration-300" style={{animationDelay: '0.5s'}}>
              <div className="w-14 h-14 rounded-xl bg-purple-600/20 flex items-center justify-center mb-2 border border-purple-500/30">
                <Sparkles className="w-7 h-7 text-purple-400" />
              </div>
              <h3 className="text-lg font-bold text-white">Pixar-Style Animation</h3>
              <p className="text-sm text-gray-300">All videos created in Disney Pixar's signature 3D animation style with cinematic quality</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
