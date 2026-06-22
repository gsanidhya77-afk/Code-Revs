---
description: Address code review feedback — select findings, corroborate, implement changes from a review's final.md, and commit on the same branch.
name: "OCR: Address Feedback"
category: Code Review
tags: [ocr, address, feedback, review, commit]
---

**Usage**
```
/ocr-address [path-to-final.md] [--items <selection>] [--no-commit]
```

**Arguments**
- `path-to-final.md` (optional): Explicit path to a `final.md` review document. If omitted, auto-detects the current session's latest round `final.md`.
- `--items <selection>` (optional): Which findings to address. Accepts:
  - `all` — address every valid finding (default when flag is omitted)
  - `blockers` — address only blocker-severity findings
  - `should-fix` — address only should-fix findings
  - `suggestions` — address only suggestion findings
  - `1,3,5` — address specific finding numbers (comma-separated)
  - `1-4` — address a range of finding numbers
  - `1-3,7` — mixed range and list
- `--no-commit` (optional): Skip the automatic git commit after fixes are applied.

**Examples**
```
/ocr-address                                                              # Auto-detect, show selection list, commit after
/ocr-address --items blockers                                             # Fix all blockers, auto-commit
/ocr-address --items 1,3,5                                                # Fix findings #1, #3, #5, auto-commit
/ocr-address --items 1-4,7 --no-commit                                    # Fix findings #1–4 and #7, skip commit
/ocr-address .ocr/sessions/2026-03-06-feat-auth/rounds/round-1/final.md  # Explicit path
```

**Guardrails**

- You are a distinguished software engineer with deep understanding of software architecture and design patterns.
- Think step by step — favor composition, clear boundaries, minimal scope, and root-cause fixes.
- Verify every assumption by reading actual code; never guess at behavior.
- Do NOT blindly accept every piece of feedback. Use your expertise to corroborate each point against the actual implementation before acting.
- If feedback is incorrect or based on a misunderstanding of the code, say so clearly with evidence.
- If feedback is valid but the suggested fix is suboptimal, propose a better alternative.
- Direct cutover rewrites only — remove all deprecated/dead/unused code; leave nothing behind.

---

## Steps

### 1. Resolve Inputs

Determine the `final.md` to address:

1. If the user provided an explicit file path, use it directly.
2. If no path is provided, auto-detect the current session:
   ```bash
   ocr state show
   ```
   Parse the output to find the session directory and current round, then construct the path:
   ```
   .ocr/sessions/{session-id}/rounds/round-{N}/final.md
   ```
3. Read the `final.md` file in its entirety.
4. If the file does not exist or cannot be found, stop and inform the user.

Also read any available OCR session context for project awareness:
- `.ocr/sessions/{session-id}/discovered-standards.md` — project standards
- `.ocr/sessions/{session-id}/context.md` — change analysis and Tech Lead guidance

Store the resolved `SESSION_ID` and `ROUND_NUMBER` for use in the commit step.

---

### 2. Parse and Catalog Findings

Break the review into discrete, numbered, actionable feedback items.

For each item, record:
- **Number** (assigned sequentially: 1, 2, 3 …)
- The feedback point (what the reviewer is saying)
- The file(s) and line(s) referenced (if any)
- **Category**: `blocker` | `should-fix` | `suggestion`
- Severity/type: blocker, should-fix, suggestion, nitpick, architecture, performance, security, etc.
- The originating reviewer persona (if identifiable)

---

### 3. Present Findings for Selection

Present a numbered summary table of **all** findings to the user:

```
#  | Category    | File                        | Title
---|-------------|-----------------------------|-----------------------------------------
1  | blocker     | src/auth/token.ts:42        | JWT secret read from process.env without fallback
2  | blocker     | src/db/query.ts:87          | Raw SQL string interpolation (injection risk)
3  | should-fix  | src/api/users.ts:120        | Missing input validation on email field
4  | should-fix  | src/utils/cache.ts:34       | Cache TTL hardcoded — should come from config
5  | suggestion  | src/models/user.ts:15       | Extract interface to shared types file
6  | suggestion  | src/auth/session.ts:78      | Consider using crypto.timingSafeEqual
```

**If `--items` was NOT provided**, ask:
```
Which findings would you like to address?
  → Enter numbers (e.g. 1,3,5), a range (e.g. 1-4), a category (blockers / should-fix / suggestions), or "all"
```

Wait for the user's response and parse it to produce the **selected set** of finding numbers.

