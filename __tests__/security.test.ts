import { describe, it, expect } from "vitest";
import { scanForSecurityIssues } from "../src/reviewers/security";
import { FileDiff, ReviewAgentConfig } from "../src/types";

const mockConfig: ReviewAgentConfig = {
  llm: { provider: "openai", apiKey: "test", model: "gpt-4o", baseUrl: "" },
  review: { severity: "info", maxComments: 50, reviewType: "comment", languageHints: [], learnConventions: true },
  ignore: { paths: [], extensions: [] },
  rules: [],
};

function makeDiff(patch: string, filename = "src/code.ts"): FileDiff {
  return {
    filename,
    patch,
    additions: 5,
    deletions: 0,
    changeType: "modified",
  };
}

describe("scanForSecurityIssues", () => {
  it("detects eval() usage", () => {
    const diff = makeDiff(`@@ -1 +1,2 @@
+const result = eval(userInput);`);
    const issues = scanForSecurityIssues(diff, mockConfig);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues.some((i) => i.body.includes("eval()"))).toBe(true);
    expect(issues.some((i) => i.category === "security")).toBe(true);
  });

  it("detects SQL injection patterns", () => {
    const diff = makeDiff(`@@ -1 +1,2 @@
+const query = "SELECT * FROM users WHERE id = " + userId;
+db.query(query);`);
    const issues = scanForSecurityIssues(diff, mockConfig);
    expect(issues.some((i) => i.body.toLowerCase().includes("sql"))).toBe(true);
  });

  it("detects hardcoded secrets", () => {
    const diff = makeDiff(`@@ -1 +1,2 @@
+const password = "my_super_secret_password";`);
    const issues = scanForSecurityIssues(diff, mockConfig);
    expect(issues.some((i) => i.body.includes("Hardcoded secret"))).toBe(true);
    expect(issues.some((i) => i.severity === "critical")).toBe(true);
  });

  it("detects innerHTML assignment", () => {
    const diff = makeDiff(`@@ -1 +1,2 @@
+element.innerHTML = userInput;`);
    const issues = scanForSecurityIssues(diff, mockConfig);
    expect(issues.some((i) => i.body.includes("innerHTML"))).toBe(true);
  });

  it("detects unsafe redirects", () => {
    const diff = makeDiff(`@@ -1 +1,2 @@
+res.redirect(req.query.returnUrl);`);
    const issues = scanForSecurityIssues(diff, mockConfig);
    expect(issues.some((i) => i.body.includes("redirect"))).toBe(true);
  });

  it("detects empty catch blocks", () => {
    const diff = makeDiff(`@@ -1 +1,3 @@
+try { doSomething(); } catch(e) {}`);
    const issues = scanForSecurityIssues(diff, mockConfig);
    expect(issues.some((i) => i.body.includes("Empty catch"))).toBe(true);
  });

  it("detects console.log with sensitive data", () => {
    const diff = makeDiff(`@@ -1 +1,2 @@
+console.log("User token:", user.token);`);
    const issues = scanForSecurityIssues(diff, mockConfig);
    expect(issues.some((i) => i.body.includes("sensitive data"))).toBe(true);
  });

  it("detects exec/spawn with string concatenation", () => {
    const diff = makeDiff(`@@ -1 +1,2 @@
+exec("ls " + userInput);`);
    const issues = scanForSecurityIssues(diff, mockConfig);
    expect(issues.some((i) => i.body.includes("command injection"))).toBe(true);
  });

  it("does not flag clean code", () => {
    const diff = makeDiff(`@@ -1 +1,3 @@
+function add(a: number, b: number): number {
+  return a + b;
+}`);
    const issues = scanForSecurityIssues(diff, mockConfig);
    expect(issues).toEqual([]);
  });

  it("respects severity threshold", () => {
    const strictConfig: ReviewAgentConfig = {
      ...mockConfig,
      review: { ...mockConfig.review, severity: "critical" },
    };
    const diff = makeDiff(`@@ -1 +1,2 @@
+console.log("User token:", user.token);`);
    const issues = scanForSecurityIssues(diff, strictConfig);
    // console.log with sensitive is critical, should still be caught
    expect(issues.some((i) => i.severity === "critical")).toBe(true);
  });

  it("detects HTTP URLs in fetch", () => {
    const diff = makeDiff(`@@ -1 +1,2 @@
+fetch("http://api.example.com/data");`);
    const issues = scanForSecurityIssues(diff, mockConfig);
    expect(issues.some((i) => i.body.includes("HTTPS"))).toBe(true);
  });

  it("applies custom security rules", () => {
    const configWithRules: ReviewAgentConfig = {
      ...mockConfig,
      rules: [
        {
          name: "no-process-env",
          pattern: "process\\.env\\.SECRET",
          message: "Use config module instead of process.env.SECRET",
          severity: "critical",
          category: "security",
        },
      ],
    };
    const diff = makeDiff(`@@ -1 +1,2 @@
+const key = process.env.SECRET;`);
    const issues = scanForSecurityIssues(diff, configWithRules);
    expect(issues.some((i) => i.body.includes("config module"))).toBe(true);
  });

  it("ignores removed lines", () => {
    const diff = makeDiff(`@@ -1,2 +1 @@
-const password = "old_secret";
-const result = eval(oldCode);`);
    const issues = scanForSecurityIssues(diff, mockConfig);
    // Removed lines should not be flagged
    expect(issues).toEqual([]);
  });
});
