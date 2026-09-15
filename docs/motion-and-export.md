# Motion and export

The organizing principle is **one scene, one clock, an explicit output range**.
Preview and export sample the same motion at the same times. A loop is a claim
about the whole composition returning together, not merely a playback button.

## Compose deliberately

1. Open a slider's motion button. Set its From and To values, choose Once,
   Bounce, or Repeat, and set its one-way duration. Add and play starts the
   proposal; opening the editor alone never changes the scene.
2. Use Timing group to match another motion or join an existing group. Changes
   to that group's duration, delay, easing, and mode affect its members. Choose
   Own timing to detach without changing the effective schedule. Phase stays
   individual so related motions can remain intentionally offset.
3. Open Capture. Choose Clip or Loop, set the range, drag or type the small playhead value, and preview. Clip stops at Out; Loop repeats the selected range.
   Pause resumes from the current position. Back to In starts the range again.
4. Set framing, output format, resolution, and frame rate. Export renders every
   frame at its exact time, regardless of live preview speed.

A Bounce's full cycle is twice its one-way duration. Full cycles of 4 and 6
seconds meet every 12 seconds. Common cycle uses that shared return when one
can be established; it does not silently alter the individual speeds. The
suggestion search uses hundredths of a second and a 60-second cap. Outside that
search, Fit motion is only a duration suggestion; the selected-range check is
what says whether the motions return together.

Loop diagnostics use the actual encoded duration (an integer number of frames).
They identify incomplete cycles, initial delays, one-time transitions, and jumps
from Repeat. Known circular parameters support full turns: layer rotation at
360 degrees and wave phase at 2π radians. The check is conservative for other
visual symmetries; a warning does not prevent exporting an intentional cut.

Sync beside the loop-join indicator is an explicit edit: it gives active motions a
shared eased Bounce across the selected range, preserving their value ranges
and individual phase offsets. Undo restores the original schedules. The motion
list's held and solo states also determine which motions participate in export.

The small image is a framing snapshot. The main canvas is the playback preview.
Help and detailed loop diagnostics live on the controls; there is no separate
timeline slider or explanatory caption blocks.
Output settings survive closing the panel during the current session; a new
document gets a new range. Motion groups are saved with the project. Export
preferences and the chosen clip range are currently session settings.

## Predictable editing

- One-time transitions reach and hold their exact endpoint. Seeking beyond an
  endpoint gives the same picture as playing through it. Play at a completed
  one-time composition starts it again.
- Stop rewinds the global clock and holds the starting pose. There is no second
  wall clock animating a supposedly stopped scene.
- Undo/Redo works from the Studio and with ⌘/Ctrl+Z and ⌘/Ctrl+Shift+Z.
  Ctrl+Y also redoes. Text fields retain native text undo while being edited.
- Scene and motion changes form up to 100 history steps per open document.
  Drags and numeric typing are grouped; playback and export samples never
  become undo steps. Undo restores the visible pose and pauses the clock.
- Loading or creating another project clears that document's history and the
  previous document's mute/solo state.

## Stable picture during interaction

Every view retains its full pixel grid during pan, zoom, and playback, including
Envelope, Contours, and Fringe ratio. Previously, automatic reduction to 35%
resolution widened the filter enough to erase the opening pattern's fine
crossing structure around both centers, creating large gray disks. Envelope
also switched to a different solver during interaction. The same pose now uses
the same solver and pixel grid while moving and at rest. Filtering remains
enabled: turning it off would introduce aliasing. Heavy scenes may draw fewer
frames per second, but playback advances by the full elapsed time, so a slow
frame does not change the authored duration. Export samples its own exact
timestamps independently of display cadence.

## Reliable export

The start is included and the end is excluded: frame `n` is sampled at
`start + n / fps`. Duration is rounded to a whole number of frames and displayed
before export. Duplicating a loop's first frame at its end would create a hitch.

