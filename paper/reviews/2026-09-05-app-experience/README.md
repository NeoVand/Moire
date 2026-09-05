# Moiré as a creative instrument

Historical audit; the subsequent implementation and validation are recorded in `docs/motion-and-export.md`.

Review date: September 5, 2026. This review combines hands-on use of the running app with a read-only examination of its product code. No application or compiler source was changed for this review.

**Product direction: let people compose the picture that appears between the layers.**

The canvas, restrained studio, real mathematical constructions, field previews and deterministic animation already give Moiré a distinctive identity. The largest opportunity is to help people discover a striking effect, control it deliberately, recover earlier discoveries, and finish an artwork they can share or remix.

## What I actually tried

- Ran the Vite app, then built a stable preview outside the repository so the author's ongoing source edits would not interrupt the review. The bundle built successfully; this was a runtime review, not a full typecheck or application test suite.
- Viewed the opening animated ring construction.
- Opened Projects → Open a preset and inspected the visual gallery.
- Loaded Rolling Terrain, opened its field editor, changed Amount from 6 to 2, and tried Cmd+Z. The amount stayed at 2.
- Created an Amount animation from 2 to 6, inspected its motion controls, switched to Loop, and inspected Capture's duration and seamless-loop claim. I did not export a video.
- Loaded Kagome Twist, inspected its tiling controls, switched to Envelope, and inspected Research.
- Cross-checked project replacement, persistence, shortcuts, motion and field infrastructure in the source.

The live review covered a desktop browser. It did not establish touch/mobile accessibility, frame-rate distributions, video-encoding reliability, or behaviour on other GPUs. Temporary preview loading and reload problems were local review-environment issues, not findings about the shipped app.

## Keep what already works

The full canvas is the right centre of gravity. Presets are real editable constructions, not illustrative thumbnails detached from the renderer. The field editor's preview explains the relationship between an invisible field and visible contours. Per-knob motion, shared timing, solo/mute, and deterministic capture are substantial foundations. Image-based fields and sharing a picture across two layers already exist; generic proposals to add those features would miss the real opportunity.

The scientific depth should remain available. Its most valuable everyday expression is an action that feels understandable before someone reads the mathematics.

## 1. Make exploration recoverable

This is the first priority. A small change can reorganize the entire picture, so experimentation needs an easy way back.

The live Amount edit did not respond to Cmd+Z, and no document undo/history implementation was found in the source. Browser session autosave preserves the latest state; it does not restore the previous branch. A preset replaces the working scene and closes the gallery. Named saved projects remain available, but that is a separate workflow.

Add gesture-level undo/redo and automatic checkpoints before replacing the scene. One continuous drag should create one history entry. Animation frames should never create history entries; changing the motion's definition should. A small thumbnail history would help people recognize the beautiful state they passed through, but basic reliable undo comes first.

Acceptance: change three controls, load another preset, then return to the precise original document, including its field and motion settings. Redo should restore the same sequence.

Relevant source: `src/store/project.ts`, `src/store/library.ts`, `src/components/PresetGallery.tsx`, `src/hooks/useShortcuts.ts`.

## 2. Give the first minute a deliberate discovery

The presets are compelling but live behind Projects → Open a preset. That route frames them as document management. The opening animation moves several parameters, which demonstrates range without making cause and effect easy to learn. Selecting a gallery card dismisses the shelf, so comparison requires reopening it.

Provide a direct, small entrance to three editable starting experiences:

- **Pull two patterns apart:** Twin Rings with visible centre handles.
- **Make a picture appear:** a supplied silhouette using the existing shared-picture workflow.
- **Bend a landscape:** a bump or dipole field with meaningful handles.

Each experience should already be the normal document. Show one consequential gesture and then let the user explore. Preserve the current construction before switching. Avoid a separate demo renderer or a lengthy tutorial wizard.

The first minute succeeds when someone can explain which gesture caused the visual change and make a variation they prefer.

Relevant source: `src/components/ProjectsDialog.tsx`, `src/components/PresetGallery.tsx`, `src/lib/presets.ts`, `src/components/FieldEditor.tsx`.

## 3. Make the emergent picture editable

Today the main editing unit is an individual layer. Moving a visible band requires finding the right changes to one or more carriers. In Rolling Terrain, the relationship becomes apparent in the field preview, but shaping the terrain still means working with an expression and two global values.

The mathematical separation for a compatible scalar pair is

\[
\xi_A=c+\tfrac12 d,\qquad \xi_B=c-\tfrac12 d.
\]

