## MODIFIED Requirements

### Requirement: Address Feedback Popover

The dashboard SHALL provide a capability-aware "Address Feedback" action on review round pages that supports both in-dashboard execution and clipboard-based terminal workflows.

#### Scenario: AI CLI available (run mode) — dual actions

- **GIVEN** `aiCli.active` is truthy (an AI CLI adapter is detected)
- **WHEN** the user clicks "Address Feedback"
- **THEN** the popover SHALL display TWO action buttons side by side:
  1. **"Run in Dashboard"** — spawns the command via Socket.IO `command:run` and navigates to `/commands` (existing behavior, with two-step confirmation flow)
  2. **"Copy to Terminal"** — copies the `/ocr:address <path>` slash command (with optional notes) to the clipboard
- **AND** the command preview SHALL show the slash command format (e.g., `/ocr:address .ocr/sessions/.../final.md`)
- **AND** the "Copy to Terminal" button SHALL show a "Copied!" confirmation that auto-dismisses after 2 seconds

#### Scenario: Copy to Terminal with notes

- **GIVEN** the user has entered text in the notes textarea
- **WHEN** the user clicks "Copy to Terminal"
- **THEN** the copied text SHALL include the slash command path followed by `NOTES:` and the trimmed notes text on a new line

---

## ADDED Requirements

### Requirement: Round Detail Page Status Dropdown

The review round detail page SHALL include an inline triage status dropdown next to the round title, allowing users to update triage status without navigating back to the reviews table.

#### Scenario: Status dropdown display

- **GIVEN** the user is viewing a round detail page (`/sessions/:id/rounds/:round`)
- **WHEN** the page loads
- **THEN** a `<select>` dropdown SHALL appear next to the "Round N" title
- **AND** the dropdown SHALL show the current triage status (defaulting to `needs_review` if no status is set)
- **AND** the available options SHALL be: Needs Review, In Progress, Changes Made, Acknowledged, Dismissed

#### Scenario: Update status from round detail

- **GIVEN** the round detail page is displayed
- **WHEN** the user selects a new status from the dropdown
- **THEN** the client SHALL call `useUpdateRoundStatus()` mutation which sends `PATCH /api/rounds/:id/progress` with the new status
- **AND** the dropdown SHALL reflect the new status immediately (optimistic update via React Query)

#### Scenario: Consistency with reviews table

- **GIVEN** the user updates status on the round detail page
- **WHEN** the user navigates back to the reviews table
- **THEN** the reviews table SHALL show the updated status for that round
