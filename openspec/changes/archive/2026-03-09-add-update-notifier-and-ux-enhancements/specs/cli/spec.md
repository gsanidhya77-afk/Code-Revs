## ADDED Requirements

### Requirement: CLI Update Notifier

The CLI SHALL perform a non-blocking background check for newer versions on npm when human-facing commands run, and print a styled notification to stderr after command output completes.

#### Scenario: Update available

- **GIVEN** user runs a human-facing CLI command (`init`, `update`, `doctor`, `dashboard`, or `progress`)
- **WHEN** the npm registry reports a newer version than the installed version
- **THEN** after the command output completes, a styled notification SHALL be printed to stderr containing:
  - The current version and the latest version
  - A copy-pasteable update command: `npm i -g @open-code-review/cli@latest && ocr update`
- **AND** the notification SHALL NOT interleave with command stdout/stderr

#### Scenario: Already on latest version

- **GIVEN** the installed version matches or exceeds the latest npm version
- **WHEN** a human-facing command runs
- **THEN** no update notification SHALL be printed

#### Scenario: Human-facing command scope

- **GIVEN** the CLI is invoked
- **WHEN** the subcommand is one of: `init`, `update`, `doctor`, `dashboard`, `progress`
- **THEN** the update check SHALL fire
- **AND** when the subcommand is `state` (or any other AI-invoked command), the update check SHALL NOT fire

#### Scenario: Non-blocking execution

- **GIVEN** a human-facing command is invoked
- **WHEN** the update check fires
- **THEN** the check SHALL run as a background promise that starts before `parseAsync()` and resolves after command output
- **AND** a 500ms race timeout SHALL ensure the CLI exits promptly even if the check is slow
- **AND** `program.parse()` SHALL be replaced with `await program.parseAsync()` to properly await async action handlers

#### Scenario: Result caching

- **GIVEN** a successful registry fetch
- **WHEN** the result is obtained
- **THEN** the version SHALL be cached at `~/.ocr/update-check.json` with a timestamp
- **AND** subsequent checks within a 4-hour TTL SHALL use the cached version without fetching

#### Scenario: Cache expired

- **GIVEN** the cached result is older than 4 hours
- **WHEN** a human-facing command runs
- **THEN** a fresh fetch SHALL be made to the npm registry
- **AND** the cache SHALL be updated with the new result

#### Scenario: CI environment suppression

- **GIVEN** the `CI` environment variable is set
- **WHEN** a human-facing command runs
- **THEN** the update check SHALL be skipped entirely (no fetch, no cache read)

#### Scenario: Explicit suppression

- **GIVEN** the `OCR_NO_UPDATE_CHECK` environment variable is set
- **WHEN** a human-facing command runs
- **THEN** the update check SHALL be skipped entirely

#### Scenario: Network error resilience

- **GIVEN** the npm registry fetch fails (timeout, DNS error, network unreachable)
- **WHEN** the check runs
- **THEN** no notification SHALL be printed
- **AND** a cache entry with `latestVersion: null` SHALL be written to prevent repeated failed fetches within the TTL

#### Scenario: Fetch timeout

- **GIVEN** the registry does not respond within 3 seconds
- **WHEN** the fetch is in progress
- **THEN** the fetch SHALL be aborted via `AbortSignal.timeout(3000)`
- **AND** the check SHALL return null (no notification)