The difference is exactly d. It describes the designed fringe field; c controls the common carrier. This suggests two creative activities: **Shape** and **Fabric**.

A concrete journey: open a bump field; drag its centre and spread on the canvas; move a broad band into the composition; change the fine-line texture; let the texture slide while the broad pattern holds its position. The real-time renderer can support a first version without waiting for the paper's CPU compiler.

Begin with an aligned parallel pair and a shared field in a defined coordinate frame. Give the pair explicit ownership of that field. Add one centre handle and a depth/extent control. Render editable parameters as uniforms so dragging a handle does not regenerate the expression and rebuild the material. The existing 220 ms field-edit rebuild path would undermine a tactile interaction if each pointer movement changed source text.

Preserving the count difference preserves its contours, not necessarily all rendered pixels. Stroke-width conventions, carrier gradients, folds, harmonic content and clipping can change contrast. Changing from lines to rings should be a later, tested extension—not an initial blanket promise.

For a chosen recipe k, a phase adjustment changes the fringe phase by k·δφ. A least-change phase adjustment can make “grab a band” feasible. Keep the selected recipe stable during the gesture. Start with parallel pairs: the existing `phase` property is not a universal count offset; elsewhere it can mean a radial hole, a radius offset, or a wave angle.

Acceptance: the artist can move the broad pattern and the fine texture independently in the supported pair, undo both gestures, and animate those two relationships without manually coordinating several knobs.

Relevant source: `src/types/moire.ts`, `src/store/params.ts`, `src/components/MoireStage.tsx`, `src/components/FieldEditor.tsx`, `src/fields/emit.ts`, `src/gpu/composite.ts`.

## 4. Make motion finish reliably

The animation system already exists. The next improvement is dependable composition and closure, not another timeline.

I reproduced a specific mismatch. Set Rolling Terrain's Amount from 2 to 6 over six seconds, choose Loop, and open Capture. It states: “One whole cycle of everything moving, so this loops without a join.” The motion's numeric endpoint jumps from approximately 6 back to 2. The source confirms the issue:

```js
const a = createAnimator('layer.a.field.amount', {
  from: 2, to: 6, period: 6, mode: 'loop', ease: 'inOut'
});
motionSpan({animators: [a], timings: [], playOnLoad: false});
// { end: 6, seamless: true, empty: false }
sampleAnimator(a, [], 5.999); // 5.999999999925926
sampleAnimator(a, [], 6);     // 2
```

`motionSpan` checks common schedule periods, not visual continuity. A completed repeat can still jump. Rename that assertion until continuity or a known scene symmetry establishes closure. Then add a seam preview that juxtaposes frames just before and after the join, and a “Make this loop” action using bounce or valid periodic phase motion. Pixel comparison is a diagnostic, not a universal mathematical certificate.

New motion ranges should also begin gently. Clicking Animate Amount at value 2 proposed an endpoint of −40. A smaller meaningful excursion would make the first animation easier to control, while leaving the full range available.

Relevant source: `src/types/motion.ts:224`, `src/components/MotionPanel.tsx`, `src/components/CaptureDialog.tsx:407`, `src/store/transport.ts`.

## 5. Preserve the artwork while making the controls readable

Kagome Twist visibly shows through the translucent studio behind its tiny labels and tracks. The style is attractive on a quiet image but loses clarity over a dense construction.

Keep the compact dark studio. Give its control surface enough opacity that artwork cannot compete with labels; strengthen secondary-text contrast and enlarge the most important hit targets. Expose selected/toggled states to assistive technology. In the live accessibility tree, toggling Envelope changed the image without an announced toggle state.

Source review also found mouse-only slider drag handling and shortcuts that do not filter Meta/Ctrl, so a standard shortcut can trigger a scene action. Verify keyboard and pointer input deliberately. Editable numeric values are a useful existing alternate path, but do not make a track itself accessible.

Relevant source: `src/components/Studio.tsx`, `src/components/ui/Slider.tsx`, `src/components/ui/IconButton.tsx`, `src/hooks/useShortcuts.ts`.

## 6. Let a finished work carry its construction

Image/video export and complete JSON export already exist separately. Give the author one way to deliver the artwork with its editable recipe and title. A local package is a small first step; a remix link can come later if distribution warrants it. This would let someone move from seeing a surprising image to exploring how it works.

The immediate sequence I recommend is: recoverable exploration and readable controls; a direct entrance to the existing discoveries; one paired-field gesture; accurate loop handling; then a held-out evaluation of how quickly someone can make and finish an intentional variation. The most distinctive milestone is the paired field with direct handles. The most urgent foundation is undo.
