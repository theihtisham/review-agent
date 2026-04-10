import { describe, it, expect } from "vitest";
import {
  sanitizeForLog,
  truncateString,
  validateApiKey,
  formatCommentBody,
  buildSummaryComment,
} from "../src/utils/security";

describe("sanitizeForLog", () => {
  it("redacts GitHub tokens", () => {
    const input = 'token=ghp_1234567890abcdefghijklmnopqrstuvwxyz';
    const result = sanitizeForLog(input);
    expect(result).not.toContain("ghp_1234567890");
    expect(result).toContain("[REDACTED]");
  });

  it("redacts OpenAI API keys", () => {
    const input = 'key=sk-abcdefghijklmnopqrstuvwxyz1234567890';
    const result = sanitizeForLog(input);
    expect(result).not.toContain("sk-abcdefghijklmno");
    expect(result).toContain("[REDACTED]");
  });

  it("redacts generic password assignments", () => {
    const input = 'password: "mySecretPassword123"';
    const result = sanitizeForLog(input);
    expect(result).not.toContain("mySecretPassword123");
    expect(result).toContain("[REDACTED]");
  });

  it("redacts JWT tokens", () => {
    const input = "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.abc123";
    const result = sanitizeForLog(input);
    expect(result).toContain("[REDACTED]");
  });

  it("leaves safe strings untouched", () => {
    const input = "User logged in successfully from 192.168.1.1";
    const result = sanitizeForLog(input);
    expect(result).toBe(input);
  });

  it("handles empty string", () => {
    expect(sanitizeForLog("")).toBe("");
  });
});

describe("truncateString", () => {
  it("does not truncate strings within limit", () => {
    expect(truncateString("hello", 10)).toBe("hello");
  });

  it("truncates long strings", () => {
    const result = truncateString("a".repeat(100), 50);
    expect(result.length).toBeLessThan(100);
    expect(result).toContain("truncated");
  });

  it("handles exact length", () => {
    expect(truncateString("hello", 5)).toBe("hello");
  });
});

describe("validateApiKey", () => {
  it("throws for missing OpenAI key", () => {
    expect(() => validateApiKey("", "openai")).toThrow("required");
  });

  it("throws for missing Anthropic key", () => {
    expect(() => validateApiKey("", "anthropic")).toThrow("required");
  });

  it("allows Ollama without key", () => {
    expect(() => validateApiKey("", "ollama")).not.toThrow();
  });

  it("throws for very short key", () => {
    expect(() => validateApiKey("abc", "openai")).toThrow("too short");
  });

  it("accepts valid key", () => {
    expect(() => validateApiKey("sk-validapikey123456", "openai")).not.toThrow();
  });
});

describe("formatCommentBody", () => {
  it("includes severity emoji", () => {
    const result = formatCommentBody("test message", "critical", "security");
    expect(result).toContain("🔴");
  });

  it("includes category label", () => {
    const result = formatCommentBody("test message", "warning", "performance");
    expect(result).toContain("Performance");
  });

  it("includes the message", () => {
    const result = formatCommentBody("Fix this bug", "info", "bug");
    expect(result).toContain("Fix this bug");
  });

  it("includes ReviewAgent attribution", () => {
    const result = formatCommentBody("test", "info", "style");
    expect(result).toContain("ReviewAgent");
  });
});

describe("buildSummaryComment", () => {
  it("builds a summary with score and breakdown", () => {
    const result = buildSummaryComment(
      75,
      { bug: 2, security: 1, performance: 0, style: 3, convention: 0 },
      "Found some issues.",
      5,
      6
    );

    expect(result).toContain("75/100");
    expect(result).toContain("Bug");
    expect(result).toContain("Security");
    expect(result).toContain("Style");
    expect(result).toContain("5");
    expect(result).toContain("6");
  });

  it("handles clean review with no issues", () => {
    const result = buildSummaryComment(
      100,
      { bug: 0, security: 0, performance: 0, style: 0, convention: 0 },
      "All good!",
      3,
      0
    );

    expect(result).toContain("100/100");
    expect(result).toContain("Great");
    expect(result).toContain("No issues found");
  });

  it("shows appropriate label for low scores", () => {
    const result = buildSummaryComment(
      25,
      { bug: 5, security: 3, performance: 2, style: 1, convention: 1 },
      "Major issues.",
      10,
      12
    );

    expect(result).toContain("Poor");
  });
});
