## MODIFIED Requirements

### Requirement: Map Artifact Storage

The system SHALL store review map artifacts in a dedicated subdirectory within the session directory, organized by runs.

#### Scenario: Map directory structure
- **GIVEN** a review map is initiated
- **WHEN** the map workflow begins
- **THEN** the system SHALL create `.ocr/sessions/{id}/map/runs/run-{n}/` directory

#### Scenario: Map run contents
- **GIVEN** a review map workflow completes
- **WHEN** artifacts are saved
- **THEN** the `map/runs/run-{n}/` directory SHALL contain:
  - `map-meta.json` — Structured map data (written by CLI via `ocr state map-complete --stdin`)
  - `map.md` — Final rendered review map (presentation artifact, written by orchestrator)

#### Scenario: Map coexistence with reviews
- **GIVEN** a session has both map and review artifacts
- **WHEN** artifacts are stored
- **THEN** they SHALL coexist independently:
  - `map/runs/` for review map runs
  - `rounds/` for code review rounds
  - Shared: `discovered-standards.md`, `context.md`, `requirements.md`

#### Scenario: Multiple map runs
- **GIVEN** a map already exists at `map/runs/run-1/`
- **WHEN** user runs `/ocr:map` again on the same session
- **THEN** the system SHALL:
  - Create `map/runs/run-2/` directory
  - Update `current_map_run` to 2 in SQLite
  - Preserve all `run-1/` artifacts unchanged

#### Scenario: Map run history preservation
- **GIVEN** multiple map runs have been completed
- **WHEN** a new run starts
- **THEN** previous run artifacts SHALL remain unchanged and accessible

---

### Requirement: Round-Specific Artifacts

The system SHALL store discourse and synthesis outputs inside round directories, not at session root.

#### Scenario: Discourse output location
- **GIVEN** discourse phase completes for round 2
- **WHEN** discourse results are saved
- **THEN** the file SHALL be saved to `rounds/round-2/discourse.md`

#### Scenario: Final review output location
- **GIVEN** synthesis phase completes for round 2
- **WHEN** final review is saved
- **THEN** the file SHALL be saved to `rounds/round-2/final.md`

#### Scenario: Round metadata output location
- **GIVEN** the synthesis phase completes for round 1
- **WHEN** the orchestrator pipes structured data to `ocr state round-complete --stdin`
- **THEN** the CLI SHALL write `rounds/round-1/round-meta.json` with validated structured review data

#### Scenario: Shared context remains at root
- **GIVEN** a multi-round session exists
- **WHEN** context is examined
- **THEN** `discovered-standards.md`, `requirements.md`, and `context.md` SHALL remain at session root (shared across all rounds)
