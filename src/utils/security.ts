export function sanitizeForLog(input: string): string {
  // Remove potential secrets: API keys, tokens, passwords
  let sanitized = input;

  const secretPatterns = [
    /(?:api[_-]?key|apikey|token|secret|password|auth)["\s]*[:=]["\s]*[^\s"',;}\]]{8,}/gi,
    /sk-[a-zA-Z0-9]{20,}/g,
    /sk_live_[a-zA-Z0-9]{24,}/g,
    /ghp_[a-zA-Z0-9]{36}/g,
    /gho_[a-zA-Z0-9]{36}/g,
    /ghu_[a-zA-Z0-9]{36}/g,
    /ghs_[a-zA-Z0-9]{36}/g,
    /github_pat_[a-zA-Z0-9_]{22,}/g,
    /AKIA[0-9A-Z]{16}/g,
    /AIza[0-9A-Za-z_-]{35}/g,
    /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
  ];

  for (const pattern of secretPatterns) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }

  return sanitized;
}

export function truncateString(input: string, maxLength: number): string {
  if (input.length <= maxLength) return input;
  return input.substring(0, maxLength) + "... (truncated)";
}

export function validateApiKey(apiKey: string, provider: string): void {
  if (!apiKey && provider !== "ollama") {
    throw new Error(
      `API key is required for provider "${provider}". Use the llm-api-key input or switch to ollama for local inference.`
    );
  }

  if (apiKey && apiKey.length < 8) {
    throw new Error("API key appears to be too short. Please check your secret configuration.");
  }
}

export function formatCommentBody(
  message: string,
  severity: string,
  category: string
): string {
  const severityEmoji: Record<string, string> = {
    critical: "🔴",
    warning: "🟡",
    info: "🔵",
  };

  const categoryLabel: Record<string, string> = {
    bug: "Bug",
    security: "Security",
    performance: "Performance",
    style: "Style",
    convention: "Convention",
  };

  const emoji = severityEmoji[severity] || "⚪";
  const label = categoryLabel[category] || category;

  return `${emoji} **[${label}]** (${severity})\n\n${message}\n\n---\n*Powered by [ReviewAgent](https://github.com/reviewagent/review-agent)*`;
}

export function buildSummaryComment(
  score: number,
  breakdown: Record<string, number>,
  summary: string,
  filesReviewed: number,
  commentsPosted: number
): string {
  const scoreColor =
    score >= 80 ? "🟢" : score >= 60 ? "🟡" : score >= 40 ? "🟠" : "🔴";
  const scoreLabel =
    score >= 80
      ? "Great"
      : score >= 60
        ? "Good"
        : score >= 40
          ? "Needs Work"
          : "Poor";

  const breakdownRows = Object.entries(breakdown)
    .filter(([, count]) => count > 0)
    .map(([category, count]) => {
      const emoji: Record<string, string> = {
        bug: "🐛",
        security: "🔒",
        performance: "⚡",
        style: "🎨",
        convention: "📐",
      };
      return `| ${emoji[category] || "•"} ${capitalize(category)} | ${count} |`;
    })
    .join("\n");

  const breakdownTable = breakdownRows
    ? `| Category | Count |\n|----------|-------|\n${breakdownRows}\n`
    : "No issues found. Clean code! \n";

  return `## ${scoreColor} ReviewAgent Code Review Summary

**Score: ${score}/100** — ${scoreLabel}

${summary}

### Breakdown

${breakdownTable}

### Stats
- **Files reviewed:** ${filesReviewed}
- **Comments posted:** ${commentsPosted}

---

*ReviewAgent — AI-powered code review. Configure via \`.reviewagent.yml\`*`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
