import { describe, it, expect, vi, beforeEach } from "vitest";
import { LLMClient } from "../src/llm-client";
import { ReviewAgentConfig, FileDiff } from "../src/types";

const mockConfig: ReviewAgentConfig = {
  llm: {
    provider: "openai",
    apiKey: "test-key-12345678",
    model: "gpt-4o",
    baseUrl: "https://api.openai.com/v1",
  },
  review: {
    severity: "info",
    maxComments: 50,
    reviewType: "comment",
    languageHints: [],
    learnConventions: true,
  },
  ignore: { paths: [], extensions: [] },
  rules: [],
};

const mockDiff: FileDiff = {
  filename: "src/app.ts",
  patch: `@@ -1,3 +1,5 @@
 import express from 'express';
+const app = express();
+app.listen(3000);`,
  additions: 2,
  deletions: 0,
  changeType: "modified",
};

describe("LLMClient", () => {
  let client: LLMClient;

  beforeEach(() => {
    client = new LLMClient(mockConfig);
  });

  it("creates client with provided config", () => {
    expect(client).toBeDefined();
  });

  it("parses valid JSON response correctly", async () => {
    // Access the private parseResponse method via any
    const parseResponse = (client as any).parseResponse.bind(client);

    const validResponse = JSON.stringify({
      comments: [
        {
          line: 2,
          severity: "warning",
          category: "performance",
          message: "Consider adding error handling.",
        },
      ],
      score: 80,
      summary: "Good code with minor issues.",
    });

    const result = parseResponse(validResponse);
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].line).toBe(2);
    expect(result.score).toBe(80);
    expect(result.summary).toBe("Good code with minor issues.");
  });

  it("handles empty comments array", async () => {
    const parseResponse = (client as any).parseResponse.bind(client);

    const response = JSON.stringify({
      comments: [],
      score: 95,
      summary: "Clean code!",
    });

    const result = parseResponse(response);
    expect(result.comments).toEqual([]);
    expect(result.score).toBe(95);
  });

  it("handles malformed JSON response gracefully", async () => {
    const parseResponse = (client as any).parseResponse.bind(client);

    const result = parseResponse("not valid json");
    expect(result.comments).toEqual([]);
    expect(result.score).toBe(75);
  });

  it("clamps score to 0-100 range", async () => {
    const parseResponse = (client as any).parseResponse.bind(client);

    const result1 = parseResponse(
      JSON.stringify({ comments: [], score: 150, summary: "" })
    );
    expect(result1.score).toBe(100);

    const result2 = parseResponse(
      JSON.stringify({ comments: [], score: -10, summary: "" })
    );
    expect(result2.score).toBe(0);
  });

  it("filters out comments with missing required fields", async () => {
    const parseResponse = (client as any).parseResponse.bind(client);

    const response = JSON.stringify({
      comments: [
        { line: 1, severity: "warning", category: "bug", message: "valid" },
        { line: 2, severity: "warning" }, // missing category and message
        { severity: "info", category: "style", message: "no line" }, // missing line
        { line: "not a number", severity: "info", category: "style", message: "bad line" },
      ],
      score: 60,
      summary: "Some issues.",
    });

    const result = parseResponse(response);
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].message).toBe("valid");
  });

  it("builds system prompt with conventions", () => {
    const buildSystemPrompt = (client as any).buildSystemPrompt.bind(client);

    const prompt = buildSystemPrompt(
      "typescript",
      [
        {
          language: "typescript",
          patterns: ["ES module imports"],
          namingStyle: "camelCase",
          examples: ["import { foo } from './bar'"],
        },
      ],
      mockConfig
    );

    expect(prompt).toContain("code reviewer");
    expect(prompt).toContain("typescript");
    expect(prompt).toContain("camelCase");
    expect(prompt).toContain("ES module imports");
  });

  it("builds system prompt with custom rules", () => {
    const buildSystemPrompt = (client as any).buildSystemPrompt.bind(client);

    const configWithRules: ReviewAgentConfig = {
      ...mockConfig,
      rules: [
        {
          name: "no-console",
          pattern: "console\\.log",
          message: "Use logger instead of console.log",
          severity: "warning",
          category: "convention",
        },
      ],
    };

    const prompt = buildSystemPrompt("javascript", [], configWithRules);
    expect(prompt).toContain("no-console");
    expect(prompt).toContain("logger instead");
  });
});
