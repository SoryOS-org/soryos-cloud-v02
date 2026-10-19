/**
 * Auth — détection honnête des clés d'API par provider.
 */
import { println, green, dim, EXIT_OK } from "../framework/ui";

const providers = [
  { name: "Gemini", env: "GEMINI_API_KEY", alt: "GOOGLE_API_KEY" },
  { name: "OpenAI", env: "OPENAI_API_KEY" },
  { name: "Mistral", env: "MISTRAL_API_KEY" },
  { name: "Anthropic", env: "ANTHROPIC_API_KEY" },
  { name: "E2B", env: "E2B_API_KEY" },
  { name: "Google Speech", env: "GOOGLE_SPEECH_API_KEY" },
  { name: "Azure Speech", env: "AZURE_SPEECH_KEY" },
  { name: "Whisper", env: "WHISPER_ENDPOINT" },
];

export async function authHandler(): Promise<number> {
  println("Provider detection:");
  for (const p of providers) {
    const set = process.env[p.env] || (p.alt ? process.env[p.alt] : "");
    const status = set ? green("✔ set") : dim("✗ not set");
    println(`  ${p.name.padEnd(18)} ${p.env.padEnd(24)} ${status}`);
  }
  return EXIT_OK;
}