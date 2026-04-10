import { FileDiff } from "../../src/types";

export const SAMPLE_DIFF_SINGLE_FILE: FileDiff = {
  filename: "src/auth.ts",
  patch: `@@ -1,5 +1,12 @@
 import { Request, Response } from 'express';
-import { verifyToken } from './jwt';
+import { verifyToken } from './jwt';
+
+const ADMIN_PASSWORD = "super_secret_123";
+
+function login(req: Request, res: Response) {
+  const query = "SELECT * FROM users WHERE name = '" + req.body.username + "'";
+  db.query(query);
+  if (req.body.password === ADMIN_PASSWORD) {
+    res.redirect(req.query.returnUrl);
   }
+}`,
  additions: 8,
  deletions: 1,
  changeType: "modified",
};

export const SAMPLE_DIFF_MULTI_FILE: FileDiff[] = [
  {
    filename: "src/auth.ts",
    patch: `@@ -1,3 +1,8 @@
+const API_KEY = "sk-1234567890abcdef";
+
+function getUser(id) {
+  return eval("users[" + id + "]");
+}`,
    additions: 5,
    deletions: 0,
    changeType: "added",
  },
  {
    filename: "src/utils.ts",
    patch: `@@ -10,3 +10,5 @@
 export function formatName(name: string): string {
-  return name.trim();
+  // TODO: fix security issue with name handling
+  return name.trim();
 }`,
    additions: 2,
    deletions: 1,
    changeType: "modified",
  },
  {
    filename: "package-lock.json",
    patch: `@@ -1,1 +1,2 @@
+{"locked": true}`,
    additions: 1,
    deletions: 0,
    changeType: "modified",
  },
  {
    filename: "src/styles.css",
    patch: `@@ -1,1 +1,2 @@
+.button { color: red; }`,
    additions: 1,
    deletions: 0,
    changeType: "modified",
  },
];

export const SAMPLE_PATCH_MULTILINE = `@@ -5,10 +5,15 @@
 function processData(data: any) {
-  return data;
+  if (!data) {
+    return null;
+  }
+  console.log("Processing data with password", data.password);
+  const result = eval(data.formula);
+  return result;
 }`;

export const MOCK_LLM_RESPONSE = {
  comments: [
    {
      line: 6,
      severity: "critical" as const,
      category: "security" as const,
      message: "The eval() call allows arbitrary code execution. Never eval user input.",
    },
    {
      line: 5,
      severity: "critical" as const,
      category: "security" as const,
      message: "Avoid logging sensitive data like passwords.",
    },
    {
      line: 3,
      severity: "warning" as const,
      category: "bug" as const,
      message: "Returning null instead of throwing or providing a default may cause downstream errors.",
    },
  ],
  score: 35,
  summary: "Critical security issues found: eval() usage and hardcoded secrets. Score: 35/100",
};

export const MOCK_PR_PAYLOAD = {
  action: "opened",
  number: 42,
  pull_request: {
    number: 42,
    head: {
      sha: "abc123def456789012345678901234567890abcd",
      ref: "feature/review-agent",
    },
    base: {
      ref: "main",
    },
  },
  repository: {
    owner: { login: "testowner" },
    name: "testrepo",
  },
};
