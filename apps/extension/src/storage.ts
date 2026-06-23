import { defaultSettings, normalizeSettings, type ExtensionSettings } from "@realtime-dubbing/shared";

const SETTINGS_KEY = "realtimeDubbing.settings";
const CLIENT_TOKEN_KEY = "realtimeDubbing.clientToken";

export async function loadSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.sync.get(SETTINGS_KEY);
  return normalizeSettings({
    ...defaultSettings,
    ...(stored[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined)
  });
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.sync.set({
    [SETTINGS_KEY]: normalizeSettings(settings)
  });
}

export async function loadClientToken(): Promise<string> {
  const stored = await chrome.storage.sync.get(CLIENT_TOKEN_KEY);
  return typeof stored[CLIENT_TOKEN_KEY] === "string" ? stored[CLIENT_TOKEN_KEY] : "dev-client-token";
}

export async function saveClientToken(token: string): Promise<void> {
  await chrome.storage.sync.set({
    [CLIENT_TOKEN_KEY]: token
  });
}

