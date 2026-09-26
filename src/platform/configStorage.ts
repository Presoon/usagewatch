import { load } from "@tauri-apps/plugin-store";
import { parseConfig, type AppConfig } from "../core/config";

export async function loadConfig(): Promise<AppConfig> {
  const store = await load("config.json");
  return parseConfig(await store.get<unknown>("config"));
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const validated = parseConfig(config);
  const store = await load("config.json");
  await store.set("config", validated);
  await store.save();
}
