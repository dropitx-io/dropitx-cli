import { readFileSync } from "node:fs";

/** package.json sits one level above both src/ and the compiled output directory. */
export const VERSION: string = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;
