import OpenAI from "openai";
import * as core from "@actions/core";
import {
  LLMProvider,
  ReviewAgentConfig,
  RepoConvention,
  FileDiff,
  LLMReviewResponse,
} from "./types";
import { formatDiffForReview, getFileLanguage } from "./utils/diff-parser";
import { RateLimiter, RetryHandler } from "./utils/rate-limiter";

const rateLimiter = new RateLimiter(3, 1000);

export class LLMClient {
  private client: OpenAI;
  private model: string;
  private provider: LLMProvider;

  constructor(config: ReviewAgentConfig) {
    this.provider = config.llm.provider;
    this.model = config.llm.model;

    const options: ConstructorParameters<typeof OpenAI>[0] = {
      apiKey: config.llm.apiKey || "ollama-placeholder",
      baseURL: config.llm.baseUrl,
    };

    if (this.provider === "anthropic") {
      options.defaultHeaders = {
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      };
    }

    this.client = new OpenAI(options);
  }

  async reviewFile(
    diff: FileDiff,
    conventions: RepoConvention[],
    config: ReviewAgentConfig
  ): Promise<LLMReviewResponse> {
    await rateLimiter.acquire();
    try {
      return await RetryHandler.withRetry(
        () => this.doReviewFile(diff, conventions, config),
        2,
        1500
      );
    } finally {
      rateLimiter.release();
    }
  }

  private async doReviewFile(
    diff: FileDiff,
    conventions: RepoConvention[],
    config: ReviewAgentConfig
  ): Promise<LLMReviewResponse> {
    const language = getFileLanguage(diff.filename);
    const diffText = formatDiffForReview(diff);

    const systemPrompt = this.buildSystemPrompt(language, conventions, config);
    const userPrompt = this.buildUserPrompt(diffText, config);

    core.info(`Reviewing ${diff.filename} (${language}) with ${this.provider}/${this.model}`);

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 4096,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("LLM returned empty response");
    }

    return this.parseResponse(content);
  }

  private buildSystemPrompt(
    language: string,
    conventions: RepoConvention[],
    config: ReviewAgentConfig
  ): string {
    const conventionText =
      conventions.length > 0
        ? conventions
            .map(
              (c) =>
                `- ${c.language}: naming=${c.namingStyle}, patterns=${c.patterns.join(", ")}${c.examples.length > 0 ? `, examples=${c.examples.join("; ")}` : ""}`
            )
            .join("\n")
        : "No conventions learned.";

    const customRulesText =
      config.rules.length > 0
        ? config.rules
            .map(
              (r) =>
                `- "${r.name}": pattern=/${r.pattern}/, message="${r.message}", severity=${r.severity}, category=${r.category}`
            )
            .join("\n")
        : "No custom rules.";

    return `You are an expert code reviewer. Analyze the provided code diff and find issues.

## Review Categories
- **bug**: Logic errors, null/undefined access, off-by-one errors, race conditions, unhandled edge cases
- **security**: OWASP Top 10 (injection, XSS, CSRF, broken auth, sensitive data exposure, security misconfiguration, etc.), hardcoded secrets, unsafe deserialization
- **performance**: N+1 queries, unnecessary re-renders, memory leaks, missing indexes, inefficient algorithms
- **style**: Naming, formatting, code organization, readability
- **convention**: Violations of project-specific patterns and conventions

## Severity Levels
- **critical**: Must fix before merge — security vulnerabilities, bugs that will cause failures
- **warning**: Should fix — potential bugs, performance issues, bad practices
- **info**: Nice to have — style improvements, minor optimizations

## Repository Conventions
${conventionText}

## Custom Rules
${customRulesText}

## Language
The code is primarily ${language}. Apply language-specific best practices.

## Constraints
- Only flag lines that appear in the diff (lines starting with +)
- Minimum severity threshold: ${config.review.severity}
- Be specific: reference the exact line and explain WHY it is an issue and HOW to fix it
- Do not flag false positives
- If the code looks good, return an empty comments array

## Response Format
Respond with a JSON object:
{
  "comments": [
    {
      "line": <line number in the new file>,
      "endLine": <optional end line for multi-line issues>,
      "severity": "critical" | "warning" | "info",
      "category": "bug" | "security" | "performance" | "style" | "convention",
      "message": "Clear description of the issue and suggested fix"
    }
  ],
  "score": <0-100 overall quality score for this file>,
  "summary": "Brief summary of findings"
}`;
  }

  private buildUserPrompt(
    diffText: string,
    _config: ReviewAgentConfig
  ): string {
    return `Please review this code diff and provide feedback:

${diffText}

Return your review as a JSON object with "comments", "score", and "summary" fields.`;
  }

  private parseResponse(content: string): LLMReviewResponse {
    try {
      const parsed = JSON.parse(content);

      const comments: LLMReviewResponse["comments"] = (parsed.comments || [])
        .filter(
          (c: Record<string, unknown>) =>
            c.line &&
            typeof c.line === "number" &&
            c.severity &&
            c.category &&
            c.message
        )
        .map((c: Record<string, unknown>) => ({
          line: c.line as number,
          endLine: c.endLine as number | undefined,
          severity: c.severity as LLMReviewResponse["comments"][0]["severity"],
          category: c.category as LLMReviewResponse["comments"][0]["category"],
          message: c.message as string,
        }));

      return {
        comments,
        score: typeof parsed.score === "number"
          ? Math.max(0, Math.min(100, parsed.score))
          : 75,
        summary: typeof parsed.summary === "string" ? parsed.summary : "Review completed.",
      };
    } catch (err) {
      core.warning(
        `Failed to parse LLM response as JSON: ${err instanceof Error ? err.message : String(err)}`
      );
      return {
        comments: [],
        score: 75,
        summary: "Review completed but response parsing failed.",
      };
    }
  }
}
