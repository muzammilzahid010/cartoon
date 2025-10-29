import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, MessageSquare, Music, Volume2, ArrowRight } from "lucide-react";
import type { Scene } from "@shared/schema";

interface SceneCardProps {
  scene: Scene;
}

export default function SceneCard({ scene }: SceneCardProps) {
  const parseDescription = (description: string) => {
    const sections = {
      visuals: "",
      dialogue_action: "",
      music: "",
      sound_effects: "",
      transition: ""
    };

    const lines = description.split('\n');
    lines.forEach(line => {
      if (line.startsWith('visuals:')) {
        sections.visuals = line.replace('visuals:', '').trim();
      } else if (line.startsWith('dialogue_action:')) {
        sections.dialogue_action = line.replace('dialogue_action:', '').trim();
      } else if (line.startsWith('music:')) {
        sections.music = line.replace('music:', '').trim();
      } else if (line.startsWith('sound_effects:')) {
        sections.sound_effects = line.replace('sound_effects:', '').trim();
      } else if (line.startsWith('transition:')) {
        sections.transition = line.replace('transition:', '').trim();
      }
    });

    return sections;
  };

  const sections = parseDescription(scene.description);

  return (
    <Card className="p-6 hover-elevate transition-all" data-testid={`card-scene-${scene.scene}`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="default" className="text-xs">
              Scene {scene.scene}
            </Badge>
          </div>
          <h3 className="text-lg font-semibold" data-testid={`text-scene-title-${scene.scene}`}>
            {scene.title}
          </h3>
        </div>
      </div>

      <div className="space-y-4">
        {sections.visuals && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Camera className="w-4 h-4 text-primary" />
              <span>Visuals</span>
            </div>
            <p className="text-sm leading-relaxed pl-6">
              {sections.visuals}
            </p>
          </div>
        )}

        {sections.dialogue_action && sections.dialogue_action !== "N/A" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <MessageSquare className="w-4 h-4 text-primary" />
              <span>Dialogue & Action</span>
            </div>
            <p className="text-sm leading-relaxed pl-6">
              {sections.dialogue_action}
            </p>
          </div>
        )}

        {sections.music && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Music className="w-4 h-4 text-primary" />
              <span>Music</span>
            </div>
            <p className="text-sm leading-relaxed pl-6">
              {sections.music}
            </p>
          </div>
        )}

        {sections.sound_effects && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Volume2 className="w-4 h-4 text-primary" />
              <span>Sound Effects</span>
            </div>
            <p className="text-sm leading-relaxed pl-6">
              {sections.sound_effects}
            </p>
          </div>
        )}

        {sections.transition && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ArrowRight className="w-4 h-4 text-primary" />
              <span>Transition</span>
            </div>
            <p className="text-sm leading-relaxed pl-6">
              {sections.transition}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
