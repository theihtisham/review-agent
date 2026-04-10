# ReviewAgent

**Your senior dev in a GitHub Action — AI reviews every PR with line-by-line comments, catches bugs and security holes before merge.**

[![npm version](https://img.shields.io/npm/v/@theihtisham/review-agent?style=for-the-badge&logo=npm&color=CB3847)](https://www.npmjs.com/package/@theihtisham/review-agent)
[![GitHub Action](https://img.shields.io/badge/GitHub-Action-blue?logo=github)](https://github.com/features/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Vitest](https://img.shields.io/badge/Tested%20with-Vitest-6E9F18?logo=vitest)](https://vitest.dev/)

---

## What It Does

ReviewAgent watches every pull request and automatically posts a **line-by-line code review** using AI. It catches bugs, security vulnerabilities, performance issues, and style violations — then posts them as GitHub review comments on the exact lines that need attention.

### The Review

Every review includes:

| Category | What It Catches |
|----------|----------------|
| **Bugs** | Null/undefined access, off-by-one errors, race conditions, unhandled edge cases, logic errors |
| **Security** | SQL injection, XSS, hardcoded secrets, eval() usage, command injection, OWASP Top 10 |
| **Performance** | N+1 queries, memory leaks, inefficient algorithms, unnecessary re-renders |
| **Style** | Naming, formatting, readability, code organization |
| **Convention** | Violations of your repo's own patterns and naming styles |

### The Output

Each review produces:

- **Line-by-line comments** on the exact lines with issues
- **Severity tags** — critical / warning / info
- **Category labels** — bug / security / performance / style / convention
- **Overall quality score** (0-100)
- **Summary comment** with breakdown table

---

## Demo

Here's what a ReviewAgent review looks like on a real PR:

### PR introduces a login endpoint with security issues:

```typescript
// src/auth.ts
const API_KEY = "sk-1234567890abcdef";

function login(req: Request, res: Response) {
  const query = "SELECT * FROM users WHERE name = '" + req.body.username + "'";
  db.query(query);
  if (req.body.password === ADMIN_PASSWORD) {
    res.redirect(req.query.returnUrl);
  }
}
```

### ReviewAgent posts these inline comments:

> **Line 2** — `[Security] (critical)` Hardcoded secret detected. Move this to an environment variable or secret manager.
> *OWASP: A07:2021-Identification and Authentication Failures*

> **Line 5** — `[Security] (critical)` Potential SQL injection: avoid string concatenation in queries. Use parameterized queries instead.
> *OWASP: A03:2021-Injection*

> **Line 7** — `[Security] (critical)` Potential open redirect. Validate and whitelist redirect targets.
> *OWASP: A01:2021-Broken Access Control*

### And a summary comment:

```
## 🔴 ReviewAgent Code Review Summary

**Score: 25/100** — Poor

Critical security issues found: SQL injection, hardcoded secrets, and open redirect.

| Category | Count |
|----------|-------|
| 🐛 Bug | 1 |
| 🔒 Security | 3 |
| ⚡ Performance | 0 |
| 🎨 Style | 1 |

### Stats
- **Files reviewed:** 3
- **Comments posted:** 5
```

---

## Install

```bash
# npm
npm install @theihtisham/review-agent

# Or use instantly without installing
npx @theihtisham/review-agent
```

## Installation

Add ReviewAgent to any repository in **5 lines of YAML**:

```yaml
# .github/workflows/review.yml
name: AI Code Review
on: [pull_request]
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: reviewagent/review-agent@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          llm-api-key: ${{ secrets.OPENAI_API_KEY }}
```

That's it. Every PR now gets an AI code review.

---

## Configuration

### Action Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `github-token` | *required* | GitHub token for API access (`secrets.GITHUB_TOKEN` or a PAT) |
| `llm-provider` | `openai` | LLM provider: `openai`, `anthropic`, or `ollama` |
| `llm-api-key` | `""` | API key for the LLM (omit for Ollama) |
| `llm-model` | `gpt-4o` | Model name (e.g., `gpt-4o`, `claude-sonnet-4-20250514`, `llama3.1`) |
| `llm-base-url` | auto | Custom API endpoint (required for self-hosted models) |
| `config-path` | `.reviewagent.yml` | Path to config file in the repo |
| `severity` | `warning` | Minimum severity to report: `critical`, `warning`, `info` |
| `max-comments` | `50` | Maximum review comments per PR |
| `review-type` | `comment` | GitHub review type: `approve`, `request-changes`, `comment` |
| `language-hints` | `""` | Comma-separated languages (e.g., `typescript,python`) |
| `learn-conventions` | `true` | Learn repo conventions from existing code |

### Using with OpenAI

```yaml
- uses: reviewagent/review-agent@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    llm-provider: openai
    llm-api-key: ${{ secrets.OPENAI_API_KEY }}
    llm-model: gpt-4o
```

### Using with Anthropic

```yaml
- uses: reviewagent/review-agent@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    llm-provider: anthropic
    llm-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    llm-model: claude-sonnet-4-20250514
```

### Using with Ollama (Free, Self-Hosted)

```yaml
- uses: reviewagent/review-agent@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    llm-provider: ollama
    llm-model: llama3.1
    llm-base-url: http://your-ollama-host:11434/v1
```

No API key needed. Run Ollama on any machine with a GPU and point the action at it.

---

## Custom Rules (`.reviewagent.yml`)

Create a `.reviewagent.yml` file in your repo root to customize ReviewAgent:

```yaml
# .reviewagent.yml

# Custom review rules
rules:
  - name: "no-console-log"
    pattern: "console\\.log"
    message: "Use the logger module instead of console.log"
    severity: warning
    category: convention

  - name: "no-any-type"
    pattern: ":\\s*any\\b"
    message: "Avoid 'any' type. Use a specific type or 'unknown'."
    severity: warning
    category: convention

  - name: "require-error-boundary"
    pattern: "export\\s+default\\s+function\\s+\\w+"
    message: "Top-level components should be wrapped in an ErrorBoundary."
    severity: info
    category: convention

# Additional paths to ignore
ignore:
  paths:
    - "proto/**"
    - "**/*.generated.ts"
  extensions:
    - ".proto"
```

### Rule Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique rule identifier |
| `pattern` | Yes | Regex pattern to match in changed lines |
| `message` | Yes | Message shown in the review comment |
| `severity` | Yes | `critical`, `warning`, or `info` |
| `category` | Yes | `bug`, `security`, `performance`, `style`, or `convention` |

---

## Architecture

```
PR opened/updated
       |
       v
 GitHub Action triggered
       |
       v
 Parse action inputs + .reviewagent.yml
       |
       v
 Fetch PR diff (only changed files)
       |
       v
 Filter out ignored files
 (node_modules, generated, binaries, etc.)
       |
       +--> Static Security Scanner (local, fast)
       |    - 14 OWASP-aware patterns
       |    - Custom regex rules from config
       |
       +--> LLM Deep Review (AI-powered)
       |    - Per-file analysis with diff context
       |    - Repo conventions injected in prompt
       |    - JSON-structured response
       |
       v
 Merge & deduplicate findings
       |
       v
 Sort by severity (critical first)
       |
       v
 Post GitHub Review
 (inline comments + summary + score)
```

### Key Design Decisions

- **Diff-aware**: Only reviews lines that changed. No noise from untouched code.
- **Two-pass review**: Fast static scan for known patterns, then deep LLM analysis for nuanced issues.
- **Convention learning**: Reads your existing codebase to learn naming styles and patterns before reviewing.
- **Rate limiting**: Built-in rate limiter prevents API abuse (configurable concurrency and intervals).
- **Fallback**: If inline review fails (e.g., outdated diff), posts as a regular PR comment.

---

## Security

ReviewAgent takes security seriously:

- **Never logs code content** — all diffs are sanitized before logging
- **API keys via secrets only** — keys are masked in all GitHub Actions output
- **Input validation** — all action inputs are validated before use
- **No data storage** — code is sent to the LLM provider for analysis and not stored
- **Secret redaction** — log sanitizer catches accidental secret leaks in output

### Recommendations

- Use `secrets.GITHUB_TOKEN` (automatic) or a fine-grained PAT with minimal permissions
- Store LLM API keys in GitHub Secrets, never in workflow files
- For self-hosted Ollama, use a private network or VPN

---

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Type check
npm run lint

# Build for production
npm run build

# Full check (lint + test + build)
npm run all
```

### Project Structure

```
11-review-agent/
  src/
    main.ts              # Action entry point
    config.ts            # Input parsing, config building
    types.ts             # TypeScript type definitions
    github.ts            # GitHub API client (reviews, diffs)
    llm-client.ts        # LLM client (OpenAI, Anthropic, Ollama)
    reviewer.ts          # Core review orchestrator
    conventions.ts       # Repo convention learning
    reviewers/
      security.ts        # Static security pattern scanner
    utils/
      diff-parser.ts     # Patch parsing, line extraction
      rate-limiter.ts    # Rate limiting and retry logic
      security.ts        # Sanitization, formatting utilities
  __tests__/
    config.test.ts
    diff-parser.test.ts
    security.test.ts
    rate-limiter.test.ts
    security-utils.test.ts
    llm-client.test.ts
    fixtures/
      mock-data.ts
  action.yml             # GitHub Action definition
  package.json
  tsconfig.json
  vitest.config.ts
  LICENSE
  README.md
```

---

## License

[MIT](LICENSE) — use it however you want.

---

<p align="center">
  <strong>ReviewAgent</strong> — Ship better code, faster.
</p>
