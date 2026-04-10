import { describe, it, expect } from "vitest";
import {
  parsePatch,
  getChangedLines,
  shouldIgnoreFile,
  getFileLanguage,
  formatDiffForReview,
} from "../src/utils/diff-parser";
import { FileDiff, ReviewAgentConfig } from "../src/types";
import { SAMPLE_DIFF_SINGLE_FILE, SAMPLE_PATCH_MULTILINE } from "./fixtures/mock-data";

const mockConfig: ReviewAgentConfig = {
  llm: { provider: "openai", apiKey: "test", model: "gpt-4o", baseUrl: "https://api.openai.com/v1" },
  review: { severity: "warning", maxComments: 50, reviewType: "comment", languageHints: [], learnConventions: true },
  ignore: {
    paths: ["node_modules/**", "dist/**", "**/*.min.js", "**/*.generated.*"],
    extensions: [".png", ".jpg", ".svg", ".woff"],
  },
  rules: [],
};

describe("parsePatch", () => {
  it("parses a single hunk", () => {
    const hunks = parsePatch(SAMPLE_DIFF_SINGLE_FILE.patch);
    expect(hunks.length).toBeGreaterThanOrEqual(1);
    expect(hunks[0].newStart).toBe(1);
    expect(hunks[0].lines.length).toBeGreaterThan(0);
  });

  it("returns empty array for empty patch", () => {
    expect(parsePatch("")).toEqual([]);
  });

  it("parses multi-line patches correctly", () => {
    const hunks = parsePatch(SAMPLE_PATCH_MULTILINE);
    expect(hunks.length).toBe(1);
    expect(hunks[0].oldStart).toBe(5);
    expect(hunks[0].newStart).toBe(5);
  });
});

describe("getChangedLines", () => {
  it("returns only added lines with correct line numbers", () => {
    const changed = getChangedLines(SAMPLE_DIFF_SINGLE_FILE.patch);
    expect(changed.size).toBeGreaterThan(0);

    const values = Array.from(changed.values());
    const hasSecretLine = values.some((v) => v.includes("ADMIN_PASSWORD"));
    expect(hasSecretLine).toBe(true);
  });

  it("returns empty map for empty patch", () => {
    expect(getChangedLines("").size).toBe(0);
  });
});

describe("shouldIgnoreFile", () => {
  it("ignores node_modules paths", () => {
    expect(shouldIgnoreFile("node_modules/foo/bar.js", mockConfig)).toBe(true);
  });

  it("ignores dist paths", () => {
    expect(shouldIgnoreFile("dist/bundle.js", mockConfig)).toBe(true);
  });

  it("ignores minified files", () => {
    expect(shouldIgnoreFile("vendor/lib.min.js", mockConfig)).toBe(true);
  });

  it("ignores generated files", () => {
    expect(shouldIgnoreFile("src/api.generated.ts", mockConfig)).toBe(true);
  });

  it("ignores binary extensions", () => {
    expect(shouldIgnoreFile("assets/logo.png", mockConfig)).toBe(true);
    expect(shouldIgnoreFile("assets/icon.svg", mockConfig)).toBe(true);
  });

  it("does not ignore normal source files", () => {
    expect(shouldIgnoreFile("src/auth.ts", mockConfig)).toBe(false);
    expect(shouldIgnoreFile("src/utils.js", mockConfig)).toBe(false);
    expect(shouldIgnoreFile("app.py", mockConfig)).toBe(false);
  });
});

describe("getFileLanguage", () => {
  it("detects TypeScript", () => {
    expect(getFileLanguage("src/app.ts")).toBe("typescript");
    expect(getFileLanguage("src/component.tsx")).toBe("typescript");
  });

  it("detects JavaScript", () => {
    expect(getFileLanguage("src/index.js")).toBe("javascript");
    expect(getFileLanguage("src/view.jsx")).toBe("javascript");
  });

  it("detects Python", () => {
    expect(getFileLanguage("app.py")).toBe("python");
  });

  it("detects Go", () => {
    expect(getFileLanguage("main.go")).toBe("go");
  });

  it("detects Rust", () => {
    expect(getFileLanguage("src/main.rs")).toBe("rust");
  });

  it("returns unknown for unrecognized extensions", () => {
    expect(getFileLanguage("data.xyz")).toBe("unknown");
  });

  it("detects Dockerfile", () => {
    expect(getFileLanguage("Dockerfile")).toBe("dockerfile");
  });

  it("detects Makefile", () => {
    expect(getFileLanguage("Makefile")).toBe("makefile");
  });
});

describe("formatDiffForReview", () => {
  it("includes filename in formatted output", () => {
    const result = formatDiffForReview(SAMPLE_DIFF_SINGLE_FILE);
    expect(result).toContain("src/auth.ts");
  });

  it("includes change stats", () => {
    const result = formatDiffForReview(SAMPLE_DIFF_SINGLE_FILE);
    expect(result).toContain("+8/-1");
  });

  it("includes diff content", () => {
    const result = formatDiffForReview(SAMPLE_DIFF_SINGLE_FILE);
    expect(result).toContain("@@");
  });
});
