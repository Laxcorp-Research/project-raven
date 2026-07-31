## ADDED Requirements

### Requirement: Responsive simultaneous transcript and responses
Raven SHALL display the live transcript and AI responses simultaneously in one overlay when the panel is wide enough, and SHALL retain the existing mutually exclusive tabs when the panel is too narrow or no response exists.

#### Scenario: Wide overlay with an answer
- **WHEN** the overlay is at least the split-view breakpoint and an AI response exists
- **THEN** transcript and response panes are visible side by side with independent vertical scrolling

#### Scenario: Compact overlay
- **WHEN** the overlay is narrower than the split-view breakpoint
- **THEN** Raven displays the existing Responses and Transcript tabs without horizontally compressing both panes

#### Scenario: First response on a wide display
- **WHEN** the first response arrives and the display can accommodate the preferred split width
- **THEN** Raven expands and recenters the panel once so the simultaneous view becomes available

### Requirement: Adjustable persisted pane ratio
Raven SHALL provide an interactive divider between transcript and response panes, constrain both panes to readable widths, and persist the selected ratio locally.

#### Scenario: Divider adjustment
- **WHEN** the user drags the divider in split view
- **THEN** both panes resize continuously within the supported ratio bounds

#### Scenario: Overlay reopened
- **WHEN** Raven opens after the user previously adjusted the divider
- **THEN** Raven restores the validated saved ratio

#### Scenario: Invalid saved ratio
- **WHEN** the stored ratio is missing, non-numeric, or outside supported bounds
- **THEN** Raven uses the default 45/55 transcript-response split

### Requirement: Overlay behavior compatibility
The adaptive split view SHALL preserve overlay stealth protection, mouse passthrough outside interactive regions, panel movement and resizing, transcript updates, response streaming, quick actions, and question input.

#### Scenario: Live response while transcript updates
- **WHEN** transcription and response streaming occur concurrently in split view
- **THEN** each pane continues updating and scrolling independently while the shared controls remain usable
