import * as core from "@actions/core";
import {
  FileDiff,
  ReviewAgentConfig,
  ReviewComment,
  ReviewResult,
  RepoConvention,
  ReviewCategory,
} from "./types";
import { LLMClient } from "./llm-client";
import { scanForSecurityIssues } from "./reviewers/security";
import { shouldIgnoreFile } from "./utils/diff-parser";
import { severityMeetsThreshold } from "./config";

export class Reviewer {
  private llm: LLMClient;
  private config: ReviewAgentConfig;

  constructor(config: ReviewAgentConfig) {
    this.llm = new LLMClient(config);
    this.config = config;
  }

  async review(
    diffs: FileDiff[],
    conventions: RepoConvention[]
  ): Promise<ReviewResult> {
    const allComments: ReviewComment[] = [];
    let totalScore = 0;
    let scoredFiles = 0;
    const breakdown: Record<ReviewCategory, number> = {
      bug: 0,
      security: 0,
      performance: 0,
      style: 0,
      convention: 0,
    };

    const filteredDiffs = diffs.filter(
      (d) => !shouldIgnoreFile(d.filename, this.config)
    );

    core.info(
      `Reviewing ${filteredDiffs.length} files (${diffs.length - filteredDiffs.length} ignored)`
    );

    for (const diff of filteredDiffs) {
      core.info(`Reviewing: ${diff.filename}`);

      // 1. Static security scan (fast, local)
      const securityComments = scanForSecurityIssues(diff, this.config);
      for (const comment of securityComments) {
        allComments.push(comment);
        breakdown[comment.category]++;
      }

      // 2. LLM-powered deep review
      try {
        const llmResult = await this.llm.reviewFile(
          diff,
          conventions,
          this.config
        );

        totalScore += llmResult.score;
        scoredFiles++;

        for (const llmComment of llmResult.comments) {
          // Deduplicate: skip if static scanner already flagged this line for security
          const isDuplicate =
            llmComment.category === "security" &&
            securityComments.some((sc) => sc.line === llmComment.line);

          if (!isDuplicate && severityMeetsThreshold(llmComment.severity, this.config.review.severity)) {
            allComments.push({
              path: diff.filename,
              line: llmComment.line,
              side: "RIGHT",
              body: llmComment.message,
              severity: llmComment.severity,
              category: llmComment.category,
              startLine: llmComment.endLine,
            });
            breakdown[llmComment.category]++;
          }
        }
      } catch (err) {
        core.warning(
          `LLM review failed for ${diff.filename}: ${err instanceof Error ? err.message : String(err)}`
        );
        // Continue reviewing other files
      }
    }

    // Sort by severity (critical first), then by file and line
    const sortedComments = allComments
      .sort((a, b) => {
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
        if (sevDiff !== 0) return sevDiff;
        const pathDiff = a.path.localeCompare(b.path);
        if (pathDiff !== 0) return pathDiff;
        return a.line - b.line;
      })
      .slice(0, this.config.review.maxComments);

    const avgScore =
      scoredFiles > 0 ? Math.round(totalScore / scoredFiles) : 75;

    // Deduct for issues found
    const criticalCount = allComments.filter(
      (c) => c.severity === "critical"
    ).length;
    const warningCount = allComments.filter(
      (c) => c.severity === "warning"
    ).length;
    const finalScore = Math.max(
      0,
      Math.min(100, avgScore - criticalCount * 10 - warningCount * 3)
    );

    const summary = buildReviewSummary(sortedComments, filteredDiffs.length);

    core.info(
      `Review complete: score=${finalScore}, comments=${sortedComments.length}/${allComments.length}`
    );

    return {
      comments: sortedComments,
      score: finalScore,
      summary,
      breakdown,
    };
  }
}

function buildReviewSummary(
  comments: ReviewComment[],
  filesReviewed: number
): string {
  if (comments.length === 0) {
    return `Reviewed ${filesReviewed} files. No issues found. Clean code!`;
  }

  const criticalCount = comments.filter((c) => c.severity === "critical").length;
  const warningCount = comments.filter((c) => c.severity === "warning").length;
  const infoCount = comments.filter((c) => c.severity === "info").length;

  const parts: string[] = [];
  if (criticalCount > 0) {
    parts.push(`${criticalCount} critical issue${criticalCount > 1 ? "s" : ""}`);
  }
  if (warningCount > 0) {
    parts.push(`${warningCount} warning${warningCount > 1 ? "s" : ""}`);
  }
  if (infoCount > 0) {
    parts.push(`${infoCount} suggestion${infoCount > 1 ? "s" : ""}`);
  }

  return `Reviewed ${filesReviewed} files. Found ${parts.join(", ")}.`;
}
