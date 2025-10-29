import SceneCard from "../SceneCard";

export default function SceneCardExample() {
  const sampleScene = {
    scene: 1,
    title: "Fitropolis Cityscape",
    description: `visuals: A wide, vibrant shot of Fitropolis city, filled with towering, colorful buildings and flying vehicles. Sunlight glints off reflective surfaces. Camera slowly pans across the bustling cityscape, focusing on the energy.
dialogue_action: N/A (establishing shot)
music: Upbeat, optimistic orchestral music with a driving rhythm (strings, brass, light percussion).
sound_effects: Distant city hum, occasional whoosh of flying vehicles.
transition: Fade in from black.`
  };

  return (
    <div className="max-w-2xl p-4">
      <SceneCard scene={sampleScene} />
    </div>
  );
}
