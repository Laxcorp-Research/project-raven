## Context

The overlay is one transparent, screen-sized Electron window containing a movable panel. The panel currently renders Responses and Transcript as exclusive tabs, starts at 480 px wide, and can already be resized horizontally. Transcript and response state are both owned by the existing overlay renderer, so a split view does not require a second BrowserWindow or duplicate provider state.

## Goals / Non-Goals

**Goals:**

- Keep transcript and response content visible simultaneously at a readable wide-panel size.
- Preserve compact tabs when screen or panel width is insufficient.
- Let the user resize the pane boundary and persist that preference locally.
- Preserve stealth content protection, click-through hit testing, scrolling, quick actions, and panel resize/drag behavior.

**Non-Goals:**

- Creating independently movable transcript and response windows.
- Changing transcription, AI generation, meeting detection, or provider behavior.
- Synchronizing layout preferences across devices.

## Decisions

1. **Use one adaptive panel.** At widths of at least 900 px and when a response exists, the content area becomes a two-column layout. Below the breakpoint, the existing tab UI remains. A second native window was rejected because it would duplicate focus, stealth, mouse-passthrough, and multi-monitor behavior.
2. **Auto-expand once when the first response arrives.** If the display can accommodate the split breakpoint, the panel grows to a target width of 1050 px and recenters. The existing side resize rails remain available afterward.
3. **Start at a 45/55 transcript-response ratio.** The divider clamps the transcript share to 32-58%, keeping both panes readable. The ratio is persisted as `overlaySplitRatio`; malformed or old values fall back to 0.45.
4. **Keep global controls below the content split.** Quick actions and the composer remain full-width, avoiding duplicate controls and preserving existing keyboard/focus behavior. Only the scrollable transcript and response regions are split.
5. **Extract pure layout calculations.** Breakpoint, ratio clamping, and target-width selection live in a small renderer helper with deterministic unit tests. Pointer interaction stays in the overlay component.

## Risks / Trade-offs

- [Automatic expansion could cover more meeting content] → Expand only once per overlay lifecycle, keep the panel draggable/resizable, and retain compact tabs when the display is too narrow.
- [A divider drag could interfere with click-through behavior] → Make only the narrow divider rail interactive and reuse the overlay's existing pointer-events boundary.
- [Long transcript or response content could force pane growth] → Apply `min-width: 0`, independent vertical scrolling, and bounded ratio clamping.
- [Saved values from a future or corrupt config could break layout] → Validate and clamp the ratio in both initialization and pointer updates.

## Migration Plan

Add an optional setting with a default of 0.45. Existing users need no migration and continue seeing tabs until the panel qualifies for split mode. Rollback removes the adaptive rendering and ignores the additive setting.

## Open Questions

None for the initial implementation.
