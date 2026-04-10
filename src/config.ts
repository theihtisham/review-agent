import * as core from "@actions/core";
import * as jsYaml from "js-yaml";
import * as path from "path";
import * as fs from "fs";
import {
  ActionInputs,
  LLMProvider,
  ReviewAgentConfig,
  ReviewType,
  Severity,
} from "./types";

const DEFAULT_IGNORE_PATHS = [
  "node_modules/**",
  "vendor/**",
  "dist/**",
  "build/**",
  ".git/**",
  "coverage/**",
  "**/*.min.js",
  "**/*.min.css",
  "**/*.bundle.js",
  "**/*.chunk.js",
  "**/*.map",
  "**/*.lock",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "go.sum",
  "**/*.pb.go",
  "**/*.generated.*",
  "**/*.graphql.generated.*",
  "**/__generated__/**",
];

const DEFAULT_IGNORE_EXTENSIONS = [
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp4",
  ".mp3",
  ".wav",
  ".zip",
  ".tar",
  ".gz",
];

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export function parseActionInputs(): ActionInputs {
  const provider = core.getInput("llm-provider", { required: false });
  const severity = core.getInput("severity", { required: false });

  const validProviders: LLMProvider[] = ["openai", "anthropic", "ollama"];
  if (!validProviders.includes(provider as LLMProvider)) {
    throw new Error(
      `Invalid llm-provider: "${provider}". Must be one of: ${validProviders.join(", ")}`
    );
  }

  const validSeverities: Severity[] = ["critical", "warning", "info"];
  if (!validSeverities.includes(severity as Severity)) {
    throw new Error(
      `Invalid severity: "${severity}". Must be one of: ${validSeverities.join(", ")}`
    );
  }

  const reviewType = core.getInput("review-type", { required: false });
  const validReviewTypes: ReviewType[] = [
    "approve",
    "request-changes",
    "comment",
  ];
  if (!validReviewTypes.includes(reviewType as ReviewType)) {
    throw new Error(
      `Invalid review-type: "${reviewType}". Must be one of: ${validReviewTypes.join(", ")}`
    );
  }

  const maxCommentsRaw = core.getInput("max-comments", { required: false });
  const maxComments = parseInt(maxCommentsRaw, 10);
  if (isNaN(maxComments) || maxComments < 1) {
    throw new Error(
      `Invalid max-comments: "${maxCommentsRaw}". Must be a positive integer.`
    );
  }

  const languageHintsRaw = core.getInput("language-hints", {
    required: false,
  });
  const languageHints = languageHintsRaw
    ? languageHintsRaw
        .split(",")
        .map((l) => l.trim().toLowerCase())
        .filter(Boolean)
    : [];

  const learnConventionsRaw = core.getInput("learn-conventions", {
    required: false,
  });
  const learnConventions = learnConventionsRaw !== "false";

  return {
    githubToken: core.getInput("github-token", { required: true }),
    llmProvider: provider as LLMProvider,
    llmApiKey: core.getInput("llm-api-key", { required: false }),
    llmModel: core.getInput("llm-model", { required: false }) || "gpt-4o",
    llmBaseUrl: core.getInput("llm-base-url", { required: false }),
    configPath:
      core.getInput("config-path", { required: false }) || ".reviewagent.yml",
    severity: severity as Severity,
    maxComments,
    reviewType: reviewType as ReviewType,
    languageHints,
    learnConventions,
  };
}

export function buildConfig(
  inputs: ActionInputs,
  workspaceDir: string
): ReviewAgentConfig {
  const configPath = path.join(workspaceDir, inputs.configPath);
  let fileConfig: Partial<ReviewAgentConfig> = {};

  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      fileConfig = jsYaml.load(raw) as Partial<ReviewAgentConfig>;
      core.info(`Loaded config from ${inputs.configPath}`);
    } catch (err) {
      core.warning(
        `Failed to parse ${inputs.configPath}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const config: ReviewAgentConfig = {
    llm: {
      provider: inputs.llmProvider,
      apiKey: inputs.llmApiKey,
      model: inputs.llmModel,
      baseUrl: inputs.llmBaseUrl || getDefaultBaseUrl(inputs.llmProvider),
    },
    review: {
      severity: inputs.severity,
      maxComments: inputs.maxComments,
      reviewType: inputs.reviewType,
      languageHints: inputs.languageHints,
      learnConventions: inputs.learnConventions,
    },
    ignore: {
      paths: [
        ...DEFAULT_IGNORE_PATHS,
        ...(fileConfig.ignore?.paths || []),
      ],
      extensions: [
        ...DEFAULT_IGNORE_EXTENSIONS,
        ...(fileConfig.ignore?.extensions || []),
      ],
    },
    rules: fileConfig.rules || [],
  };

  if (config.llm.provider === "ollama" && !config.llm.baseUrl) {
    config.llm.baseUrl = "http://localhost:11434/v1";
  }

  return config;
}

export function severityMeetsThreshold(
  severity: Severity,
  threshold: Severity
): boolean {
  return SEVERITY_ORDER[severity] <= SEVERITY_ORDER[threshold];
}

function getDefaultBaseUrl(provider: LLMProvider): string {
  switch (provider) {
    case "openai":
      return "https://api.openai.com/v1";
    case "anthropic":
      return "https://api.anthropic.com/v1";
    case "ollama":
      return "http://localhost:11434/v1";
    default:
      return "https://api.openai.com/v1";
  }
}