Export freezes motion, audition settings, and framing, and suspends scene editing.
Each frame owns the canvas until its reader finishes. Shader and image builds
settle before capture. Setup failures, failed frames, encoder failures, and
cancellation all restore the original pose and playback state. Autosave does
not save temporary export frames.

PNG sequences go into a unique take subfolder, with six-digit frame names.
Cancelled sequences retain the partial take; failed file writes are aborted.
MP4 and WebM capability checks attempt an actual short encode at the selected
settings. Video files still accumulate in memory before download; streaming
long videos directly to disk remains a separate improvement.

## Print sheets

Open Capture, then Print. Choose A5, A4, A3, US Letter, US Legal, Tabloid, or a
custom size in millimetres. Orientation, DPI, margins, optional alignment marks,
and a black-ink override apply to every selected layer. Visible layers start
selected; hidden layers can also be included. The preview opens with all selected
sheets stacked in layer order on white. Switch to an individual sheet to inspect
its transparency over a checkerboard. Enlarge the preview and choose 100% to
scroll through the actual print pixels and check field alignment.

The overlay combines the full-resolution exported PNGs before display resizing.
Resizing each layer separately would average out fine stripes before their
overlap could reveal the moiré or an image field. Switching between the overlay
and individual sheets reuses these same PNGs. Fit mode downsamples the finished
overlay to the display resolution in stages to avoid false bands from browser
image scaling. The ZIP still contains the separate print sheets.

Export downloads one ZIP containing a separate transparent PNG per layer and
printing instructions. PNGs carry the chosen DPI. Use the selected paper size
and print at 100% or actual size. Disable fit to page, cropping, and borderless
enlargement so all sheets keep the same scale.

Opening Print freezes the source pose and framing for that dialog. Every sheet
fits the same world extent inside its margins, extending the view when the
paper has a different aspect ratio. A separate renderer uses the existing ink
solvers and emits coverage as alpha before colour conversion. Backgrounds and
margins are transparent; layer colours, opacity, expression fields, and image
fields are retained. White ink remains white ink. Print uses the physical
patterns without the Envelope, Contours, or Fringe ratio overlays and without
the screen's minimum stroke width. Original capture and live shaders keep
their existing path. Printing never writes the project, history, or transport.

Jobs above 8192 pixels per side or 24 million pixels per sheet are rejected with
a request to lower DPI or paper size. There is no silent rescaling. A cancelled
or failed job releases its offscreen renderer and does not download a partial
ZIP.

## Verification

- `npm run test:motion`: timing, mixed cycles, parameter units, transport,
  undo/redo, shared timing, persistence, and autosave isolation.
- `npm run test:export`: capture ownership, failures, cancellation, restoration,
  sequence files, image texture lifetime, codec lifecycle, print dimensions,
  PNG DPI metadata, ZIP structure, and print cleanup.
- `npm run test:print`: actual WebGPU alpha and edge colours, independent aligned
  sheets, expression/image/tiling support, unchanged live capture, and the print
  dialog's real ZIP download. Evidence goes to a temporary folder, or to
  `PRINT_EVIDENCE_DIR` when set.
- `npm run test:export:integration`: fresh headless Chrome with real WebGPU;
  repeated ordinary/image-field takes must match byte-for-byte, and MP4/WebM
  decode to the stated dimensions, frame count, rate, and duration. Requires
  Chrome and ffprobe on the host.
- `npm run zoo`: the existing 58 renderer golden-image cases.
- `npm run test:interaction`: real pan/wheel gestures retain the full pixel grid
  in plain, Envelope (table and chain), Contours, and Fringe ratio views; matching
  poses have identical pixels during interaction and at rest. The final frame
  of a pattern-type transition and its first export also match a settled redraw.
- `npm run build`: the actual TypeScript and production build check.

Manual checks also cover rewind/playhead editing, editing motion on an unselected
layer, accepting a 360° endpoint, composing a loop, undoing and redoing that
composition in one step, exporting a one-second 24-frame MP4, cancelling a
longer take, and reopening the panel with its settings retained.
