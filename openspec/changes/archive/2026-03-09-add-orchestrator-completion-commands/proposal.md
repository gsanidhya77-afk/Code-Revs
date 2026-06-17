# Change: Add Orchestrator Completion Commands (round-complete + map-complete)

## Why

OCR's CLI-as-sole-writer principle requires the CLI to be the exclusive writer of all stateful artifacts. Prior to this change, the orchestrator (AI agent) wrote `round-meta.json` and `map.md` directly to disk, and the dashboard parsed markdown to extract structured data. This was fragile — parsing markdown is lossy and format-dependent. The `round-complete` and `map-complete` subcommands make the CLI the single writer of structured metadata files, with validated schemas and derived counts.

## What Changes

- **New `ocr state round-complete` subcommand** — Accepts structured review round data via `--stdin` (recommended) or `--file`, validates schema, derives counts from findings array, writes `round-meta.json`, records `round_completed` orchestration event
- **New `ocr state map-complete` subcommand** — Parallel to `round-complete` for map workflows. Accepts structured map data via `--stdin` or `--file`, validates schema, derives counts from sections array, writes `map-meta.json`, records `map_completed` orchestration event
- **New structured types** — `RoundMeta`, `MapMeta` and related types (`MapMetaSection`, `MapMetaFile`, `MapMetaDependency`) with discriminated union params (`RoundCompleteParams`, `MapCompleteParams`)
- **DRY shared helpers** — Extracted `readJsonFromSource`, `parseRawJson`, `resolveSessionForCompletion` from `stateRoundComplete`, reused by both completion harnesses
- **New `computeRoundCounts` and `computeMapCounts`** — Derive counts from structured data arrays (never trust self-reported counts)
- **Schema migration v6-v7** — Add `source` and `section_count` columns to `review_rounds` and `map_runs` tables for orchestrator-first tracking
- **Dashboard source latch** — `DbSyncWatcher` processes `round_completed`/`map_completed` events; `FilesystemSync` respects `source = 'orchestrator'` latch to skip re-parsing when structured data already exists
- **Dashboard `processRoundMeta` and `processMapMeta`** — Process structured JSON metadata files with user progress preservation (stash/restore pattern)

## Impact

- Affected specs: `cli` (new subcommands), `sqlite-state` (new event types, migrations), `dashboard` (source latch, event processing), `session-management` (new artifact files)
- Affected code: `packages/cli/src/lib/state/` (types, index), `packages/cli/src/commands/state.ts`, `packages/cli/src/lib/db/migrations.ts`, `packages/dashboard/src/server/services/` (db-sync-watcher, filesystem-sync), `packages/dashboard/src/server/db.ts`
- Backward compatible: Sessions without `round-meta.json` or `map-meta.json` continue to work via parser fallback