**If `--items` was provided**, resolve it immediately:
- `all` → every finding number
- `blockers` → all findings where category = `blocker`
- `should-fix` → all findings where category = `should-fix`
- `suggestions` → all findings where category = `suggestion`
- `1,3,5` → findings 1, 3, 5
- `1-4` → findings 1, 2, 3, 4
- `1-3,7` → findings 1, 2, 3, 7

Confirm the resolved selection before proceeding:
```
Selected: findings 1, 2, 3 (2 blockers, 1 should-fix)
Proceeding to corroborate and fix…
```

---

### 4. Gather Implementation Context

- Read ALL files referenced by the **selected** findings.
- Read any additional files needed to understand the surrounding context (callers, consumers, types, tests).
- Read project standards from `discovered-standards.md` if available.
- **DO NOT skip any referenced files** — thorough context is critical for accurate corroboration.

---

### 5. Corroborate and Validate Selected Findings

For each finding in the selected set:

- **Read the actual code** at the referenced location.
- **Assess validity**: Is the feedback accurate? Does the code actually exhibit the issue described?
- **Classify** each item as one of:
  - **Valid — Will Address**: Feedback is correct and should be implemented.
  - **Valid — Alternative Approach**: Feedback identifies a real issue but the suggested fix is suboptimal; propose a better solution.
  - **Invalid — Respectfully Decline**: Feedback is based on a misunderstanding or is incorrect; explain why with code evidence.
  - **Needs Clarification**: Feedback is ambiguous or requires more context to evaluate.

Present the corroboration results as a summary table, then **immediately proceed** to Step 6. Do NOT wait for user acknowledgment — this workflow runs autonomously.

---

### 6. Address Feedback

For all items classified as **Valid — Will Address** or **Valid — Alternative Approach**:

- **Spawn sub-agents in parallel** for independent feedback items. Group items that touch the same files or have logical dependencies, and assign independent groups to separate sub-agents.
- Each sub-agent should:
  - Implement changes following project coding standards and existing patterns
  - Ensure every change is minimal, focused, and does not introduce regressions
  - For **Alternative Approach** items, implement the better solution proposed in Step 5
- After all sub-agents complete, review the combined changes for consistency and conflicts.

---

### 7. Report and Verify

**Report** a completion summary:
- Total findings selected
- Findings addressed (with brief description of each change)
- Findings declined (with reasoning)
- Findings needing clarification (if any)

**Verify** correctness by running project checks:
```bash
# Run type-checking (adapt to project toolchain)
npx tsc --noEmit

# Run tests (adapt to project toolchain)
npm test
```

If verification fails, fix the issues before proceeding to the commit step.

---

### 8. Commit Changes

> Skip this step entirely if `--no-commit` was passed.

After all fixes are applied and verified, commit **only the files that were actually modified** to the current branch.

**8a. Identify modified files**

Collect the exact set of files changed during Step 6. Do NOT use `git add -A` — only stage files that this address run touched.

```bash
# List files modified by the fixes (from sub-agent reports or git status)
git diff --name-only
git status --short
```

Cross-reference with the files mentioned in the addressed findings. Stage only those:

```bash
git add path/to/file1.ts path/to/file2.ts ...
```

**8b. Build the commit message**

Use this format:
```
fix(review): address {N} findings from OCR session {SESSION_ID}

Round {ROUND_NUMBER} — items addressed:
{for each addressed finding}
- [{number}] {title} ({file_path})
{end for}

{if any findings were declined}
Skipped (invalid/declined):
{for each declined finding}
- [{number}] {title} — {one-line reason}
{end for}
{end if}

Reviewed by: Open Code Review
```

Example:
```
fix(review): address 3 findings from OCR session 2026-06-21-feat-auth

Round 1 — items addressed:
- [1] JWT secret read from process.env without fallback (src/auth/token.ts)
- [2] Raw SQL string interpolation (src/db/query.ts)
- [3] Missing input validation on email field (src/api/users.ts)

Reviewed by: Open Code Review
```

**8c. Create the commit**

```bash
git commit -m "$(cat <<'EOF'
fix(review): address {N} findings from OCR session {SESSION_ID}

Round {ROUND_NUMBER} — items addressed:
- [1] {title} ({file})
...

Reviewed by: Open Code Review
EOF
)"
```

**8d. Confirm**

Print the commit hash and a summary:
```
Committed: abc1234
Branch: {current-branch}
Files changed: {N}
```

> **Note**: This commit stays local — it is NOT pushed. The user controls when to push to the remote PR.
