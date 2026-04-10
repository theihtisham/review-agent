import * as core from "@actions/core";
import * as github from "@actions/github";
import {
  GitHubPRContext,
  FileDiff,
  ReviewResult,
  ReviewType,
} from "./types";
import { formatCommentBody, buildSummaryComment } from "./utils/security";
import { RateLimiter, RetryHandler } from "./utils/rate-limiter";

const apiLimiter = new RateLimiter(5, 300);

export class GitHubClient {
  private octokit: ReturnType<typeof github.getOctokit>;
  private context: GitHubPRContext;

  constructor(token: string) {
    this.octokit = github.getOctokit(token);
    const ctx = github.context;

    if (!ctx.payload.pull_request) {
      throw new Error(
        "This action can only be run on pull_request events. No pull_request in payload."
      );
    }

    this.context = {
      owner: ctx.repo.owner,
      repo: ctx.repo.repo,
      pullNumber: ctx.payload.pull_request.number,
      commitId:
        ctx.payload.pull_request.head?.sha ||
        ctx.payload.after ||
        "",
    };

    core.info(
      `GitHub context: ${this.context.owner}/${this.context.repo}#${this.context.pullNumber} @ ${this.context.commitId.substring(0, 7)}`
    );
  }

  getContext(): GitHubPRContext {
    return { ...this.context };
  }

  async getDiff(): Promise<FileDiff[]> {
    await apiLimiter.acquire();
    try {
      return await RetryHandler.withRetry(async () => {
        const response = await this.octokit.rest.pulls.listFiles({
          owner: this.context.owner,
          repo: this.context.repo,
          pull_number: this.context.pullNumber,
        });

        return response.data
          .filter((file) => file.patch)
          .map((file) => ({
            filename: file.filename,
            patch: file.patch || "",
            additions: file.additions,
            deletions: file.deletions,
            changeType: file.status,
          }));
      }, 2, 1000);
    } finally {
      apiLimiter.release();
    }
  }

  async getFileContent(path: string, ref?: string): Promise<string | null> {
    await apiLimiter.acquire();
    try {
      return await RetryHandler.withRetry(async () => {
        try {
          const response = await this.octokit.rest.repos.getContent({
            owner: this.context.owner,
            repo: this.context.repo,
            path,
            ref: ref || this.context.commitId,
          });

          if ("content" in response.data && response.data.content) {
            return Buffer.from(response.data.content, "base64").toString(
              "utf-8"
            );
          }
          return null;
        } catch (err: unknown) {
          if (
            err instanceof Error &&
            "status" in err &&
            (err as { status: number }).status === 404
          ) {
            return null;
          }
          throw err;
        }
      }, 1, 500);
    } finally {
      apiLimiter.release();
    }
  }

  async postReview(
    result: ReviewResult,
    reviewType: ReviewType,
    filesReviewed: number
  ): Promise<{ reviewId: number; commentsPosted: number }> {
    const event = reviewType === "request-changes" ? "REQUEST_CHANGES" :
                  reviewType === "approve" ? "APPROVE" : "COMMENT";

    const body = buildSummaryComment(
      result.score,
      result.breakdown,
      result.summary,
      filesReviewed,
      result.comments.length
    );

    const reviewComments = result.comments.map((c) => ({
      path: c.path,
      line: c.line,
      side: c.side as "LEFT" | "RIGHT",
      body: formatCommentBody(c.body, c.severity, c.category),
      ...(c.startLine ? { start_line: c.startLine, start_side: c.side as "LEFT" | "RIGHT" } : {}),
    }));

    await apiLimiter.acquire();
    try {
      core.info(`Posting review with ${reviewComments.length} comments (event: ${event})`);

      const response = await RetryHandler.withRetry(
        () =>
          this.octokit.rest.pulls.createReview({
            owner: this.context.owner,
            repo: this.context.repo,
            pull_number: this.context.pullNumber,
            commit_id: this.context.commitId,
            body,
            event,
            comments: reviewComments,
          }),
        2,
        2000
      );

      const reviewId = response.data.id;

      core.info(`Review posted: ID=${reviewId}, comments=${reviewComments.length}`);
      return { reviewId, commentsPosted: reviewComments.length };
    } finally {
      apiLimiter.release();
    }
  }

  async postFallbackComment(result: ReviewResult, filesReviewed: number): Promise<void> {
    const body = buildSummaryComment(
      result.score,
      result.breakdown,
      result.summary,
      filesReviewed,
      result.comments.length
    );

    await apiLimiter.acquire();
    try {
      await this.octokit.rest.issues.createComment({
        owner: this.context.owner,
        repo: this.context.repo,
        issue_number: this.context.pullNumber,
        body,
      });
      core.info("Fallback summary comment posted");
    } finally {
      apiLimiter.release();
    }
  }
}
