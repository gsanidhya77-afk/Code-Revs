## MODIFIED Requirements

### Requirement: Orchestration Event Log

The system SHALL maintain an append-only event log in the `orchestration_events` table for every state change made via `ocr state` commands.

#### Scenario: Session creation event

- **WHEN** `ocr state init` runs
- **THEN** a row is inserted into `orchestration_events` with `event_type = 'session_created'`

#### Scenario: Phase transition event

- **WHEN** `ocr state transition` runs
- **THEN** a row is inserted with `event_type = 'phase_transition'`, the phase name, and phase number

#### Scenario: Session close event

- **WHEN** `ocr state close` runs
- **THEN** a row is inserted with `event_type = 'session_closed'`

#### Scenario: Round completed event

- **WHEN** `ocr state round-complete` runs
- **THEN** a row is inserted with `event_type = 'round_completed'`, the round number in the `round` column, and metadata JSON containing derived counts (`blocker_count`, `critical_count`, `major_count`, `suggestion_count`, `nitpick_count`, `reviewer_count`) and `source: "orchestrator"`

#### Scenario: Map completed event

- **WHEN** `ocr state map-complete` runs
- **THEN** a row is inserted with `event_type = 'map_completed'`, the map run number in the `round` column, and metadata JSON containing derived counts (`section_count`, `file_count`) and `source: "orchestrator"`

#### Scenario: Immutable log

- **GIVEN** events exist in `orchestration_events`
- **WHEN** any consumer accesses the table
- **THEN** rows SHALL never be updated or deleted
- **AND** new events are always appended

#### Scenario: Timeline reconstruction

- **GIVEN** a session has multiple orchestration events
- **WHEN** the dashboard queries events for a session
- **THEN** a complete timeline of phase transitions, round starts, round completions, map completions, and status changes can be reconstructed from the event log

---

## ADDED Requirements

### Requirement: Source Tracking on Artifact Tables

The `review_rounds` and `map_runs` artifact tables SHALL include a `source` column that tracks how the data was populated, enabling an orchestrator-first data flow.

#### Scenario: Orchestrator source

- **GIVEN** a completion command (`round-complete` or `map-complete`) has been run
- **WHEN** the dashboard processes the corresponding orchestration event
- **THEN** the artifact row's `source` column SHALL be set to `'orchestrator'`
- **AND** subsequent filesystem parser runs SHALL NOT overwrite orchestrator-provided data

#### Scenario: Parser source

- **GIVEN** no completion command has been run for a round or map run
- **WHEN** FilesystemSync parses a markdown artifact
- **THEN** the artifact row's `source` column SHALL be set to `'parser'`

#### Scenario: Source latch

- **GIVEN** a row has `source = 'orchestrator'`
- **WHEN** FilesystemSync encounters the same artifact
- **THEN** it SHALL skip re-parsing structured data (sections, files, findings)
- **AND** it SHALL still store raw markdown content for display purposes

#### Scenario: Map runs section count

- **GIVEN** migration v7 has been applied
- **WHEN** the `map_runs` table is inspected
- **THEN** it SHALL include a `section_count` column (INTEGER, default 0)
- **AND** it SHALL include a `source` column (TEXT, default NULL)
