// Blueprint: javascript_gemini
import { GoogleGenAI } from "@google/genai";
import type { Scene, StoryInput } from "@shared/schema";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateScenes(storyInput: StoryInput): Promise<Scene[]> {
  try {
    // Build character descriptions
    const characterDescriptions = storyInput.characters
      .map(char => `${char.name}: ${char.description}`)
      .join('\n');

    const systemPrompt = `You are a Cartoon Scene Director AI optimized for generating short, cinematic 8-second animated scenes for Veo 3 or similar video-generation tools.

Your job is to read a long cartoon script and output a list of scenes. Each scene should be brief, action-focused.

---

### OUTPUT REQUIREMENTS:

1. Output a JSON array of scenes
2. **Each scene should last about 8 seconds** and include:
   - scene: scene number (integer)
   - title: brief scene title
   - description: containing following elements separated by newlines:
     - visuals: camera and setting description
     - dialogue_action: 1–2 lines of short dialogue or main action
     - music: a brief background music suggestion (tone, mood, instruments)
     - sound_effects: list of 1–3 matching SFX
     - transition: how the clip moves to the next (fade, cut, zoom, etc.)

3. **Scene style:** colorful, cinematic, and cartoonish — inspired by Pixar or DreamWorks 3D animation.

4. **Scene splitting:** If the script is long, make more scenes instead of longer ones. Each scene should describe a single emotional beat or visual moment. Create as many scenes as needed (up to 70 if the script is long enough).

---

Characters:
${characterDescriptions}

Story Script:
${storyInput.script}

Generate as many detailed scenes as you can from the above script.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              scene: { type: "number" },
              title: { type: "string" },
              description: { type: "string" },
            },
            required: ["scene", "title", "description"],
          },
        },
      },
      contents: "Generate the scenes now.",
    });

    const rawJson = response.text || "";

    if (!rawJson) {
      throw new Error("Empty response from Gemini");
    }

    const parsedScenes = JSON.parse(rawJson);
    
    // Validate that the response is an array
    if (!Array.isArray(parsedScenes)) {
      throw new Error("Invalid response format: expected array of scenes");
    }

    // Validate each scene matches the schema
    const scenes: Scene[] = parsedScenes.map((scene, index) => {
      if (typeof scene.scene !== 'number' || typeof scene.title !== 'string' || typeof scene.description !== 'string') {
        throw new Error(`Invalid scene format at index ${index}`);
      }
      return {
        scene: scene.scene,
        title: scene.title,
        description: scene.description,
      };
    });

    return scenes;
  } catch (error) {
    console.error("Error generating scenes:", error);
    throw new Error(`Failed to generate scenes: ${error}`);
  }
}
