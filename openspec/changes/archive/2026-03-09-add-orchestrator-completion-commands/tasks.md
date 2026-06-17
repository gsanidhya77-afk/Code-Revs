## 1. CLI Types

- [x] 1.1 Add `RoundMeta`, `RoundMetaFinding`, `RoundMetaReviewer` types to `packages/cli/src/lib/state/types.ts`
- [x] 1.2 Add `RoundCompleteParams` discriminated union (file/stdin source) and `RoundCompleteResult` type
- [x] 1.3 Add `MapMeta`, `MapMetaSection`, `MapMetaFile`, `MapMetaDependency` types
- [x] 1.4 Add `MapCompleteParams` discriminated union and `MapCompleteResult` type

## 2. CLI State Module — Shared Helpers + Completion Functions

- [x] 2.1 Extract `readJsonFromSource` shared helper from `stateRoundComplete`
- [x] 2.2 Extract `parseRawJson` shared helper
- [x] 2.3 Extract `resolveSessionForCompletion` shared helper
- [x] 2.4 Refactor `stateRoundComplete` to use shared helpers (behavior unchanged)
- [x] 2.5 Add `validateRoundMeta` with schema validation
- [x] 2.6 Add exported `computeRoundCounts` (derives counts from findings array)
- [x] 2.7 Implement `stateRoundComplete` — read, parse, validate, write (stdin), record `round_completed` event
- [x] 2.8 Add `validateMapMeta` with schema validation
- [x] 2.9 Add exported `computeMapCounts` (derives counts from sections array)
- [x] 2.10 Implement `stateMapComplete` — parallel to round-complete for map workflows

## 3. CLI Commands

- [x] 3.1 Add `roundCompleteSubcommand` with `--file`/`--stdin`/`--session-id`/`--round` flags
- [x] 3.2 Add `mapCompleteSubcommand` with `--file`/`--stdin`/`--session-id`/`--map-run` flags
- [x] 3.3 Add mutual exclusion check (neither or both = error)
- [x] 3.4 Register both subcommands with `stateCommand`

## 4. DB Migrations

- [x] 4.1 Add migration v6: `source` column on `review_rounds`
- [x] 4.2 Add migration v7: `source` + `section_count` columns on `map_runs`

## 5. Dashboard — DbSyncWatcher

- [x] 5.1 Add `round_completed` event processing loop in `syncEvents()`
- [x] 5.2 Add `processRoundCompletedEvent()` with source-latch pattern
- [x] 5.3 Add `map_completed` event processing loop in `syncEvents()`
- [x] 5.4 Add `processMapCompletedEvent()` with source-latch pattern

## 6. Dashboard — FilesystemSync

- [x] 6.1 Add source latch to `processRoundMd` (skip re-parsing when `source = 'orchestrator'`)
- [x] 6.2 Add `processRoundMeta` method for `round-meta.json` structured data processing
- [x] 6.3 Add source latch to `processMapMd` (skip section/file parsing when `source = 'orchestrator'`, still store raw markdown)
- [x] 6.4 Add `processMapMeta` method for `map-meta.json` structured data processing
- [x] 6.5 Add `round-meta.json` and `map-meta.json` routes to `processChangedFile()`
- [x] 6.6 Process `round-meta.json` and `map-meta.json` before markdown files in `syncSession()`
- [x] 6.7 Update `MapRunRow` type with `section_count` and `source` fields

## 7. Tests

- [x] 7.1 Add `makeRoundMeta()` and `writeRoundMeta()` test helpers
- [x] 7.2 Add `computeRoundCounts` tests (empty, populated)
- [x] 7.3 Add `stateRoundComplete` file mode tests (event creation, auto-detect, validation, edge cases)
- [x] 7.4 Add `stateRoundComplete` stdin mode tests (event creation, file write, mkdir, invalid JSON, file mode no-write)
- [x] 7.5 Add `makeMapMeta()` and `writeMapMeta()` test helpers
- [x] 7.6 Add `computeMapCounts` tests (empty, populated)
- [x] 7.7 Add `stateMapComplete` file mode tests
- [x] 7.8 Add `stateMapComplete` stdin mode tests

## 8. Documentation

- [x] 8.1 Update `session-state.md` with `ocr state round-complete` and `ocr state map-complete` sections
- [x] 8.2 Update `session-files.md` with `round-meta.json` and `map-meta.json` in directory tree and file specs
- [x] 8.3 Update `map-workflow.md` Phase 5 to pipe structured data to CLI before writing `map.md`
- [x] 8.4 Mirror all doc changes to `.ocr/skills/references/`
