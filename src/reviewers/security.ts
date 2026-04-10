import * as core from "@actions/core";
import { FileDiff, ReviewAgentConfig, ReviewComment, Severity } from "../types";
import { getChangedLines } from "../utils/diff-parser";

interface SecurityPattern {
  name: string;
  pattern: RegExp;
  message: string;
  severity: Severity;
  owasp?: string;
}

const SECURITY_PATTERNS: SecurityPattern[] = [
  {
    name: "sql-injection",
    pattern:
      /(?:query|execute|raw)\s*\(\s*(?:['"`]|`[^`]*`|\+|f["']|template)/i,
    message:
      "Potential SQL injection: avoid string concatenation or interpolation in queries. Use parameterized queries instead.",
    severity: "critical",
    owasp: "A03:2021-Injection",
  },
  {
    name: "sql-string-concat",
    pattern:
      /['"`]SELECT\s+.*['"`]\s*\+/i,
    message:
      "SQL query built with string concatenation. Use parameterized queries to prevent SQL injection.",
    severity: "critical",
    owasp: "A03:2021-Injection",
  },
  {
    name: "eval-usage",
    pattern: /(?:eval|Function)\s*\(/,
    message:
      'Avoid eval() and Function() constructors — they enable arbitrary code execution. Use safer alternatives.',
    severity: "critical",
    owasp: "A03:2021-Injection",
  },
  {
    name: "hardcoded-secret",
    pattern:
      /(?:password|passwd|secret|api[_-]?key|apikey|token|auth)\s*[:=]\s*['"][^'"]{6,}['"]/i,
    message:
      "Hardcoded secret detected. Move this to an environment variable or secret manager.",
    severity: "critical",
    owasp: "A07:2021-Identification and Authentication Failures",
  },
  {
    name: "unsafe-innerhtml",
    pattern: /\.innerHTML\s*=/,
    message:
      "Direct innerHTML assignment can lead to XSS. Use textContent or a sanitization library.",
    severity: "critical",
    owasp: "A03:2021-Injection",
  },
  {
    name: "dangerouslySetInnerHTML",
    pattern: /dangerouslySetInnerHTML/,
    message:
      "dangerouslySetInnerHTML bypasses React's XSS protection. Ensure the content is sanitized.",
    severity: "warning",
    owasp: "A03:2021-Injection",
  },
  {
    name: "unsafe-redirect",
    pattern:
      /(?:redirect|res\.redirect|location\.href|location\.replace)\s*\(\s*(?:req\.|request\.|params|query)/i,
    message:
      "Potential open redirect. Validate and whitelist redirect targets.",
    severity: "critical",
    owasp: "A01:2021-Broken Access Control",
  },
  {
    name: "cors-wildcard",
    pattern: /Access-Control-Allow-Origin['"]\s*:\s*['"]\*['"]/,
    message:
      "CORS wildcard origin allows any site to access this resource. Restrict to known origins.",
    severity: "warning",
    owasp: "A05:2021-Security Misconfiguration",
  },
  {
    name: "disabled-auth",
    pattern: /(?:@Public|@AllowAnonymous|skipAuth|auth:\s*false|requireAuth:\s*false)/i,
    message:
      "Authentication/authorization check is disabled. Ensure this endpoint is intentionally public.",
    severity: "warning",
    owasp: "A07:2021-Identification and Authentication Failures",
  },
  {
    name: "weak-crypto",
    pattern:
      /(?:md5|sha1|des|rc4|bcrypt\s*\(\s*\d{1,2}\s*,)/i,
    message:
      "Weak cryptographic algorithm detected. Use SHA-256+, bcrypt(12+), or argon2id.",
    severity: "warning",
    owasp: "A02:2021-Cryptographic Failures",
  },
  {
    name: "console-log-sensitive",
    pattern:
      /console\.(log|info|debug)\(.*(?:password|token|secret|api[_-]?key|credential)/i,
    message:
      "Avoid logging sensitive data. This could expose secrets in log output.",
    severity: "critical",
    owasp: "A09:2021-Security Logging and Monitoring Failures",
  },
  {
    name: "no-https",
    pattern: /fetch\s*\(\s*['"]http:\/\//,
    message:
      "Use HTTPS instead of HTTP for external requests to prevent MITM attacks.",
    severity: "warning",
    owasp: "A02:2021-Cryptographic Failures",
  },
  {
    name: "exec-spawn",
    pattern: /(?:exec|execSync|spawn|spawnSync)\s*\(\s*(?:['"`]|\+|`)/,
    message:
      "Potential command injection via exec/spawn. Validate and sanitize all inputs, prefer execFile with args array.",
    severity: "critical",
    owasp: "A03:2021-Injection",
  },
  {
    name: "unhandled-errors",
    pattern: /catch\s*\(\s*\w+\s*\)\s*\{\s*\}/,
    message:
      "Empty catch block silently swallows errors. At minimum, log the error.",
    severity: "warning",
    owasp: "A09:2021-Security Logging and Monitoring Failures",
  },
  {
    name: "todo-security",
    pattern: /(?:TODO|FIXME|HACK|XXX).*(?:security|auth|password|encrypt)/i,
    message:
      "Security-related TODO comment found. Address before merging.",
    severity: "warning",
    owasp: "A09:2021-Security Logging and Monitoring Failures",
  },
];

export function scanForSecurityIssues(
  diff: FileDiff,
  config: ReviewAgentConfig
): ReviewComment[] {
  const comments: ReviewComment[] = [];
  const changedLines = getChangedLines(diff.patch);

  for (const [lineNum, lineContent] of changedLines) {
    for (const pattern of SECURITY_PATTERNS) {
      if (pattern.pattern.test(lineContent)) {
        if (!severityMeetsThreshold(pattern.severity, config.review.severity)) {
          continue;
        }

        const body = pattern.owasp
          ? `${pattern.message}\n\n**OWASP:** ${pattern.owasp}`
          : pattern.message;

        comments.push({
          path: diff.filename,
          line: lineNum,
          side: "RIGHT",
          severity: pattern.severity,
          category: "security",
          body: body,
        });
      }
    }
  }

  // Apply custom rules
  for (const rule of config.rules) {
    if (rule.category !== "security") continue;
    try {
      const regex = new RegExp(rule.pattern, "gi");
      for (const [lineNum, lineContent] of changedLines) {
        if (regex.test(lineContent)) {
          comments.push({
            path: diff.filename,
            line: lineNum,
            side: "RIGHT",
            severity: rule.severity,
            category: "security",
            body: rule.message,
          });
        }
      }
    } catch (err) {
      core.warning(
        `Invalid custom rule pattern "${rule.pattern}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return comments;
}

function severityMeetsThreshold(
  severity: Severity,
  threshold: Severity
): boolean {
  const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  return order[severity] <= order[threshold];
}
