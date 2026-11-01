import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const DEFAULT_API_URL = "https://api.dropitx.site";

/** Base URL for share links: {frontend_url}/s/{slug}. */
export const DEFAULT_FRONTEND_URL = "https://dropitx.site";

export type Config = Record<string, unknown>;

/** Resolved on every call so HOME changes (tests, isolated runs) take effect. */
export function configPath(): string {
  return join(homedir(), ".dropitx", "config.json");
}

export function loadConfig(): Config {
  try {
    const parsed: unknown = JSON.parse(readFileSync(configPath(), "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Config) : {};
  } catch {
    return {};
  }
}

export function saveConfig(config: Config): void {
  const file = configPath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(config, null, 2));
}

const stripSlash = (url: string) => url.replace(/\/+$/, "");

function fileString(key: string): string | undefined {
  const value = loadConfig()[key];
  return typeof value === "string" ? value : undefined;
}

/** Environment variable wins over the config file. */
export function getApiKey(): string | undefined {
  return process.env.DROPITX_API_KEY || fileString("api_key");
}

export function setApiKey(apiKey: string): void {
  saveConfig({ ...loadConfig(), api_key: apiKey });
}

export function getApiUrl(): string {
  return stripSlash(process.env.DROPITX_API_URL || fileString("api_url") || DEFAULT_API_URL);
}

export function setApiUrl(url: string): void {
  saveConfig({ ...loadConfig(), api_url: stripSlash(url) });
}

export function getFrontendUrl(): string {
  return stripSlash(
    process.env.DROPITX_FRONTEND_URL || fileString("frontend_url") || DEFAULT_FRONTEND_URL,
  );
}
