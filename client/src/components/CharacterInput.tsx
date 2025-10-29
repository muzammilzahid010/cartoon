import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { X, User } from "lucide-react";
import type { Character } from "@shared/schema";

interface CharacterInputProps {
  character: Character;
  onUpdate: (character: Character) => void;
  onRemove: () => void;
  canRemove: boolean;
}

export default function CharacterInput({ 
  character, 
  onUpdate, 
  onRemove,
  canRemove 
}: CharacterInputProps) {
  return (
    <Card className="p-6 relative">
      {canRemove && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="absolute top-4 right-4"
          onClick={onRemove}
          data-testid={`button-remove-character-${character.id}`}
        >
          <X className="w-4 h-4" />
        </Button>
      )}
      
      <div className="flex items-center gap-2 mb-4">
        <User className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">Character Details</h3>
      </div>
      
      <div className="space-y-4">
        <div>
          <Label htmlFor={`character-name-${character.id}`}>
            Character Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`character-name-${character.id}`}
            placeholder="e.g., Max the Motivator"
            value={character.name}
            onChange={(e) => onUpdate({ ...character, name: e.target.value })}
            className="h-12 mt-1"
            data-testid={`input-character-name-${character.id}`}
          />
        </div>
        
        <div>
          <Label htmlFor={`character-description-${character.id}`}>
            Character Description <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id={`character-description-${character.id}`}
            placeholder="e.g., A majestic golden-maned lion with incredible energy and enthusiasm. He's the main motivator at the gym."
            value={character.description}
            onChange={(e) => onUpdate({ ...character, description: e.target.value })}
            className="min-h-[120px] mt-1"
            data-testid={`input-character-description-${character.id}`}
          />
        </div>
      </div>
    </Card>
  );
}
