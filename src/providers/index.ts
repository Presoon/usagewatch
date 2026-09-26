// ProviderDefinition registry. Keep the order in sync with PROVIDERS in
// core/types.ts (index.test.ts checks it).
import type { ProviderDefinition } from "./types";
import type { ProviderId } from "../core/types";
import { claudeProvider } from "./claude";
import { codexProvider } from "./codex";
import { geminiProvider } from "./gemini";
import { kimiProvider } from "./kimi";
import { openrouterProvider } from "./openrouter";
import { zaiProvider } from "./zai";

export const providers: ProviderDefinition[] = [
  claudeProvider,
  codexProvider,
  geminiProvider,
  kimiProvider,
  openrouterProvider,
  zaiProvider,
];

export const providerById: Map<ProviderId, ProviderDefinition> = new Map(
  providers.map((p) => [p.id, p]),
);
