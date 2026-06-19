# Output Styles

Defines the available output formats for reviewer agents. The Tech Lead injects
the active style block into each reviewer's task prompt when `--style` is passed.
Default (no `--style`) uses the standard format defined in `reviewer-task.md`.

---

## Style: `coderabbit`

Activated with `--style coderabbit` on `/ocr-review`.

When this style is active, **replace** the `### Output Format` section from
`reviewer-task.md` with the format below.

---

### CodeRabbit Output Format

Structure your entire review output as follows:

```markdown
# {Reviewer Name} Review

## Walkthrough

{1–2 sentence plain-English description of what the diff changes at a high level.
No jargon. Write it so a non-author engineer can orient instantly.}

## Changed Files

| File | Summary |
|------|---------|
| `path/to/file.ts` | {one-line description of what changed in this file} |
| `path/to/other.ts` | {one-line description} |

---

## Findings

{Group findings by file. For each file with findings, write a `###` heading with
the file path, then one GitHub-flavored alert block per finding.}

### `path/to/file.ts`

> [!CAUTION]
> **Line {N}** — `[issue]` {Short title}
> **Severity**: Critical
>
> {Description of the problem and its impact. Be specific about the attack vector
> or failure mode. 2–4 sentences max.}
>
> ```suggestion
> {corrected code snippet — only the changed lines, no surrounding boilerplate}
> ```

> [!WARNING]
> **Lines {N}–{M}** — `[issue]` {Short title}
> **Severity**: High
>
> {Description.}
>
> ```suggestion
> {fix}
> ```

> [!TIP]
> **Line {N}** — `[suggestion]` {Short title}
> **Severity**: Medium
>
> {Description of the improvement and why it's better.}
>
> ```suggestion
> {improved code}
> ```

> [!NOTE]
> **Line {N}** — `[nitpick]` {Short title}
> **Severity**: Low
>
> {Minor style or naming observation. One sentence.}

### `path/to/other.ts`

{findings for this file…}

---

## Nitpicks

{Collect all `[nitpick]`-level style/naming issues that don't warrant their own
alert block here as a simple bullet list, to avoid cluttering the findings section.}

- `path/to/file.ts:42` — {observation} — @{your reviewer type}
- `path/to/file.ts:67` — {observation}

---

## What's Working Well

- {Positive observation 1}
- {Positive observation 2}

---

## Clarifying Questions

- {Question about intent or scope}
```

---

### Alert Level → Severity → Category Mapping

| Alert | Severity | Category | Use for |
|-------|----------|----------|---------|
| `[!CAUTION]` | **Critical** | `[issue]` | Security vulnerabilities, data loss, production breakage — must fix before merge |
| `[!WARNING]` | **High** | `[issue]` | Significant bugs, missing validation, broken error handling — strongly fix before merge |
| `[!TIP]` | **Medium** | `[suggestion]` | Improvements: better patterns, refactors, non-critical gaps — take it or leave it |
| `[!NOTE]` | **Low / Info** | `[nitpick]` | Style, naming, minor readability, documentation — purely optional |
| `[!IMPORTANT]` | — | `[praise]` | Particularly clean or clever code worth calling out positively |

> **Severity is always explicit**: every alert block must include a `**Severity**: {level}` line
> immediately after the title line. This preserves the OCR severity vocabulary
> (Critical / High / Medium / Low / Info) alongside the CodeRabbit alert visual.

---

### CodeRabbit Style Rules

1. **File-grouped findings** — all findings for the same file appear under one `###` heading. Never interleave files.

2. **`suggestion` code blocks** — use ` ```suggestion ` (not ` ```ts ` or ` ```js `) for inline fix proposals. GitHub renders these as one-click apply diffs.

3. **Line references in headings** — always include `**Line N**` or `**Lines N–M**` at the start of each alert. No vague "somewhere in this function."

4. **Nitpicks go to the Nitpicks section** — do not clutter the main Findings section with style/naming observations. Collect them all at the bottom.

5. **Walkthrough is non-negotiable** — every review must open with a Walkthrough, even for tiny diffs. It orients the reader before they see any findings.

6. **No role/meta preamble** — do NOT write "As a Security Engineer, I reviewed..." Just start with `## Walkthrough`.

7. **Concise alert bodies** — each alert body is 2–4 sentences max. Longer explanations belong in the suggestion code block or a follow-up bullet.

8. **`[issue]` vs `[suggestion]`** — use `[issue]` only when there is a concrete defect or risk. Stylistic preferences, even strong ones, are `[suggestion]` or `[nitpick]`.
