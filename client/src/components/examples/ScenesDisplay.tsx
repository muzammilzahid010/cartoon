import ScenesDisplay from "../ScenesDisplay";

export default function ScenesDisplayExample() {
  //todo: remove mock functionality
  const mockScenes = [
    {
      scene: 1,
      title: "Fitropolis Cityscape",
      description: `visuals: A wide, vibrant shot of Fitropolis city, filled with towering, colorful buildings and flying vehicles.
dialogue_action: N/A (establishing shot)
music: Upbeat, optimistic orchestral music with a driving rhythm.
sound_effects: Distant city hum, occasional whoosh of flying vehicles.
transition: Fade in from black.`
    },
    {
      scene: 2,
      title: "The Iron Den Exterior",
      description: `visuals: Camera smoothly zooms in from the cityscape to focus on "The Iron Den," a large, modern gym building.
dialogue_action: N/A (establishing shot)
music: Music softens slightly, becoming more warm and inviting.
sound_effects: Muffled gym sounds from within.
transition: Zoom to focal point.`
    }
  ];

  return (
    <ScenesDisplay 
      scenes={mockScenes}
      onStartNew={() => console.log("Start new project")}
    />
  );
}
