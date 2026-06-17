## ADDED Requirements

### Requirement: OCR State Round-Complete Command

The `ocr state round-complete` CLI subcommand SHALL accept structured review round data, validate it, optionally write `round-meta.json`, and record a `round_completed` orchestration event.

#### Scenario: Stdin mode (recommended)

- **GIVEN** a review round has completed
- **WHEN** the orchestrator pipes structured JSON to `ocr state round-complete --stdin`
- **THEN** the CLI SHALL:
  - Parse and validate the JSON against the `RoundMeta` schema (`schema_version`, `verdict`, `reviewers` array with findings)
  - Derive finding counts from the findings array (never trust self-reported counts)
  - Write `round-meta.json` to the correct session round directory (`{session_dir}/rounds/round-{n}/round-meta.json`)
  - Insert a `round_completed` event into `orchestration_events` with metadata containing derived counts and `source: "orchestrator"`
  - Return the session ID, round number, and written file path

#### Scenario: File mode

- **GIVEN** a `round-meta.json` file already exists on disk
- **WHEN** the user runs `ocr state round-complete --file <path>`
- **THEN** the CLI SHALL read and validate the file, record the orchestration event, but NOT write the file (it already exists)
- **AND** the returned result SHALL have `metaPath` as undefined

#### Scenario: Auto-detect session and round

- **GIVEN** neither `--session-id` nor `--round` is provided
- **WHEN** `ocr state round-complete` runs
- **THEN** the CLI SHALL auto-detect the active session and use its `current_round`

#### Scenario: Invalid schema

- **GIVEN** the piped JSON has `schema_version` other than 1 or is missing required fields
- **WHEN** `ocr state round-complete --stdin` processes the input
- **THEN** the CLI SHALL throw a validation error with a descriptive message

#### Scenario: Mutual exclusion

- **WHEN** neither `--file` nor `--stdin` is provided, or both are provided
- **THEN** the CLI SHALL exit with an error explaining that exactly one source is required

---

### Requirement: OCR State Map-Complete Command

The `ocr state map-complete` CLI subcommand SHALL accept structured map data, validate it, optionally write `map-meta.json`, and record a `map_completed` orchestration event. This command is parallel to `round-complete` for map workflows.

#### Scenario: Stdin mode (recommended)

- **GIVEN** a map run has completed
- **WHEN** the orchestrator pipes structured JSON to `ocr state map-complete --stdin`
- **THEN** the CLI SHALL:
  - Parse and validate the JSON against the `MapMeta` schema (`schema_version`, `sections` array with files, optional `dependencies` array)
  - Derive section and file counts from the sections array
  - Write `map-meta.json` to the correct session map run directory (`{session_dir}/map/runs/run-{n}/map-meta.json`)
  - Insert a `map_completed` event into `orchestration_events` with metadata containing derived counts and `source: "orchestrator"`
  - Return the session ID, map run number, and written file path

#### Scenario: File mode

- **GIVEN** a `map-meta.json` file already exists on disk
- **WHEN** the user runs `ocr state map-complete --file <path>`
- **THEN** the CLI SHALL read and validate the file, record the orchestration event, but NOT write the file
- **AND** the returned result SHALL have `metaPath` as undefined

#### Scenario: Auto-detect session and map run

- **GIVEN** neither `--session-id` nor `--map-run` is provided
- **WHEN** `ocr state map-complete` runs
- **THEN** the CLI SHALL auto-detect the active session and use its `current_map_run`

#### Scenario: Invalid schema

- **GIVEN** the piped JSON has invalid `schema_version` or is missing required fields
- **WHEN** `ocr state map-complete --stdin` processes the input
- **THEN** the CLI SHALL throw a validation error with a descriptive message

#### Scenario: Mutual exclusion

- **WHEN** neither `--file` nor `--stdin` is provided, or both are provided
- **THEN** the CLI SHALL exit with an error explaining that exactly one source is required

---

### Requirement: Completion Command Shared Internals

The `round-complete` and `map-complete` subcommands SHALL share common internal helpers to avoid code duplication.

#### Scenario: Shared JSON reading

- **WHEN** either completion command reads input
- **THEN** both SHALL use the same `readJsonFromSource` helper that handles file-read (with existence check) and stdin-data passthrough

#### Scenario: Shared JSON parsing

- **WHEN** either completion command parses JSON
- **THEN** both SHALL use the same `parseRawJson` helper with descriptive error labels (file path or "stdin")

#### Scenario: Shared session resolution

- **WHEN** either completion command resolves the target session
- **THEN** both SHALL use the same `resolveSessionForCompletion` helper that supports explicit `--session-id` or auto-detection of the active session
