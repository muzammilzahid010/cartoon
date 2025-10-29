import CharacterInput from "../CharacterInput";
import { useState } from "react";

export default function CharacterInputExample() {
  const [character, setCharacter] = useState({
    id: "1",
    name: "Max the Motivator",
    description: "A majestic golden-maned lion with incredible energy",
  });

  return (
    <div className="max-w-2xl p-4">
      <CharacterInput
        character={character}
        onUpdate={setCharacter}
        onRemove={() => console.log("Remove character")}
        canRemove={true}
      />
    </div>
  );
}
