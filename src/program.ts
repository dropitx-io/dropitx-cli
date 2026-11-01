import { existsSync } from "node:fs";
import { Argument, Command, CommanderError } from "commander";
import { getApiKey, getApiUrl, setApiKey, setApiUrl } from "./config.js";
import { formatTable, formatUploadResult, maskKey, painter } from "./output.js";
import { type Ask, askLine, askPasswordConfirmed } from "./prompt.js";
import { qrTerminal, saveQrImage } from "./qr.js";
import { BUNDLED_SKILL_DIR, installSkill, skillDestination } from "./skill-install.js";
import { type UploadOptions, type UploadResult, uploadFile, uploadStdin, uploadText } from "./uploader.js";
import { VERSION } from "./version.js";

/** Everything the CLI touches outside the process, so tests can drive it in memory. */
export interface CliIO {
  stdin: NodeJS.ReadableStream;
  /** False when input is piped in. */
  stdinIsTTY: boolean;
  out: (s: string) => void;
  err: (s: string) => void;
  color: boolean;
  /** Reads one line without echo (passwords). */
  askHidden: Ask;
}

/** Thrown by actions to stop with an exit code after printing their own message. */
class Exit extends Error {
  constructor(readonly code: number) {
    super(`exit ${code}`);
  }
}

