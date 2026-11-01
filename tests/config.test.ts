import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getApiKey,
  getApiUrl,
  getFrontendUrl,
  loadConfig,
  saveConfig,
  setApiKey,
  setApiUrl,
} from "../src/config.js";
import { useIsolatedHome } from "./helpers.js";

const env = useIsolatedHome();
const configFile = () => join(env.home(), ".dropitx", "config.json");

describe("config resolution", () => {
  it("defaults the API URL to production", () => {
    expect(getApiUrl()).toBe("https://api.dropitx.site");
  });

  it("defaults the frontend URL to production", () => {
    expect(getFrontendUrl()).toBe("https://dropitx.site");
  });

  it("reads api_url from the config file and strips trailing slashes", () => {
    saveConfig({ api_url: "http://localhost:8000/" });
    expect(getApiUrl()).toBe("http://localhost:8000");
  });

  it("lets DROPITX_API_URL override the config file", () => {
    saveConfig({ api_url: "http://from-file" });
    process.env.DROPITX_API_URL = "https://example.com/";
    expect(getApiUrl()).toBe("https://example.com");
  });

  it("reads frontend_url from file and DROPITX_FRONTEND_URL from env", () => {
    saveConfig({ frontend_url: "https://front.file/" });
    expect(getFrontendUrl()).toBe("https://front.file");
    process.env.DROPITX_FRONTEND_URL = "https://front.env/";
    expect(getFrontendUrl()).toBe("https://front.env");
  });

  it("lets DROPITX_API_KEY override the key from the file", () => {
    setApiKey("sk_file");
    expect(getApiKey()).toBe("sk_file");
    process.env.DROPITX_API_KEY = "sk_env";
    expect(getApiKey()).toBe("sk_env");
    delete process.env.DROPITX_API_KEY;
    expect(getApiKey()).toBe("sk_file");
  });

  it("returns undefined when no key is configured", () => {
    expect(getApiKey()).toBeUndefined();
  });
});

describe("config file", () => {
  it("writes ~/.dropitx/config.json with 2-space JSON, keeping other keys", () => {
    saveConfig({ api_url: "http://keep.me" });
    setApiKey("shk_abc");
    expect(JSON.parse(readFileSync(configFile(), "utf8"))).toEqual({
      api_url: "http://keep.me",
      api_key: "shk_abc",
    });
    expect(readFileSync(configFile(), "utf8")).toContain('\n  "api_key": "shk_abc"');
  });

  it("reads a config file written by the Python CLI", () => {
    mkdirSync(join(env.home(), ".dropitx"), { recursive: true });
    writeFileSync(configFile(), '{\n  "api_key": "shk_py",\n  "api_url": "http://py.local/"\n}');
    expect(getApiKey()).toBe("shk_py");
    expect(getApiUrl()).toBe("http://py.local");
  });

  it("treats a corrupt config file as empty", () => {
    mkdirSync(join(env.home(), ".dropitx"), { recursive: true });
    writeFileSync(configFile(), "{not json");
    expect(loadConfig()).toEqual({});
    expect(getApiUrl()).toBe("https://api.dropitx.site");
  });

  it("setApiUrl stores the URL without trailing slashes", () => {
    setApiUrl("http://example.invalid/");
    expect(loadConfig()).toEqual({ api_url: "http://example.invalid" });
  });
});
