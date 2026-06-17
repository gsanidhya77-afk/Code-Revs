## MODIFIED Requirements

### Requirement: Filesystem Sync Service

The dashboard server SHALL run a FilesystemSync service that parses markdown artifacts from `.ocr/sessions/` into granular SQLite tables.

#### Scenario: Full scan on startup

- **GIVEN** the dashboard server starts
- **WHEN** initialization completes
- **THEN** FilesystemSync scans all sessions in `.ocr/sessions/` and upserts artifact data into SQLite

#### Scenario: Incremental sync on file change

- **GIVEN** the dashboard is running
- **WHEN** a new markdown artifact file is created or modified in `.ocr/sessions/`
- **THEN** chokidar detects the change and FilesystemSync parses the file into SQLite
- **AND** a Socket.IO event (`artifact:created` or `artifact:updated`) is emitted

#### Scenario: Upsert semantics

- **WHEN** FilesystemSync processes an artifact
- **THEN** it SHALL use `INSERT OR REPLACE` (upsert) for artifact tables
- **AND** it SHALL never delete existing rows
- **AND** it SHALL never touch user interaction tables (`user_file_progress`, `user_finding_progress`, `user_notes`)
- **AND** it SHALL never touch orchestration tables (`sessions`, `orchestration_events`)

#### Scenario: Skip unchanged files

- **WHEN** FilesystemSync encounters a file whose `mtime` has not changed since `parsed_at`
- **THEN** the file SHALL be skipped

#### Scenario: Idempotent full sync

- **WHEN** a full sync runs multiple times
- **THEN** the resulting SQLite state SHALL be identical each time

#### Scenario: Source latch for orchestrator data

- **GIVEN** a `round-meta.json` or `map-meta.json` has been processed by the CLI (source = 'orchestrator')
- **WHEN** FilesystemSync encounters the corresponding markdown artifact
- **THEN** it SHALL skip re-parsing structured data (findings, sections, files)
- **AND** it SHALL still store the raw markdown content in `markdown_artifacts` for display
- **AND** user progress (`user_file_progress`, `user_finding_progress`) SHALL be preserved

#### Scenario: Process round-meta.json

- **GIVEN** a `round-meta.json` file exists in a round directory
- **WHEN** FilesystemSync processes the session
- **THEN** it SHALL parse the JSON, validate `schema_version`, and populate `review_rounds`, `reviewer_outputs`, and `review_findings` tables
- **AND** existing user progress SHALL be stashed and restored after re-import
- **AND** `source` SHALL be set to `'orchestrator'`

#### Scenario: Process map-meta.json

- **GIVEN** a `map-meta.json` file exists in a map run directory
- **WHEN** FilesystemSync processes the session
- **THEN** it SHALL parse the JSON, validate `schema_version`, and populate `map_runs`, `map_sections`, and `map_files` tables
- **AND** existing user progress SHALL be stashed and restored after re-import
- **AND** `source` SHALL be set to `'orchestrator'`

#### Scenario: Structured files processed before markdown

- **GIVEN** both `round-meta.json` and `final.md` exist in a round directory
- **WHEN** FilesystemSync processes the round
- **THEN** `round-meta.json` SHALL be processed BEFORE `final.md`
- **AND** similarly, `map-meta.json` SHALL be processed BEFORE `map.md`

---

## ADDED Requirements

### Requirement: DbSyncWatcher Completion Event Processing

The dashboard's `DbSyncWatcher` SHALL process `round_completed` and `map_completed` orchestration events from the CLI's SQLite database to populate artifact tables in real time.

#### Scenario: Round completed event

- **GIVEN** the dashboard is running and watching the CLI's database
- **WHEN** a `round_completed` event is detected in `orchestration_events`
- **THEN** the `DbSyncWatcher` SHALL:
  - Parse the event's metadata JSON
  - Check the source latch on the corresponding `review_rounds` row (skip if already `'orchestrator'`)
  - Insert or update the `review_rounds` row with derived counts and `source = 'orchestrator'`
  - Emit a `review:updated` Socket.IO event

#### Scenario: Map completed event

- **GIVEN** the dashboard is running and watching the CLI's database
- **WHEN** a `map_completed` event is detected in `orchestration_events`
- **THEN** the `DbSyncWatcher` SHALL:
  - Parse the event's metadata JSON
  - Check the source latch on the corresponding `map_runs` row (skip if already `'orchestrator'`)
  - Insert or update the `map_runs` row with derived counts and `source = 'orchestrator'`
  - Emit a `map:updated` Socket.IO event

#### Scenario: Idempotent event processing

- **GIVEN** the same completion event is processed multiple times
- **WHEN** the source latch shows `'orchestrator'` already set
- **THEN** the event SHALL be skipped without error
