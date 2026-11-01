import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { askLine, askPasswordConfirmed } from "../src/prompt.js";

function scripted(answers: string[]) {
  const asked: string[] = [];
  return {
    asked,
    ask: async (q: string) => {
      asked.push(q);
      const a = answers.shift();
      if (a === undefined) throw new Error("no more input");
      return a;
    },
  };
}

describe("askPasswordConfirmed", () => {
  it("returns the password once it is entered twice", async () => {
    const s = scripted(["s3cret", "s3cret"]);
    expect(await askPasswordConfirmed(s.ask, () => {})).toBe("s3cret");
    expect(s.asked).toEqual(["Password: ", "Repeat for confirmation: "]);
  });

  it("asks again after a mismatch and after an empty entry", async () => {
    const warnings: string[] = [];
    const s = scripted(["a", "b", "", "c", "c"]);
    expect(await askPasswordConfirmed(s.ask, (w) => warnings.push(w))).toBe("c");
    expect(warnings).toEqual(["Error: The two entered values do not match."]);
    expect(s.asked).toHaveLength(5);
  });
});

describe("askLine", () => {
  it("reads one line from the input stream", async () => {
    const out: string[] = [];
    const answer = await askLine("Overwrite? [y/N]: ", Readable.from(["yes\nrest\n"]), (s) => out.push(s));
    expect(answer).toBe("yes");
    expect(out.join("")).toBe("Overwrite? [y/N]: ");
  });

  it("resolves to an empty string at end of input", async () => {
    expect(await askLine("q? ", Readable.from([]), () => {})).toBe("");
  });
});
