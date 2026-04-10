import * as core from "@actions/core";
import * as fs from "fs";
import * as path from "path";
import { minimatch } from "minimatch";
import { RepoConvention, FileDiff, ReviewAgentConfig } from "./types";
import { getFileLanguage } from "./utils/diff-parser";

const MAX_SAMPLE_FILES = 10;
const MAX_SAMPLE_LINES = 50;

export async function learnRepoConventions(
  workspaceDir: string,
  diffs: FileDiff[],
  config: ReviewAgentConfig
): Promise<RepoConvention[]> {
  if (!config.review.learnConventions) {
    return [];
  }

  const languages = new Set<string>();
  for (const diff of diffs) {
    const lang = getFileLanguage(diff.filename);
    if (lang !== "unknown") {
      languages.add(lang);
    }
  }

  if (config.review.languageHints.length > 0) {
    for (const hint of config.review.languageHints) {
      languages.add(hint);
    }
  }

  const conventions: RepoConvention[] = [];

  for (const language of languages) {
    try {
      const convention = await analyzeLanguageConventions(
        workspaceDir,
        language,
        config
      );
      if (convention) {
        conventions.push(convention);
      }
    } catch (err) {
      core.info(
        `Could not learn conventions for ${language}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return conventions;
}

async function analyzeLanguageConventions(
  workspaceDir: string,
  language: string,
  config: ReviewAgentConfig
): Promise<RepoConvention | null> {
  const extensions = getLanguageExtensions(language);
  if (extensions.length === 0) return null;

  const sampleFiles = findSampleFiles(workspaceDir, extensions, config);
  if (sampleFiles.length === 0) return null;

  const patterns: string[] = [];
  const namingStyles: string[] = [];
  const examples: string[] = [];

  for (const file of sampleFiles.slice(0, MAX_SAMPLE_FILES)) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n").slice(0, MAX_SAMPLE_LINES);

      // Detect naming convention from file name
      const basename = path.basename(file, path.extname(file));
      if (/^[A-Z][a-zA-Z0-9]*$/.test(basename)) {
        namingStyles.push("PascalCase");
      } else if (/^[a-z][a-zA-Z0-9]*$/.test(basename)) {
        namingStyles.push("camelCase");
      } else if (/^[a-z][a-z0-9_]*$/.test(basename)) {
        namingStyles.push("snake_case");
      } else if (/^[a-z][a-z0-9-]*$/.test(basename)) {
        namingStyles.push("kebab-case");
      }

      // Detect patterns from code
      const codeSample = lines.join("\n");
      if (language === "typescript" || language === "javascript") {
        detectJSPatterns(codeSample, patterns, examples);
      } else if (language === "python") {
        detectPythonPatterns(codeSample, patterns, examples);
      } else if (language === "go") {
        detectGoPatterns(codeSample, patterns, examples);
      }
    } catch {
      // Skip unreadable files
    }
  }

  // Pick most common naming style
  const namingStyle = mostFrequent(namingStyles) || "unknown";

  return {
    language,
    patterns: [...new Set(patterns)],
    namingStyle,
    examples: examples.slice(0, 5),
  };
}

function detectJSPatterns(
  code: string,
  patterns: string[],
  examples: string[]
): void {
  if (/import\s+.*\s+from\s+['"]/.test(code)) {
    patterns.push("ES module imports");
    const match = code.match(/import\s+.*\s+from\s+['"][^'"]+['"]/);
    if (match) examples.push(match[0]);
  }
  if (/export\s+(default\s+)?(function|const|class)/.test(code)) {
    patterns.push("ES module exports");
  }
  if (/const\s+\w+\s*=\s*\(/.test(code)) {
    patterns.push("const for function expressions");
  }
  if (/interface\s+\w+/.test(code)) {
    patterns.push("TypeScript interfaces");
  }
  if (/type\s+\w+\s*=/.test(code)) {
    patterns.push("TypeScript type aliases");
  }
  if (/async\s+function|=>\s*async/.test(code)) {
    patterns.push("Async functions");
  }
  if (/describe\(|it\(|test\(/.test(code)) {
    patterns.push("Jest/Vitest test style");
  }
}

function detectPythonPatterns(
  code: string,
  patterns: string[],
  examples: string[]
): void {
  if (/^from\s+\w+\s+import/m.test(code)) {
    patterns.push("from-import style");
    const match = code.match(/from\s+\w+\s+import\s+\w+/);
    if (match) examples.push(match[0]);
  }
  if (/^import\s+\w+/m.test(code)) {
    patterns.push("direct import");
  }
  if (/def\s+\w+\(.*self/.test(code)) {
    patterns.push("Class-based OOP");
  }
  if (/class\s+\w+.*:/m.test(code)) {
    patterns.push("Python classes");
  }
  if (/async\s+def/.test(code)) {
    patterns.push("Async functions");
  }
  if (/^def test_/m.test(code)) {
    patterns.push("pytest style");
  }
  if (/typing\./.test(code)) {
    patterns.push("Type hints");
  }
}

function detectGoPatterns(
  code: string,
  patterns: string[],
  examples: string[]
): void {
  if (/^func\s+\w+/m.test(code)) {
    patterns.push("Go functions");
    const match = code.match(/func\s+\w+\([^)]*\)/);
    if (match) examples.push(match[0]);
  }
  if (/^func\s*\(\w+\s+\*?\w+\)/m.test(code)) {
    patterns.push("Go methods");
  }
  if (/^type\s+\w+\s+struct/m.test(code)) {
    patterns.push("Go structs");
  }
  if (/^type\s+\w+\s+interface/m.test(code)) {
    patterns.push("Go interfaces");
  }
  if (/^import\s*\(/m.test(code)) {
    patterns.push("Grouped imports");
  }
  if (/func\s+Test\w+/.test(code)) {
    patterns.push("Go test functions");
  }
}

function findSampleFiles(
  dir: string,
  extensions: string[],
  config: ReviewAgentConfig
): string[] {
  const results: string[] = [];

  function walk(currentDir: string, depth: number): void {
    if (depth > 3 || results.length >= MAX_SAMPLE_FILES) return;

    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= MAX_SAMPLE_FILES) break;
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          if (
            !entry.name.startsWith(".") &&
            entry.name !== "node_modules" &&
            entry.name !== "vendor" &&
            entry.name !== "dist"
          ) {
            walk(fullPath, depth + 1);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            // Check against ignore patterns
            const relativePath = path.relative(dir, fullPath).replace(/\\/g, "/");
            let ignored = false;
            for (const pattern of config.ignore.paths) {
              if (minimatch(relativePath, pattern)) {
                ignored = true;
                break;
              }
            }
            if (!ignored) {
              results.push(fullPath);
            }
          }
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  walk(dir, 0);
  return results;
}

function getLanguageExtensions(language: string): string[] {
  const map: Record<string, string[]> = {
    typescript: [".ts", ".tsx"],
    javascript: [".js", ".jsx"],
    python: [".py"],
    go: [".go"],
    rust: [".rs"],
    java: [".java"],
    kotlin: [".kt"],
    csharp: [".cs"],
    cpp: [".cpp", ".hpp", ".cc"],
    c: [".c", ".h"],
    ruby: [".rb"],
    php: [".php"],
    swift: [".swift"],
    scala: [".scala"],
    dart: [".dart"],
  };
  return map[language] || [];
}

function mostFrequent(arr: string[]): string | null {
  if (arr.length === 0) return null;
  const counts = new Map<string, number>();
  for (const item of arr) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  let maxCount = 0;
  let result: string | null = null;
  for (const [item, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      result = item;
    }
  }
  return result;
}
