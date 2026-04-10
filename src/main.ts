import * as core from "@actions/core";
import { parseActionInputs, buildConfig } from "./config";
import { GitHubClient } from "./github";
import { Reviewer } from "./reviewer";
import { learnRepoConventions } from "./conventions";
import { validateApiKey, sanitizeForLog } from "./utils/security";

async function run(): Promise<void> {
  try {
    core.info("ReviewAgent starting...");

    // 1. Parse and validate inputs
    const inputs = parseActionInputs();
    core.setSecret(inputs.githubToken);
    if (inputs.llmApiKey) {
      core.setSecret(inputs.llmApiKey);
    }

    validateApiKey(inputs.llmApiKey, inputs.llmProvider);

    core.info(`Provider: ${inputs.llmProvider}, Model: ${inputs.llmModel}`);
    core.info(`Severity threshold: ${inputs.severity}, Max comments: ${inputs.maxComments}`);

    // 2. Build config (merge with .reviewagent.yml if present)
    const workspaceDir =
      process.env.GITHUB_WORKSPACE || process.cwd();
    const config = buildConfig(inputs, workspaceDir);

    // 3. Initialize GitHub client and get PR diff
    const githubClient = new GitHubClient(inputs.githubToken);
    const diffs = await githubClient.getDiff();

    if (diffs.length === 0) {
      core.info("No files changed in this PR. Nothing to review.");
      setOutputs(0, "0", 100, "No files to review.");
      return;
    }

    core.info(`Found ${diffs.length} changed files`);

    // 4. Learn repo conventions from existing code
    const conventions = await learnRepoConventions(
      workspaceDir,
      diffs,
      config
    );
    if (conventions.length > 0) {
      core.info(
        `Learned conventions for: ${conventions.map((c) => c.language).join(", ")}`
      );
    }

    // 5. Run the review
    const reviewer = new Reviewer(config);
    const result = await reviewer.review(diffs, conventions);

    // 6. Post the review
    const filesReviewed = diffs.filter(
      (d) => !require("./utils/diff-parser").shouldIgnoreFile(d.filename, config)
    ).length;

    try {
      const { reviewId, commentsPosted } = await githubClient.postReview(
        result,
        config.review.reviewType,
        filesReviewed
      );

      setOutputs(
        reviewId,
        commentsPosted.toString(),
        result.score,
        result.summary
      );
    } catch (postErr) {
      // If inline review fails (e.g., outdated diff), post as issue comment
      core.warning(
        `Inline review failed, posting as comment: ${postErr instanceof Error ? postErr.message : String(postErr)}`
      );
      await githubClient.postFallbackComment(result, filesReviewed);
      setOutputs(0, "0", result.score, result.summary);
    }

    core.info(
      `ReviewAgent complete: score=${result.score}, comments=${result.comments.length}`
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err);
    core.setFailed(`ReviewAgent failed: ${sanitizeForLog(message)}`);
  }
}

function setOutputs(
  reviewId: number,
  commentsPosted: string,
  score: number,
  summary: string
): void {
  core.setOutput("review-id", reviewId.toString());
  core.setOutput("comments-posted", commentsPosted);
  core.setOutput("score", score.toString());
  core.setOutput("summary", summary);
}

run();
