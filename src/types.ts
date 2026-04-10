export type Severity = "critical" | "warning" | "info";

export type ReviewCategory =
  | "bug"
  | "security"
  | "performance"
  | "style"
  | "convention";

export type LLMProvider = "openai" | "anthropic" | "ollama";

export type ReviewType = "approve" | "request-changes" | "comment";

export interface ReviewComment {
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  body: string;
  severity: Severity;
  category: ReviewCategory;
  startLine?: number;
}

export interface FileDiff {
  filename: string;
  patch: string;
  additions: number;
  deletions: number;
  changeType: string;
  content?: string;
}

export interface ReviewResult {
  comments: ReviewComment[];
  score: number;
  summary: string;
  breakdown: Record<ReviewCategory, number>;
}

export interface RepoConvention {
  language: string;
  patterns: string[];
  namingStyle: string;
  examples: string[];
}

export interface ReviewAgentConfig {
  llm: {
    provider: LLMProvider;
    apiKey: string;
    model: string;
    baseUrl: string;
  };
  review: {
    severity: Severity;
    maxComments: number;
    reviewType: ReviewType;
    languageHints: string[];
    learnConventions: boolean;
  };
  ignore: {
    paths: string[];
    extensions: string[];
  };
  rules: CustomRule[];
}

export interface CustomRule {
  name: string;
  pattern: string;
  message: string;
  severity: Severity;
  category: ReviewCategory;
}

export interface ActionInputs {
  githubToken: string;
  llmProvider: LLMProvider;
  llmApiKey: string;
  llmModel: string;
  llmBaseUrl: string;
  configPath: string;
  severity: Severity;
  maxComments: number;
  reviewType: ReviewType;
  languageHints: string[];
  learnConventions: boolean;
}

export interface GitHubPRContext {
  owner: string;
  repo: string;
  pullNumber: number;
  commitId: string;
}

export interface LLMReviewRequest {
  file: FileDiff;
  conventions: RepoConvention[];
  config: ReviewAgentConfig;
  existingCode?: string;
}

export interface LLMReviewResponse {
  comments: Array<{
    line: number;
    endLine?: number;
    severity: Severity;
    category: ReviewCategory;
    message: string;
  }>;
  score: number;
  summary: string;
}
