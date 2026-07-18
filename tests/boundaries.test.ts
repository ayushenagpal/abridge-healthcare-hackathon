import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Enforces the load-bearing constraint: the deterministic protocol engine never
 * imports the agent layer or any LLM SDK. If this fails, clinical logic has
 * leaked toward the model.
 */
describe("LLM boundary", () => {
  it("no file under src/core/protocol imports the agent or an LLM SDK", () => {
    const dir = join(process.cwd(), "src/core/protocol");
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".ts")) continue;
      const src = readFileSync(join(dir, file), "utf8");
      expect(src, `${file} must not import the agent layer`).not.toMatch(
        /from\s+["'][^"']*agent/,
      );
      expect(src, `${file} must not import an LLM SDK`).not.toMatch(
        /@anthropic-ai|openai/,
      );
    }
  });

  it("the graph module is also LLM-free", () => {
    const src = readFileSync(join(process.cwd(), "src/core/graph.ts"), "utf8");
    expect(src).not.toMatch(/@anthropic-ai|from\s+["'][^"']*agent/);
  });
});
