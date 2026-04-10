import * as minimatch from "minimatch";
import { FileDiff, ReviewAgentConfig } from "../types";

interface ParsedHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export function parsePatch(patch: string): ParsedHunk[] {
  if (!patch) return [];

  const hunks: ParsedHunk[] = [];
  const lines = patch.split("\n");
  let currentHunk: ParsedHunk | null = null;

  for (const line of lines) {
    const hunkMatch = line.match(
      /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/
    );
    if (hunkMatch) {
      if (currentHunk) {
        hunks.push(currentHunk);
      }
      currentHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        oldLines: parseInt(hunkMatch[2] || "1", 10),
        newStart: parseInt(hunkMatch[3], 10),
        newLines: parseInt(hunkMatch[4] || "1", 10),
        lines: [],
      };
    } else if (currentHunk) {
      currentHunk.lines.push(line);
    }
  }

  if (currentHunk) {
    hunks.push(currentHunk);
  }

  return hunks;
}

export function getChangedLines(patch: string): Map<number, string> {
  const changedLines = new Map<number, string>();
  const hunks = parsePatch(patch);

  for (const hunk of hunks) {
    let currentLine = hunk.newStart;

    for (const line of hunk.lines) {
      if (line.startsWith("+")) {
        changedLines.set(currentLine, line.substring(1));
        currentLine++;
      } else if (line.startsWith("-")) {
        // Removed line - do not advance new line counter
      } else {
        currentLine++;
      }
    }
  }

  return changedLines;
}

export function shouldIgnoreFile(
  filename: string,
  config: ReviewAgentConfig
): boolean {
  const ext = filename.substring(filename.lastIndexOf("."));
  if (config.ignore.extensions.includes(ext.toLowerCase())) {
    return true;
  }

  for (const pattern of config.ignore.paths) {
    if (minimatch.minimatch(filename, pattern)) {
      return true;
    }
  }

  const generatedPatterns = [
    /\.generated\./,
    /\.min\./,
    /\/__generated__\//,
    /\.pb\.go$/,
    /\.graphql\.generated\./,
  ];
  for (const pattern of generatedPatterns) {
    if (pattern.test(filename)) {
      return true;
    }
  }

  return false;
}

export function getFileLanguage(filename: string): string {
  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
  const langMap: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".py": "python",
    ".rb": "ruby",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".kt": "kotlin",
    ".cs": "csharp",
    ".cpp": "cpp",
    ".c": "c",
    ".h": "c",
    ".hpp": "cpp",
    ".php": "php",
    ".swift": "swift",
    ".scala": "scala",
    ".sh": "bash",
    ".bash": "bash",
    ".zsh": "zsh",
    ".ps1": "powershell",
    ".sql": "sql",
    ".html": "html",
    ".css": "css",
    ".scss": "scss",
    ".less": "less",
    ".vue": "vue",
    ".svelte": "svelte",
    ".dart": "dart",
    ".lua": "lua",
    ".r": "r",
    ".R": "r",
    ".m": "objc",
    ".mm": "objc",
    ".ex": "elixir",
    ".exs": "elixir",
    ".erl": "erlang",
    ".hs": "haskell",
    ".ml": "ocaml",
    ".clj": "clojure",
    ".lisp": "lisp",
    ".tf": "terraform",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".json": "json",
    ".xml": "xml",
    ".toml": "toml",
    ".dockerfile": "dockerfile",
  };

  if (filename.endsWith("Dockerfile")) return "dockerfile";
  if (filename.endsWith("Makefile")) return "makefile";

  return langMap[ext] || "unknown";
}

export function formatDiffForReview(diff: FileDiff): string {
  const lines: string[] = [];
  const hunks = parsePatch(diff.patch);

  lines.push(`File: ${diff.filename} (${diff.changeType}, +${diff.additions}/-${diff.deletions})`);
  lines.push("---");

  for (const hunk of hunks) {
    lines.push(
      `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`
    );
    for (const line of hunk.lines) {
      lines.push(line);
    }
    lines.push("");
  }

  return lines.join("\n");
}
