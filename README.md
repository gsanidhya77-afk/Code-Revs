<!--
  The cover banner IS the H1: a real, indexable <h1> element whose accessible /
  scraped name comes from the image alt ("Open Code Review"). This keeps the
  semantic heading for SEO + screen readers + the document outline while removing
  the visually-redundant text line that duplicated the wordmark already in the
  cover. (GitHub strips inline `style`, so a CSS-hidden <h1> is not an option —
  wrapping the banner in the heading is the GitHub-valid equivalent.)
-->
<h1 align="center">
  <img src="assets/OCR-Github-Cover.png" alt="Open Code Review" width="100%" />
</h1>

<p align="center">
  <strong>Customizable multi-agent code review for AI-assisted development</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@open-code-review/cli"><img src="https://img.shields.io/npm/v/@open-code-review/cli.svg" alt="npm version"></a>
  <a href="https://github.com/spencermarx/open-code-review/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License"></a>
</p>

---

## Quick Start

**Prerequisites:** Node.js >= 22.5, Git, and an [AI coding assistant](#supported-ai-tools).

```bash
# 1. Install the CLI globally
npm install -g @open-code-review/cli

# 2. Initialize OCR in your project
cd your-project
ocr init

# 3. Launch the dashboard and run your first review
ocr dashboard
```

Your browser will open the OCR dashboard — you're ready to run your first review.

> **Any package manager works.** From **v2.1** OCR uses Node's built-in SQLite (`node:sqlite`) — there's
> no native module to compile, so `npm i -g`, `pnpm add -g`, and `yarn global add` all install cleanly
> (including under pnpm 10+, which blocks dependency build scripts). It just needs **Node >= 22.5**.

`ocr init` detects your installed AI tools (Claude Code, Cursor, Windsurf, and [11 more](#supported-ai-tools)) and configures each one automatically. Then open the dashboard to run a review, browse results, and manage your workflow from the browser.

Or run reviews directly from your AI coding assistant:

```
/ocr:review                                    # Claude Code / Cursor
/ocr-review                                    # Windsurf / other tools
/ocr-review Review against openspec/spec.md    # With requirements
```

---

## Why Open Code Review?

When you ask an AI to "review my code," you get a single perspective — one pass, one set of priorities. OCR changes that fundamentally:

- **Multi-agent redundancy** — Multiple reviewer instances examine your code independently. Different attention patterns catch different issues. What one reviewer misses, another finds.
- **Discourse before synthesis** — Reviewers don't just produce findings — they debate them. They challenge assumptions, validate concerns, and surface questions no single reviewer would ask.
- **Fully customizable teams** — Pick from 28 reviewer personas (including famous engineers like Martin Fowler, Kent Beck, and Sandi Metz), create your own persistent reviewers, or describe ephemeral one-off reviewers inline.
- **Requirements-aware** — Pass in a spec, proposal, or acceptance criteria. Every reviewer evaluates the code against your stated requirements, not just general best practices.
- **Project context** — OCR discovers your standards from `CLAUDE.md`, `.cursorrules`, OpenSpec configs, and other common patterns. Reviewers apply *your* conventions.
- **Closes the loop automatically** — The Author Agent reads the finished review, corroborates each finding against actual code, implements the valid ones in parallel sub-agents, and commits the fixes to your branch — all without copy-pasting a single finding into a chat window.
- **Trigger from Slack** — @mention the bot with a PR URL in any channel. It runs the full review in the background, DMs you when it's done, and posts the result directly to the GitHub PR — no dashboard access required.

```
                    ┌─────────────┐
                    │  Tech Lead  │  ← Orchestrates the review
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
│   Your Team     │ │  Your Team  │ │   Your Team     │
│   Composition   │ │  Composition│ │   Composition   │
└─────────────────┘ └─────────────┘ └─────────────────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           │
                    ┌──────▼──────┐
                    │  Discourse  │  ← Reviewers debate findings
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Synthesis  │  ← Unified, prioritized feedback
                    └─────────────┘
```

> **Note**: OCR does not replace human code review. The goal is to reduce the burden on human reviewers by catching issues earlier — so human review is faster and more focused on things machines can't catch.

---

## Table of Contents

- [The Dashboard](#the-dashboard)
- [IDE & CLI Workflows](#ide--cli-workflows)
- [Features](#features)
  - [Multi-Agent Review](#multi-agent-review)
  - [Multi-Model Teams](#multi-model-teams)
  - [Code Review Maps](#code-review-maps)
  - [Requirements-Aware Review](#requirements-aware-review)
  - [Reviewer Discourse](#reviewer-discourse)
  - [GitHub PR Posting](#github-pr-posting)
  - [Multi-Round Reviews](#multi-round-reviews)
  - [Custom Reviewers](#custom-reviewers)
  - [Famous Engineer Personas](#famous-engineer-personas)
  - [Ephemeral Reviewers](#ephemeral-reviewers)
  - [Real-Time Progress](#real-time-progress)
  - [Address Feedback](#address-feedback)
  - [Author Agent — Batch Fix](#author-agent--batch-fix)
  - [Session Notes & Chat](#session-notes--chat)
- [Slack Bot](#slack-bot)
- [Configuration](#configuration)
- [Commands Reference](#commands-reference)
- [Updating OCR](#updating-ocr)
- [Supported AI Tools](#supported-ai-tools)
- [Requirements](#requirements)
- [Developer Setup](#developer-setup)

---

## The Dashboard

The dashboard is the recommended way to run reviews, browse results, and manage your workflow. Launch it with `ocr dashboard`.

### Run reviews and maps

The **Command Center** lets you launch multi-agent code reviews and Code Review Maps directly from the dashboard. Specify targets, add requirements, toggle fresh starts — then watch live terminal output as agents work.

<p align="center">
  <img src="assets/ocr-tool-command-center.png" alt="OCR Dashboard Command Center" width="700" />
</p>

### Browse and triage reviews

View verdict banners, individual reviewer cards, findings tables, and cross-reviewer discourse for every review round. Set triage status on findings (needs review, in progress, changes made, acknowledged, dismissed) with filtering and sorting.

<p align="center">
  <img src="assets/ocr-tool-focused-review.png" alt="OCR review output with findings" width="700" />
</p>

### Explore Code Review Maps

Navigate large changesets with section-based breakdowns, rendered Mermaid dependency graphs, and file-level progress tracking.

<p align="center">
  <img src="assets/ocr-tool-focused-code-review-map.png" alt="OCR Code Review Map" width="700" />
</p>

### Post to GitHub

Two posting modes from the review round page:

- **Post Team Review** — Posts the multi-reviewer synthesis as-is
- **Generate Human Review** — AI-rewrites all findings into a single, natural human voice following [Google's code review guidelines](https://google.github.io/eng-practices/review/reviewer/). Preview, edit, and save drafts before posting.

<p align="center">
  <img src="assets/ocr-tool-translate-to-human-review-button.png" alt="Post Review to GitHub dialog" width="700" />
</p>

<p align="center">
  <img src="assets/ocr-tool-example-translated-human-review.png" alt="Human-voice review posted to GitHub PR" width="700" />
</p>

### Manage your review team

The **Team** page lets you browse all 28 reviewer personas grouped by tier (Generalists, Specialists, Famous Engineers, Custom). View full prompts, focus areas, and persona details. Create new reviewers or sync metadata — all from the dashboard.

<p align="center">
  <img src="assets/ocr-tool-manage-reviewers-team.png" alt="OCR Team page for managing reviewer personas" width="700" />
</p>

### Set your default team composition

Pick which personas show up on every review and how many instances of each — your default lineup, persisted to `.ocr/config.yaml`.

<p align="center">
  <img src="assets/ocr-default-team-composition.png" alt="OCR default team composition editor" width="700" />
</p>

### Assign models per reviewer

Different reviewers, different models. Pair a fast model on a generalist with a deeper model on a specialist, mix vendors across a single team, or set a workspace-wide default. The dashboard discovers your installed vendor (Claude Code or OpenCode) and lists every model it offers.

<p align="center">
  <img src="assets/ocr-default-reviewer-model-configuration.png" alt="Per-reviewer model configuration on the Team page" width="700" />
</p>

### Override the team for a single review

Need a heavier-hitting model for one risky changeset? The Command Center lets you swap personas and models per-review without touching your saved defaults.

<p align="center">
  <img src="assets/ocr-per-review-model-configuration.png" alt="Per-review model configuration in the Command Center" width="700" />
</p>

### Address Feedback

After reviewing findings, address them directly. Copy a portable AI prompt into any coding tool, or — with Claude Code or OpenCode detected — run an agent directly from the dashboard to corroborate, validate, and implement changes.

### Ask the Team

AI-powered chat on every review round and map run page. Ask follow-up questions about specific findings, request clarification on reviewer reasoning, or explore alternative approaches.

The dashboard reads from the same `.ocr/` directory and SQLite database used by the review workflow. No separate configuration is needed.

---

## IDE & CLI Workflows

Run all OCR commands directly from your AI coding assistant using slash commands.

### Start a review

```bash
git add .
```

Then in your AI assistant:

```
/ocr-review                                     # Windsurf / flat-prefix tools
/ocr:review                                     # Claude Code / Cursor
/ocr-review Review against openspec/spec.md     # With requirements context
```

### Watch progress in real-time

In a separate terminal:

```bash
ocr progress
```

```
  Open Code Review

  2026-01-26-main  ·  Round 2  ·  1m 23s

  ━━━━━━━━━━━━━━━━────────  60%  ·  Parallel Reviews

  ✓ Context Discovery
  ✓ Change Context
  ✓ Tech Lead Analysis
  ▸ Parallel Reviews
    Round 2
    ✓ Principal #1 2  │  ✓ Principal #2 1  │  ○ Quality #1 0  │  ○ Quality #2 0
    Round 1 ✓ 4 reviewers
  · Aggregate Findings
  · Reviewer Discourse
  · Final Synthesis

  Ctrl+C to exit
```

### More AI assistant commands

```
/ocr-map                   # Generate a Code Review Map for large changesets
/ocr-post                  # Post review to GitHub PR
/ocr-doctor                # Verify installation
/ocr-reviewers             # List available reviewer personas
/ocr-history               # List past review sessions
/ocr-show [session]        # Display a specific past review
```

For Claude Code / Cursor, use `/ocr:review`, `/ocr:map`, `/ocr:post`, etc.

---

## Features

### Multi-Agent Review

OCR follows an 8-phase workflow orchestrated by a Tech Lead agent:

| Phase | What happens |
|-------|--------------|
| 1. Context Discovery | Load config, discover project standards, read OpenSpec context |
| 2. Change Analysis | Analyze `git diff`, understand what changed and why |
| 3. Tech Lead Assessment | Summarize changes, identify risks, select reviewer team |
| 4. Parallel Reviews | Each reviewer examines code independently based on your team config |
| 5. Aggregation | Merge findings from redundant reviewers |
| 6. Discourse | Reviewers challenge, validate, and connect findings |
| 7. Synthesis | Produce prioritized, deduplicated final review |
| 8. Presentation | Display results; optionally post to GitHub |

### Multi-Model Teams

Different reviewers can run on different models. Pair a fast generalist on Sonnet with a deep specialist on Opus, share a single model across a redundancy pair, or define personal aliases like `workhorse`/`big-brain` so config reads naturally.

```yaml
# .ocr/config.yaml
models:
  aliases:
    workhorse: claude-sonnet-4-6
    big-brain: claude-opus-4-7
  default: claude-sonnet-4-6   # used when an instance has no explicit model

default_team:
  # Form 1 — shorthand: N instances, default model
  quality: 2

  # Form 2 — object: N instances, all sharing one model
  security: { count: 1, model: big-brain }

  # Form 3 — list: per-instance model and optional name
  principal:
    - { model: big-brain }
    - { model: workhorse, name: principal-balanced }
```

Override per-review from the Command Center, or via `--team` on the command line. The dashboard auto-discovers every model your installed vendor (Claude Code or OpenCode) offers — no need to memorize identifiers.

### Code Review Maps

For large changesets (20+ files), Code Review Maps provide a structured navigation document — grouping related changes into sections, identifying key files, and surfacing dependencies with Mermaid diagrams.

```
/ocr-map                           # Map staged changes
/ocr-map HEAD~10                   # Map last 10 commits
/ocr-map feature/big-refactor      # Map branch vs main
/ocr-map --requirements spec.md    # Map with requirements context
```

Three specialized agents (Map Architect, Flow Analyst, Requirements Mapper) run with configurable redundancy. Browse maps in the dashboard with dependency graphs and file-level progress tracking.

**When to use a map**: Large changesets where you'd spend time figuring out where to start, or to orient a teammate before they dive into the code. For most changesets, `/ocr-review` alone is sufficient.

### Requirements-Aware Review

OCR is most powerful when reviewing code against explicit requirements:

```
/ocr-review Review against openspec/specs/cli/spec.md        # Spec file
/ocr-review Check against openspec/changes/add-auth/proposal.md  # Proposal
/ocr-review Requirements:                                     # Inline
- Max 100 requests per minute per user
- Return 429 with Retry-After header
/ocr-review This fixes BUG-1234 where users bypassed rate limiting  # Ticket
```

Requirements propagate to all reviewers. The final synthesis includes a **Requirements Verification** table showing which requirements are met, which have gaps, and any ambiguities.

### Reviewer Discourse

Before producing the final review, reviewers examine each other's findings in a structured debate:

- **AGREE** — Validate findings with supporting evidence
- **CHALLENGE** — Question assumptions or reasoning
- **CONNECT** — Relate findings across reviewers
- **SURFACE** — Raise new concerns from the debate

This catches false positives, strengthens valid findings, and surfaces issues that no single reviewer would find alone.

### GitHub PR Posting

Post reviews directly to your PR from the dashboard or your AI assistant:

```
/ocr-post
```

Two modes:
- **Team Review** — Posts the multi-reviewer synthesis as-is
- **Human Review Translation** — AI-rewrites findings into a natural, first-person voice following Google's code review guidelines. Preview, edit, and save drafts before posting.

<p align="center">
  <img src="assets/github-code-review-example.png" alt="OCR review posted to GitHub PR" width="700" />
</p>

**Prerequisites**: GitHub CLI (`gh`) installed and authenticated, open PR on current branch.

### Multi-Round Reviews

OCR supports iterative review cycles:

| Round | Trigger | Use case |
|-------|---------|----------|
| `round-1/` | First `/ocr-review` | Initial code review |
| `round-2/` | Second `/ocr-review` after round-1 completes | Re-review after addressing feedback |
| `round-3+` | Subsequent runs | Further iteration |

Running `/ocr-review` on an existing session checks if the current round is complete. If complete, it starts a new round. Previous rounds are preserved — shared context (`discovered-standards.md`, `context.md`) is reused across rounds.

### Custom Reviewers

OCR ships with 28 reviewer personas across four tiers — generalists, specialists, famous engineers, and custom. Browse and manage them from the dashboard's **Team** page, or create your own.

Three ways to build your review team:

| Mode | How | Persists? |
|------|-----|-----------|
| **Library reviewers** | Select from the Team page or `--team` flag | Yes |
| **Custom persistent** | Create via `/ocr:create-reviewer` | Yes |
| **Ephemeral** | Describe inline via `--reviewer` at review time | No |

**Create a custom reviewer** from your AI assistant:

```
/ocr:create-reviewer api-design --focus "REST API design, backwards compatibility, versioning, error response consistency"
```

This generates a reviewer file following the standard template, syncs metadata, and makes it available in the dashboard immediately.

**Override your team per-review** with the `--team` flag:

```
/ocr:review --team principal:2,security:1,martin-fowler:1
```

### Famous Engineer Personas

Review your code through the lens of industry legends. OCR includes personas for **Martin Fowler**, **Kent Beck**, **Sandi Metz**, **Rich Hickey**, **Kent Dodds**, **Anders Hejlsberg**, **John Ousterhout**, **Kamil Mysliwiec**, **Tanner Linsley**, and **Vladimir Khorikov** — each with review styles, philosophies, and focus areas reflecting their published work.

<p align="center">
  <img src="assets/ocr-tool-famous-engineer-reviewers.png" alt="Famous Engineer reviewer personas on the Team page" width="700" />
</p>

Add them to your team like any other reviewer:

```yaml
# .ocr/config.yaml
default_team:
  principal: 2
  martin-fowler: 1
  sandi-metz: 1
```

### Ephemeral Reviewers

Need a one-off review perspective without creating a persistent reviewer? Describe it inline with `--reviewer`:

```
/ocr:review --reviewer "Focus on error handling in the auth flow"
/ocr:review --team principal:2 --reviewer "Review as a junior developer would" --reviewer "Check accessibility compliance"
```

Ephemeral reviewers participate in all review phases (parallel reviews, discourse, synthesis) just like library reviewers. They don't persist to the reviewer library — they exist only for that review session.

### Real-Time Progress

The `ocr progress` command shows a live terminal UI with phase tracking, elapsed time, reviewer status, finding counts, and completion percentage. It auto-detects the latest active session or accepts a `--session` flag.

### Address Feedback

After a review, use the `/ocr-address` command or the dashboard's "Address Feedback" button to spawn an AI agent that corroborates each finding against actual code, validates the suggestions, and implements the changes.

```
/ocr-address                          # Auto-detect session, show selection list, commit after
/ocr-address --items blockers         # Fix all blocker-severity findings
/ocr-address --items 1,3,5            # Fix specific finding numbers
/ocr-address --items 1-4,7            # Ranges and lists can be mixed
/ocr-address --items all --no-commit  # Apply all fixes but skip the git commit
```

The agent follows an 8-step workflow:

| Step | What happens |
|------|-------------|
| 1. Resolve inputs | Auto-detects or accepts explicit path to `final.md`; reads session context (`discovered-standards.md`, `context.md`) |
| 2. Parse findings | Catalogs every feedback item with number, file, line, category (blocker / should-fix / suggestion), and reviewer persona |
| 3. Select findings | Presents a numbered table; resolves your `--items` selection or prompts you to choose |
| 4. Gather context | Reads every file referenced by the selected findings plus callers, types, and tests |
| 5. Corroborate | Reads actual code at each location; classifies each finding as *Valid*, *Alternative Approach*, *Invalid*, or *Needs Clarification* — does not blindly accept feedback |
| 6. Implement | Spawns sub-agents in parallel for independent items; groups dependent items; reviews combined changes for conflicts |
| 7. Verify | Runs `tsc --noEmit` and `npm test`; fixes any failures before committing |
| 8. Commit | Stages only modified files, creates a structured commit on the current branch |

**The corroboration step is critical.** If a finding is based on a misunderstanding of the code, the agent declines it with evidence. If the suggested fix is suboptimal, it proposes a better alternative and implements that instead.

**Commit format** (Step 8):

```
fix(review): address 3 findings from OCR session 2026-06-21-feat-auth

Round 1 — items addressed:
- [1] JWT secret read from process.env without fallback (src/auth/token.ts)
- [2] Raw SQL string interpolation (src/db/query.ts)
- [3] Missing input validation on email field (src/api/users.ts)

Skipped (invalid/declined):
- [4] Cache TTL should come from config — TTL is already read from config.yaml:L34

Reviewed by: Open Code Review
```

The commit stays **local** — it is never pushed automatically. You control when to push to the remote PR.

### Author Agent — Batch Fix

The Final Review tab renders the synthesized review exactly as it will appear on GitHub, with inline checkboxes injected at each finding in document order — blockers, should-fix items, and suggestions all stay in their natural positions rather than being consolidated at the top.

**How it works:**

1. **Tick findings to fix** — Check individual items or use the select-all toolbar. Each ticked item reveals an optional instruction textarea for per-finding notes to the Author Agent (e.g. "use the helper in utils.ts, keep the same API signature").
2. **Open the Fix dialog** — Click "Fix N selected" to open the three-tab Author Agent dialog.
   - **Agent tab** — Launches a Claude Code session with a structured prompt that includes each finding's original heading, file location, and your per-item notes. Copy the prompt to run in any AI assistant, or fire it directly from the dashboard.
   - **Commit tab** — Commit the applied fixes with a pre-filled message.
   - **Re-review tab** — Immediately trigger a new review round to verify the fixes.
3. **Post-fix PR comments** — After the agent applies fixes, it posts one `gh pr comment` per fixed finding. Each comment uses the **exact heading from the original review** (e.g. `### 🚫 1. Document Validation Is Dead Code`) followed by 1–2 sentences describing what changed — so the reviewer can match each fix comment directly to the issue they raised.

**Remote PR support:** For cross-repository review sessions where you are a collaborator, fixes are pushed directly to the PR branch and post-fix comments target the remote PR automatically. For read-only sessions, the agent produces a unified diff comment instead.

### Session Notes & Chat

The dashboard supports session-level notes for tracking follow-up items and AI-powered chat on review rounds and map runs for asking follow-up questions about findings.

---

## Slack Bot

OCR includes an optional Slack bot that lets anyone on your team trigger a PR review with a single @mention — no dashboard access required. The bot uses **Socket Mode** (a persistent WebSocket to Slack's servers), so no public URL or inbound firewall rule is needed on your machine.

### What it does

- **`@ocr-bot https://github.com/owner/repo/pull/123`** in any channel → review starts immediately
- Posts a public acknowledgement in the channel so the whole team sees it
- DMs the requester when the review starts (with team and start time)
- DMs the requester again when the review completes (with duration and GitHub link)
- **Duplicate detection** — if a second person requests the same PR while a review is already running, both users are DM'd: the new requester is told who already started it, and the original requester is told someone else also wants it
- **Auto-posts the review to the GitHub PR** as a comment the moment it completes — no manual step needed

### Setup

**1. Create a Slack app**

Go to [api.slack.com/apps](https://api.slack.com/apps), create a new app "From scratch", and:

- Under **OAuth & Permissions → Bot Token Scopes**, add: `app_mentions:read`, `chat:write`, `im:write`
- Under **Socket Mode**, enable Socket Mode and generate an **App-Level Token** (`xapp-...`) with scope `connections:write`
- Under **Event Subscriptions → Subscribe to bot events**, add `app_mention`
- Install the app to your workspace and copy the **Bot User OAuth Token** (`xoxb-...`)

**2. Add credentials to `.ocr/config.yaml`**

```yaml
slack:
  bot_token: "xoxb-your-bot-token"
  app_token: "xapp-your-app-level-token"
  default_team: "principal:2,security:1"   # optional — which reviewer personas to use
```

**3. Invite the bot to a channel**

```
/invite @ocr-bot
```

**4. Start the dashboard**

```bash
ocr dashboard
```

The bot connects automatically on startup. You'll see `Slack bot: connected (Socket Mode)` in the server logs. If the `slack:` block is missing or incomplete, the bot is silently skipped — it's fully optional.

### Triggering a review

Mention the bot in any channel it has been invited to:

```
@ocr-bot https://github.com/owner/repo/pull/123
```

The bot responds in the thread, DMs you, runs the full OCR review workflow in the background, and sends you a DM with the result and GitHub comment link when done.

### How the bot tracks reviews

When you trigger a review, the bot:

1. Fetches the PR's branch name from GitHub (`gh pr view`)
2. Pre-creates `.ocr/sessions/YYYY-MM-DD-branch-name/` and writes a `remote-pr.json` marker file inside it — this is how the bot later matches the session directory back to your Slack request
3. Spawns Claude Code with the review prompt
4. When `final.md` is written to the session directory, the filesystem watcher fires a callback into the bot's `handleFinalMd` method, which sends the DMs and posts to GitHub

The commit the review produces stays on your branch — the bot does not push anything.

### Duplicate request handling

```
User A: @ocr-bot https://github.com/org/repo/pull/42
Bot → channel: "On it! Reviewing org/repo PR #42 now. I'll DM @UserA when done."
Bot → UserA DM: "Review started…"

[Review is running]

User B: @ocr-bot https://github.com/org/repo/pull/42
Bot → UserB DM: "PR #42 is already being reviewed — started by @UserA at 2:14 PM. You'll be notified when it completes."
Bot → UserA DM: "@UserB also requested a review of org/repo PR #42. Your review is still running."
```

### What happens if the review fails

If Claude Code exits without producing a `final.md` (crash, misconfiguration, etc.), the bot:
- DMs you: "The review process exited without producing a result. Please check your AI CLI setup and try again."
- Cleans up the in-memory tracking entry so no resources leak

---

## Configuration

After running `ocr init`, edit `.ocr/config.yaml`:

```yaml
# Project context injected into all reviews
context: |
  Tech stack: TypeScript, React, Node.js
  Critical: All public APIs must be backwards compatible

# Customize your reviewer team composition
# Three forms — see "Multi-Model Teams" above for the full variants.
default_team:
  principal: 2       # Architecture, design patterns
  quality: 2         # Code style, best practices
  # security: 1      # Auto-added for auth/data changes
  # testing: 1       # Auto-added for logic changes
  # martin-fowler: 1 # Famous engineer persona

# Optional: model aliases + workspace default
# models:
#   aliases:
#     workhorse: claude-sonnet-4-6
#     big-brain: claude-opus-4-7
#   default: claude-sonnet-4-6

# Context discovery
context_discovery:
  openspec:
    enabled: true
  references:
    - "CLAUDE.md"
    - ".cursorrules"
    - "CONTRIBUTING.md"

# Code Review Map tuning
code-review-map:
  agents:
    flow_analysts: 2
    requirements_mappers: 2

# Discourse
discourse:
  enabled: true

# GitHub posting
github:
  auto_prompt_post: false
  comment_format: "single"

# Dashboard IDE integration
dashboard:
  ide: auto  # vscode | cursor | windsurf | jetbrains | sublime

# Slack bot (optional) — enables @bot <pr-url> → review → DM workflow
# Requires Socket Mode enabled in your Slack app settings.
# slack:
#   bot_token: "xoxb-..."   # Bot User OAuth Token
#   app_token: "xapp-..."   # App-Level Token (for Socket Mode)
#   default_team: "principal:2,security:1"   # reviewer team for Slack-triggered reviews
```

Team composition can also be changed per-review via `--team` (explicit roster) or `--reviewer` (ephemeral reviewers), or via natural language: "use 3 principal reviewers and add security."

---

## Commands Reference

### AI Assistant Commands

| Command | Description |
|---------|-------------|
| `/ocr-review [target]` | Review staged changes, commits, or branches |
| `/ocr-review --team id:n,...` | Review with a custom team composition |
| `/ocr-review --reviewer "..."` | Add an ephemeral reviewer by description |
| `/ocr-review --fresh` | Clear session and start fresh |
| `/ocr-map [target]` | Generate a Code Review Map for large changesets |
| `/ocr-post` | Post review as a GitHub PR comment |
| `/ocr-create-reviewer name --focus "..."` | Create a custom persistent reviewer |
| `/ocr-sync-reviewers` | Sync reviewer metadata for the dashboard |
| `/ocr-doctor` | Verify installation and dependencies |
| `/ocr-reviewers` | List available reviewer personas |
| `/ocr-history` | List past review sessions |
| `/ocr-show [session]` | Display a specific past review |
| `/ocr-address [final.md]` | Address review feedback — corroborate, implement, and commit fixes |
| `/ocr-address --items blockers` | Address only blocker-severity findings |
| `/ocr-address --items 1,3,5` | Address specific finding numbers |
| `/ocr-address --no-commit` | Apply fixes without creating a git commit |

*For Claude Code / Cursor, use `/ocr:review`, `/ocr:map`, etc.*

### CLI Commands

| Command | Description |
|---------|-------------|
| `ocr init` | Initialize OCR for your AI tools |
| `ocr dashboard` | Start the web dashboard interface |
| `ocr progress` | Watch review progress live |
| `ocr doctor` | Check installation and verify dependencies |
| `ocr update` | Update skills and commands after package upgrade |
| `ocr state` | Manage session state (internal, used by review workflow) |

---

## Updating OCR

After upgrading the package, run `ocr update` to sync your project:

```bash
npm i -g @open-code-review/cli@latest
ocr update
```

| Asset | Updated? | Notes |
|-------|----------|-------|
| `.ocr/skills/SKILL.md` | Yes | Tech Lead orchestration |
| `.ocr/skills/references/` | Yes | Workflow, discourse rules |
| Tool commands (`.windsurf/`, `.claude/`, etc.) | Yes | Slash command definitions |
| `AGENTS.md` / `CLAUDE.md` | Yes | OCR managed blocks only |
| `.ocr/config.yaml` | **No** | Your customizations preserved |
| `.ocr/skills/references/reviewers/` | **No** | All reviewer personas preserved |
| `.ocr/sessions/` | **No** | Review history untouched |

```bash
ocr update --dry-run     # Preview changes
ocr update --commands    # Commands only
ocr update --skills      # Skills and references only
ocr update --inject      # AGENTS.md/CLAUDE.md only
```

---

## Supported AI Tools

`ocr init` detects and configures all of these automatically:

| Tool | Config Directory |
|------|------------------|
| Amazon Q Developer | `.aws/amazonq/` |
| Augment (Auggie) | `.augment/` |
| Claude Code | `.claude/` |
| Cline | `.cline/` |
| Codex | `.codex/` |
| Continue | `.continue/` |
| Cursor | `.cursor/` |
| Gemini CLI | `.gemini/` |
| GitHub Copilot | `.github/` |
| Kilo Code | `.kilocode/` |
| OpenCode | `.opencode/` |
| Qoder | `.qoder/` |
| RooCode | `.roo/` |
| Windsurf | `.windsurf/` |

---

## Requirements

- **Node.js** >= 22.5.0
- **Git** — For diff analysis
- **An AI coding assistant** — Claude Code, Cursor, Windsurf, or [any supported tool](#supported-ai-tools)
- **GitHub CLI** (`gh`) — Optional, for posting reviews to PRs

> **v2.1 — built-in SQLite engine**: OCR stores state with Node's built-in
> SQLite (`node:sqlite`, on-disk + WAL) for durable, concurrent-safe writes —
> **no native module, no prebuilt binary, no install script.** It installs
> cleanly under any package manager (npm, **pnpm 10+**, yarn) on every platform.
> This requires **Node >= 22.5** (when `node:sqlite` landed); on an older Node
> the CLI prints a clear upgrade message. Run `ocr doctor` to verify the engine.
>
> **Upgrading from v1.x or v2.0?** Make sure you're on **Node >= 22.5**, quit any
> running `ocr dashboard`, then `npm i -g @open-code-review/cli@latest` (or
> `pnpm add -g …`). Your existing database upgrades **automatically** on the next
> `ocr` command: a backup is written to `ocr.db.bak.v<n>`, legacy sessions are
> reconciled, and a one-time notice summarizes what happened. No manual steps.

Run `ocr doctor` to verify your setup.

> **Important**: The CLI (`npm install -g @open-code-review/cli`) is required for all OCR workflows. Both review and map commands use `ocr state` for progress tracking at every phase transition.

---

## Session Storage

Reviews are persisted to `.ocr/sessions/{date}-{branch}/`:

```
.ocr/sessions/2026-01-26-feature-auth/
├── discovered-standards.md  # Merged project context (shared)
├── context.md               # Change summary + Tech Lead guidance (shared)
├── requirements.md          # User-provided requirements (shared, if any)
├── rounds/
│   ├── round-1/
│   │   ├── reviews/         # Individual reviewer outputs
│   │   │   ├── principal-1.md
│   │   │   ├── quality-1.md
│   │   │   └── ephemeral-1.md  # From --reviewer (if used)
│   │   ├── discourse.md     # Cross-reviewer discussion
│   │   └── final.md         # Synthesized final review
│   └── round-2/             # Created on re-review
└── maps/
    └── run-1/
        ├── map.md           # Code Review Map
        └── flow-analysis.md # Dependency graph (Mermaid)
```

Sessions are gitignored by default.

---

## Developer Setup

To run from source after cloning the repo:

**Prerequisites:** Node.js >= 22.5, pnpm >= 9, Git.

```bash
git clone https://github.com/sanidhyagupta-web/Hire-Code-Review-Bots.git
cd Hire-Code-Review-Bots

pnpm install                  # install all workspace dependencies

pnpm nx run cli:build         # build the CLI
pnpm nx run dashboard:build   # build the dashboard

# Link the CLI globally so `ocr` resolves in any terminal
npm install -g ./packages/cli

# Use it in any project
cd your-project
ocr init
ocr dashboard
```

**Active development** (hot-reload):

```bash
cd packages/dashboard
pnpm dev          # starts Vite dev server + Node server concurrently
```

**Run tests:**

```bash
pnpm nx run-many -t test    # all packages
pnpm nx run cli:test        # CLI only
pnpm nx run-many -t lint    # lint check (also enforces module boundaries)
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contribution workflow.

---

## License

Apache-2.0

---

## Links

- **GitHub**: [github.com/sanidhyagupta-web/Hire-Code-Review-Bots](https://github.com/sanidhyagupta-web/Hire-Code-Review-Bots)
- **npm (CLI)**: [@open-code-review/cli](https://www.npmjs.com/package/@open-code-review/cli)
- **npm (Agents)**: [@open-code-review/agents](https://www.npmjs.com/package/@open-code-review/agents)
# Code-Revs
