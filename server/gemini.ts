// Blueprint: javascript_gemini
import { GoogleGenAI } from "@google/genai";
import type { Scene, StoryInput } from "@shared/schema";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const MIN_ACCEPTABLE_SCENES = 5;
const MAX_RETRY_ATTEMPTS = 3;

async function attemptSceneGeneration(storyInput: StoryInput): Promise<Scene[]> {
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
    throw error;
  }
}

export async function generateScenes(storyInput: StoryInput): Promise<Scene[]> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      console.log(`Scene generation attempt ${attempt}/${MAX_RETRY_ATTEMPTS}`);
      
      const scenes = await attemptSceneGeneration(storyInput);
      
      // Check if we got enough scenes
      if (scenes.length < MIN_ACCEPTABLE_SCENES) {
        console.log(`Generated only ${scenes.length} scenes, retrying for more...`);
        lastError = new Error(`Insufficient scenes: got ${scenes.length}, need at least ${MIN_ACCEPTABLE_SCENES}`);
        
        // If this is the last attempt, throw error instead of continuing
        if (attempt >= MAX_RETRY_ATTEMPTS) {
          throw lastError;
        }
        
        // Wait and retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      
      // Success - we have enough scenes
      console.log(`Successfully generated ${scenes.length} scenes on attempt ${attempt}`);
      return scenes;
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Attempt ${attempt} failed:`, lastError.message);
      
      // Only retry if not the last attempt
      if (attempt < MAX_RETRY_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }
    }
  }
  
  // All attempts failed
  throw new Error(`Failed to generate scenes after ${MAX_RETRY_ATTEMPTS} attempts: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Generate script/storyboard using user's custom prompt template
 */
export async function generateScript(
  storyAbout: string,
  numberOfPrompts: number,
  finalStep: string
): Promise<string> {
  try {
    const prompt = `Output only paragraphs, with no need to label steps or prompts. Write a storyboard for an animated film about a ${storyAbout}, consisting of ${numberOfPrompts} steps. Each step should include an English prompt. The final step should ${finalStep}. Describe the animated character fully in English at the beginning, and repeat that full character description in each prompt (do not use pronouns or shorthand such as "the same character"). The purpose is to reinforce the character's identity in every scene.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: "You are a creative screenwriter and storyboard artist. Generate detailed, vivid storyboards for animated films.",
      },
      contents: prompt,
    });

    const storyboard = response.text || "";

    if (!storyboard) {
      throw new Error("Empty response from Gemini");
    }

    return storyboard;
  } catch (error) {
    console.error("Script generation error:", error);
    throw new Error(`Failed to generate script: ${error instanceof Error ? error.message : String(error)}`);
  }
}
