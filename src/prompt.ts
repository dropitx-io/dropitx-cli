import { openSync } from "node:fs";
import { createInterface } from "node:readline";
import { ReadStream, WriteStream } from "node:tty";

export type Ask = (question: string) => Promise<string>;

/** Asks for a non-empty password twice until both entries match. */
export async function askPasswordConfirmed(ask: Ask, warn: (message: string) => void): Promise<string> {
  for (;;) {
    const first = await ask("Password: ");
    if (!first) continue;
    if ((await ask("Repeat for confirmation: ")) === first) return first;
    warn("Error: The two entered values do not match.");
  }
}

/** Writes `question` and resolves with the next input line ("" at end of input). */
export function askLine(
  question: string,
  input: NodeJS.ReadableStream,
  write: (s: string) => void,
): Promise<string> {
  write(question);
  const rl = createInterface({ input, terminal: false });
  return new Promise((resolve) => {
    let answered = false;
    rl.once("line", (line) => {
      answered = true;
      rl.close();
      resolve(line.trim());
    });
    rl.once("close", () => {
      if (!answered) resolve("");
    });
  });
}

/**
 * Reads a line from the controlling terminal without echoing it. Uses /dev/tty
 * so it works while stdin is a pipe (`cat notes.txt | dropitx -p`).
 */
export function readHidden(question: string): Promise<string> {
  let input: ReadStream;
  let output: WriteStream;
  try {
    const fd = openSync("/dev/tty", "r+");
    input = new ReadStream(fd);
    output = new WriteStream(fd);
  } catch {
    if (!process.stdin.isTTY) {
      return Promise.reject(
        new Error("Cannot prompt for a password without a terminal; pass it as --password <value>"),
      );
    }
    input = process.stdin as ReadStream;
    output = process.stderr as WriteStream;
  }

  output.write(question);
  input.setRawMode(true);
  input.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (err?: Error) => {
      input.setRawMode(false);
      input.removeListener("data", onData);
      input.pause();
      output.write("\n");
      if (input !== process.stdin) input.destroy();
      if (err) reject(err);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return finish();
        if (ch === "\u0003") return finish(new Error("Aborted"));
        if (ch === "\u0004" && value === "") return finish(new Error("Aborted"));
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    input.on("data", onData);
    input.resume();
  });
}
