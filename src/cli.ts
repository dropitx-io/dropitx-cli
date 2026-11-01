#!/usr/bin/env node
import { readHidden } from "./prompt.js";
import { run } from "./program.js";

const code = await run(process.argv.slice(2), {
  stdin: process.stdin,
  stdinIsTTY: process.stdin.isTTY === true,
  out: (s) => process.stdout.write(s),
  err: (s) => process.stderr.write(s),
  color: process.stdout.isTTY === true && !process.env.NO_COLOR,
  askHidden: readHidden,
});
process.exitCode = code;
