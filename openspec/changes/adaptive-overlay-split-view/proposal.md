## Why

Raven currently shows responses and the live transcript as mutually exclusive tabs, forcing the user to switch views and lose conversational context when an answer arrives. A responsive split view will keep both sources visible during interviews while preserving a compact layout on narrower overlays.

## What Changes

- Add a wide overlay layout that displays the live transcript and Raven responses side by side.
- Use an approximately 45/55 initial split with a draggable divider and persisted divider position.
- Retain the existing tabbed presentation when the overlay is too narrow for two readable panes.
- Keep the response composer, quick actions, resize behavior, auto-scrolling, stealth protection, and mouse passthrough behavior compatible.
- Add deterministic layout and interaction tests for wide, narrow, resized, and restored states.

## Capabilities

### New Capabilities

- `adaptive-overlay-layout`: Responsive transcript/response presentation, divider resizing, and persisted split preference.

### Modified Capabilities

None.

## Impact

The overlay renderer, its resize state, persisted local settings, typed settings contracts, and overlay component tests are affected. No provider, transcription, capture, network, or cloud behavior changes, and no new dependency is required.
