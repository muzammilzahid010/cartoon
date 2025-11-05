// Blueprint: javascript_openai_ai_integrations
import OpenAI from "openai";

// This is using Replit's AI Integrations service, which provides OpenAI-compatible API access without requiring your own OpenAI API key.
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

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

    const response = await openai.chat.completions.create({
      model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      messages: [
        { 
          role: "system", 
          content: "You are a creative screenwriter and storyboard artist. Generate detailed, vivid storyboards for animated films." 
        },
        { 
          role: "user", 
          content: prompt 
        }
      ],
      max_completion_tokens: 8192,
    });

    const storyboard = response.choices[0]?.message?.content || "";

    if (!storyboard) {
      throw new Error("Empty response from OpenAI");
    }

    return storyboard;
  } catch (error) {
    console.error("Script generation error:", error);
    throw new Error(`Failed to generate script: ${error instanceof Error ? error.message : String(error)}`);
  }
}
