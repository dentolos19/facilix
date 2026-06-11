import { env } from "cloudflare:workers";
import { openRouterText } from "@tanstack/ai-openrouter";

export function createAI() {
  const adapter = openRouterText(env.OPENROUTER_MODEL as any);

  return {
    adapter,
  };
}
