import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, FileText } from "lucide-react";
import CharacterInput from "./CharacterInput";
import type { Character, StoryInput } from "@shared/schema";

interface ScriptFormProps {
  onSubmit: (data: StoryInput) => void;
}

export default function ScriptForm({ onSubmit }: ScriptFormProps) {
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [characters, setCharacters] = useState<Character[]>([
    { id: "1", name: "", description: "" }
  ]);

  const handleAddCharacter = () => {
    setCharacters([
      ...characters,
      { id: Date.now().toString(), name: "", description: "" }
    ]);
  };

  const handleRemoveCharacter = (id: string) => {
    setCharacters(characters.filter(c => c.id !== id));
  };

  const handleUpdateCharacter = (updated: Character) => {
    setCharacters(characters.map(c => c.id === updated.id ? updated : c));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ script, characters, title: title || undefined });
  };

  const isValid = script.length >= 50 && characters.every(c => c.name && c.description);

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
      <div className="space-y-6 sm:space-y-8">
        <div>
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            <h2 className="text-2xl sm:text-3xl font-bold text-white">Project Details</h2>
          </div>
          
          <div className="mb-6">
            <Label htmlFor="title" className="text-sm sm:text-base text-gray-200">
              Project Title <span className="text-gray-400 text-xs">(Optional)</span>
            </Label>
            <Input
              id="title"
              placeholder="e.g., The Iron Den Adventure"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-2 text-sm sm:text-base"
              data-testid="input-title"
            />
            <p className="text-xs sm:text-sm text-gray-400 mt-2">
              If left empty, a default title will be generated
            </p>
          </div>

          <div className="mb-3 sm:mb-4">
            <h3 className="text-xl sm:text-2xl font-semibold text-white">Story Script</h3>
          </div>
          <p className="text-sm sm:text-base text-gray-300 mb-4">
            Enter your complete story script. The AI will break it down into detailed scenes.
          </p>
          
          <div>
            <Label htmlFor="script" className="text-sm sm:text-base text-gray-200">
              Script <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="script"
              placeholder="Once upon a time in the vibrant city of Fitropolis, there was a legendary gym called 'The Iron Den'..."
              value={script}
              onChange={(e) => setScript(e.target.value)}
              className="min-h-[250px] sm:min-h-[300px] mt-2 text-sm sm:text-base"
              data-testid="input-script"
            />
            <p className="text-xs sm:text-sm text-gray-400 mt-2">
              {script.length} characters (minimum 50 required)
            </p>
          </div>
        </div>

        <div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 mb-4">
            <h2 className="text-xl sm:text-2xl font-bold text-white">Characters</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddCharacter}
              data-testid="button-add-character"
              className="w-full sm:w-auto"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Character
            </Button>
          </div>
          
          <div className="space-y-3 sm:space-y-4">
            {characters.map((character) => (
              <CharacterInput
                key={character.id}
                character={character}
                onUpdate={handleUpdateCharacter}
                onRemove={() => handleRemoveCharacter(character.id)}
                canRemove={characters.length > 1}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-center sm:justify-end pt-4">
          <Button
            type="submit"
            size="lg"
            disabled={!isValid}
            className="h-12 sm:h-14 px-8 sm:px-12 rounded-full w-full sm:w-auto text-sm sm:text-base"
            data-testid="button-generate-scenes"
          >
            Generate Scenes
          </Button>
        </div>
      </div>
    </form>
  );
}
