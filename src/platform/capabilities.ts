import { invoke } from "@tauri-apps/api/core";

export interface PlatformCapabilities {
  secureStorage: boolean;
  edgeWidget: boolean;
}

export const getCapabilities = () => invoke<PlatformCapabilities>("platform_capabilities");
