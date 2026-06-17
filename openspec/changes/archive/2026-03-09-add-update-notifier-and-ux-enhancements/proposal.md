# Proposal: Add CLI Update Notifier and Dashboard UX Enhancements

## Why

- **Update notifier**: Users running older CLI versions miss bug fixes and new features. A non-blocking, cached check ensures they see update availability without degrading command latency. AI-invoked commands (`state`) are excluded to avoid noise in agent output.
- **Copy to Terminal**: Not all users want to run feedback processing inside the dashboard. Copying the slash command lets them paste it into their preferred IDE terminal (Claude Code, Cursor, etc.).
- **Round detail status dropdown**: The round detail page is the primary place users read review findings. Having to navigate back to the reviews table just to update status creates unnecessary friction.

## What Changes

Three focused improvements to developer experience:

1. **CLI Update Notifier** — Non-blocking background check against the npm registry when human-facing commands run (`init`, `update`, `doctor`, `dashboard`, `progress`). Caches results for 4 hours and prints a styled notification to stderr after the command completes, similar to how Claude Code and NX handle update notifications.

2. **Dashboard Address Feedback "Copy to Terminal"** — When the AI CLI is available, the Address Feedback popover now offers two actions side by side: "Run in Dashboard" (existing behavior) and "Copy to Terminal" (copies the `/ocr:address` slash command to the clipboard for use in an external terminal). The command preview now shows the slash command format.

3. **Dashboard Round Detail Page Status Dropdown** — The review round detail page now includes an inline triage status dropdown next to the round title, matching the dropdown already available on the Reviews list page. This lets users update triage status without navigating back to the reviews table.

## Affected Capabilities

| Capability | Action |
|------------|--------|
| `cli` | ADDED: Update Notifier requirement |
| `dashboard` | MODIFIED: Address Feedback Popover, ADDED: Round Detail Page Status Dropdown |

## Scope

- No database schema changes (triage status and round detail APIs already exist)
- No new dependencies (uses built-in `fetch`, existing `chalk`)
- CLI update check is fire-and-forget with a 500ms race timeout
- All three features are already implemented in the staged changes
