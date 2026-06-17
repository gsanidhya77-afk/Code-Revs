# Tasks: Add CLI Update Notifier and Dashboard UX Enhancements

All tasks are already implemented in the current staged changes. This proposal documents existing functionality.

## CLI Update Notifier

- [x] Create `update-check.ts` module with npm registry fetch, 4h cache, and styled stderr notification
- [x] Wire update check into CLI entrypoint (`index.ts`) with `HUMAN_COMMANDS` scope guard
- [x] Migrate `program.parse()` to `program.parseAsync()` for proper async command awaiting
- [x] Add 500ms race timeout to prevent CLI from blocking on slow network
- [x] Add integration tests for update checker (version comparison, caching, CI suppression, network errors)

## Dashboard Address Feedback "Copy to Terminal"

- [x] Add `buildSlashCommand()` helper that builds `/ocr:address <path>` format with optional notes
- [x] Add "Copy to Terminal" button alongside "Run in Dashboard" in the Address Feedback popover
- [x] Show clipboard confirmation ("Copied!") with 2-second auto-dismiss
- [x] Update command preview to show slash command format instead of CLI command

## Dashboard Round Detail Page Status Dropdown

- [x] Add `ROUND_STATUS_OPTIONS` constant and `useUpdateRoundStatus()` hook to round detail page
- [x] Add inline `<select>` dropdown next to round title in the page header
- [x] Wire dropdown to existing `PATCH /api/rounds/:id/progress` endpoint via mutation hook

## Validation

- [x] Build passes (`pnpm build`)
- [x] All 134 tests pass (16 new update-check tests + 118 existing)
- [x] Update OpenSpec spec deltas for affected capabilities