interface UploadFlags {
  password?: string | true;
  expires?: string;
  burn?: boolean;
  slug?: string;
  qr?: boolean;
  qrFile?: string;
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function buildProgram(io: CliIO): Command {
  const p = painter(io.color);
  const line = (s = "") => io.out(`${s}\n`);
  /** Prints the error (and usage hints) to stderr and exits 1. */
  const fail = (message: string, ...hints: string[]): never => {
    io.err(`${p.red(message)}\n`);
    for (const h of hints) io.err(`${h}\n`);
    throw new Exit(1);
  };

  /** `-p` with no value means "ask me"; a value is used as-is. */
  const resolvePassword = async (password: string | true | undefined) =>
    password === true ? askPasswordConfirmed(io.askHidden, (w) => io.err(`${w}\n`)) : password;

  const uploadOptions = async (f: UploadFlags): Promise<UploadOptions> => ({
    password: await resolvePassword(f.password),
    expires: f.expires,
    burn: f.burn,
    slug: f.slug,
  });

  async function showQr(url: string, heading: string) {
    line();
    line(p.bold(heading));
    io.out(await qrTerminal(url, { color: io.color }));
  }

  async function printResult(result: UploadResult, f: Pick<UploadFlags, "qr" | "qrFile">) {
    io.out(formatUploadResult(result, p));
    if (f.qr) await showQr(result.url, "QR Code:");
    if (f.qrFile) {
      await saveQrImage(result.url, f.qrFile);
      line();
      line(p.green(`QR code saved to: ${f.qrFile}`));
    }
  }

  async function uploadPiped(f: UploadFlags) {
    const opts = await uploadOptions(f);
    let result: UploadResult;
    try {
      result = await uploadStdin(io.stdin, opts);
    } catch (e) {
      return fail(`Error: ${errorMessage(e)}`);
    }
    await printResult(result, f);
  }

  const withUploadOptions = (cmd: Command, { qrFile = true } = {}) => {
    cmd
      .option("-p, --password [password]", "Password protection (prompts if no value)")
      .option("-e, --expires <time>", "Expiration time (e.g., 1h, 7d, 1w)")
      .option("-b, --burn", "Burn after reading")
      .option("-s, --slug <slug>", "Custom slug (3-32 chars)")
      .option("-q, --qr", "Show QR code");
    if (qrFile) cmd.option("--qr-file <path>", "Save QR code to file");
    return cmd;
  };

  const program = new Command("dropitx");
  program
    .description(
      [
        "DropItX — Developer-friendly file sharing from the command line.",
        "",
        "Upload files, text, and pipes to DropItX with simple commands.",
        "",
        "Examples:",
        "  dropitx upload file.txt",
        "  echo hello | dropitx",
        "  dropitx upload file.txt --expires 1h --password",
        "  dropitx config set-key shk_xxx",
      ].join("\n"),
    )
    .version(VERSION, "--version", "Show the version and exit")
    .enablePositionalOptions()
    .exitOverride()
    .configureOutput({ writeOut: io.out, writeErr: io.err });
  withUploadOptions(program).action(async (f: UploadFlags) => {
    if (io.stdinIsTTY) {
      program.outputHelp();
      return;
    }
    await uploadPiped(f);
  });

  withUploadOptions(
    program
      .command("upload")
      .description("Upload files to DropItX. With no files, uploads piped stdin.")
      .argument("[files...]", "Files to upload"),
  ).action(async (files: string[], f: UploadFlags) => {
    for (const file of files) {
      if (!existsSync(file)) {
        io.err(`${p.red(`Error: Invalid value for '[FILES]...': Path '${file}' does not exist.`)}\n`);
        throw new Exit(2); // usage error, like a bad argument
      }
    }
    if (files.length === 0) {
      if (io.stdinIsTTY) {
        fail("Error: No files specified and no input from stdin", "Usage: dropitx upload <file> or echo hello | dropitx");
      }
      await uploadPiped(f);
      return;
    }

    const opts = await uploadOptions(f);
    const results: UploadResult[] = [];
    for (const file of files) {
      io.err(`${p.dim(`Uploading ${file}...`)}\n`);
      try {
        // A custom slug only makes sense for a single file.
        results.push(await uploadFile(file, { ...opts, slug: files.length === 1 ? opts.slug : undefined }));
      } catch (e) {
        fail(`Error uploading ${file}: ${errorMessage(e)}`);
      }
    }

    if (results.length === 1) {
      await printResult(results[0], f);
      return;
    }
    io.out(formatTable("Upload Results", ["File", "URL", "Slug"], results.map((r) => [r.filename, r.url, r.slug]), p));
    if (f.qr) await showQr(results[0].url, "QR Code (first file):");
  });

  withUploadOptions(
    program
      .command("text")
      .description("Upload text content directly.")
      .argument("<content>", "Text to upload")
      .option("-f, --filename <name>", "Filename for the content"),
    { qrFile: false },
  ).action(async (content: string, f: UploadFlags & { filename?: string }) => {
    const opts = await uploadOptions(f);
    let result: UploadResult;
    try {
      result = await uploadText(content, { ...opts, filename: f.filename });
    } catch (e) {
      return fail(`Error: ${errorMessage(e)}`);
    }
    await printResult(result, { qr: f.qr });
  });

  program
    .command("config")
    .description("Manage DropItX CLI configuration (~/.dropitx/config.json).")
    .addArgument(new Argument("<action>", "set-key <api_key> | show | set-url <url>").choices(["set-key", "show", "set-url"]))
    .argument("[value]", "API key or URL")
    .action((action: string, value: string | undefined) => {
      if (action === "set-key") {
        if (!value) fail("Error: API key required", "Usage: dropitx config set-key <your-api-key>");
        setApiKey(value as string);
        line(p.green("API key saved successfully"));
        line(p.dim("Config file: ~/.dropitx/config.json"));
      } else if (action === "show") {
        const key = getApiKey();
        io.out(
          formatTable(
            "DropItX Configuration",
            ["Setting", "Value"],
            [
              ["API URL", getApiUrl()],
              ["API Key", key ? maskKey(key) : "Not set"],
            ],
            p,
          ),
        );
      } else {
        if (!value) fail("Error: URL required", "Usage: dropitx config set-url https://api.dropitx.site");
        setApiUrl(value as string);
        line(p.green(`API URL set to: ${value}`));
      }
    });

  program
    .command("qr")
    .description("Generate a QR code for a DropItX URL.")
    .argument("<url>", "URL to encode")
    .option("-o, --output <path>", "Save the QR code image to a file instead of printing it")
    .action(async (url: string, f: { output?: string }) => {
      if (f.output) {
        await saveQrImage(url, f.output);
        line(p.green(`QR code saved to: ${f.output}`));
      } else {
        io.out(await qrTerminal(url, { color: io.color }));
      }
    });

  program
    .command("mcp")
    .summary("Start the MCP stdio server for AI agents")
    .description(
      [
        "Start the MCP stdio server for AI agents.",
        "",
        "Exposes 8 tools: publish_page, update_page, get_page, list_pages, delete_page,",
        "list_revisions, get_revision, restore_revision.",
        "",
        "Configure in Claude Code:",
        "  claude mcp add dropitx --env DROPITX_API_KEY=shk_... -- npx -y dropitx mcp",
      ].join("\n"),
    )
    .action(async () => {
      const { runServer } = await import("./mcp-server.js");
      await runServer();
    });

  program
    .command("skill")
    .description("Manage the drop-plan Claude Code skill.")
    .command("install")
    .summary("Install the drop-plan Claude Code skill")
    .description(
      "Install the drop-plan Claude Code skill to ~/.claude/skills/drop-plan.\n" +
        "Re-run with --force to pick up the copy bundled with a newer dropitx.",
    )
    .option("--force", "Overwrite an existing installed copy")
    .action(async (f: { force?: boolean }) => {
      if (!existsSync(BUNDLED_SKILL_DIR)) fail("Error: bundled skill content not found in this install");
      const dest = skillDestination();
      if (existsSync(dest)) {
        if (!f.force) {
          line(p.yellow(`Already installed at ${dest}`));
          line("Use --force to overwrite with the bundled copy.");
          return;
        }
        const answer = await askLine(`Overwrite ${dest}? [y/N]: `, io.stdin, io.out);
        if (!/^y(es)?$/i.test(answer)) {
          line();
          line(p.dim("Aborted, no changes made"));
          return;
        }
      }
      installSkill(dest);
      line(p.green(`Installed drop-plan skill to: ${dest}`));
      line(p.dim('Try: /drop-plan, or just say "share this plan"'));
    });

  return program;
}

/** Parses `argv` (without node and script) and returns the exit code. */
export async function run(argv: string[], io: CliIO): Promise<number> {
  try {
    await buildProgram(io).parseAsync(argv, { from: "user" });
    return 0;
  } catch (e) {
    if (e instanceof Exit) return e.code;
    if (e instanceof CommanderError) return e.exitCode;
    io.err(`Error: ${errorMessage(e)}\n`);
    return 1;
  }
}
