// @ts-nocheck — TSL node types do not compose through helpers.
import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  Loop,
  dFdx,
  dFdy,
  int,
  length,
  screenCoordinate,
  screenSize,
  vec2,
  vec3,
  vec4,
  float,
  round,
  uniform,
  mix,
  max,
  min,
  pow,
  smoothstep,
  step,
  uniformArray,
  wgslFn,
  texture,
  uv,
  floor,
  fract,
  dot,
  log2,
  atan,
} from 'three/tsl';
import {
  FIELD_NONE,
  MAX_LAYERS,
  type FieldSpec,
  type PatternLayer,
  type PatternType,
} from '../types/moire';
export { ENVELOPE_TAPS } from '../types/moire';
import {
  curveIndexDir,
  curvePhase,
  lineIndexDir,
  linePhase,
  phaseDistWgsl,
  radialIndexDir,
  radialLinePhase,
  ringHit,
  ringIndexDir,
  ringTrio,
} from './inverse.wgsl';
import { gridDistance, latticeCellWgsl } from './lattice.wgsl';
import { tilingTable, tilingIndex, BIN_REACH } from './tilings';
import { layerMorph } from './typeMorph';
import { compileField, type CompiledField } from '../fields/expr';
import { fieldFunction } from '../fields/expr.wgsl';

// The paper accent, converted by THREE.Color into the renderer's linear
// working space so the overlay matches the printed #C81E5A.
const ACCENT_LINEAR = new THREE.Color('#C81E5A');

export function patternTypeCode(type: PatternType): number {
  switch (type) {
    case 'straight-lines':
      return 0;
    case 'radial-lines':
      return 8;
    case 'concentric-circles':
      return 1;
    case 'concentric-squares':
      return 2;
    case 'concentric-triangles':
      return 3;
    case 'concentric-polygons':
      return 4;
    case 'grid-square':
      return 5;
    case 'grid-hex':
      return 6;
    case 'grid-triangle':
      return 7;
    case 'curve-wave':
      return 9;
    case 'curve-parabola':
      return 10;
    case 'curve-hyperbola':
      return 11;
    case 'curve-spiral':
      return 12;
    case 'curve-log':
      return 13;
    // The tiling sits above the curves so the curve dispatch stays a
    // contiguous `type - 9` block; the "is a tiling" gates test > 13.5.
    case 'tiling-periodic':
      return 14;
    default:
      return 1;
  }
}

/**
 * The tiling catalogue, as two uniform arrays every slot indexes into.
 *
 * The table is static, so it is uploaded once and never touched again:
 * choosing a different tiling moves a start and a count in one layer's slot.
 * That is what keeps a gallery clickable — no pipeline rebuild, no upload,
 * and the same numbers the CPU mirror walks.
 */
const TILE_TABLE = tilingTable();
export function createLayerSlot() {
  return {
    active: uniform(0),
    type: uniform(1),
    color: uniform(new THREE.Color(0x000000)),
    position: uniform(new THREE.Vector2(0, 0)),
    rotation: uniform(0),
    opacity: uniform(1),
    spacing: uniform(6),
    thickness: uniform(3.5),
    phase: uniform(0),
    offset: uniform(new THREE.Vector2(0, 0)),
    rotationOffset: uniform(0),
    sides: uniform(6),
    vertexSize: uniform(2.5),
    drawEdges: uniform(1),
    scale: uniform(new THREE.Vector2(1, 1)),
    lineCount: uniform(8),
    bend: uniform(0),
    frequency: uniform(1),
    fieldAmount: uniform(0),
    fieldScale: uniform(200),
    // An image field's dials, all uniforms so none of them rebuilds: how the
    // picture sits on the layers (0 plain, 1 halves, 2 weave), which side of a
    // shared picture this is, the mip level its edges are read at, the weave's
    // seed, and the weave's cell length in pitches.
    fieldMode: uniform(0),
    fieldRole: uniform(1),
    fieldSoften: uniform(0),
    fieldSeed: uniform(1),
    fieldCell: uniform(1),
    typeFrom: uniform(1),
    morph: uniform(1),
    // Where this layer's tiling keeps its bins, how many per axis, and its
    // translation cell in world units before the layer's stretch.
    tileBinBase: uniform(0, 'int'),
    tileBins: uniform(1, 'int'),
    /** Face fill: how much, and the inset it corresponds to in world units. */
    tileFill: uniform(0),
    tileFillEdge: uniform(0),
    tileCell: uniform(new THREE.Vector4(1, 0, 0, 1)),
  };
}

export type LayerSlot = ReturnType<typeof createLayerSlot> & {
  tiling: ReturnType<typeof createTilingNodes>;
};

/**
 * Compiled programs, keyed by source.
 *
 * Parsing is cheap, but the renderer asks for a layer's program on every dirty
 * frame — to decide whether the shader it has is still the right one — and a drag
 * is hundreds of those. A source that does not compile comes back as null rather
 * than throwing: the editor reports the error, and the canvas keeps drawing.
 */
const programCache = new Map<string, CompiledField | null>();

export function compileFieldCached(source: string): CompiledField | null {
  const key = source.trim();
  if (!key) return null;
  if (!programCache.has(key)) {
    const result = compileField(key);
    programCache.set(key, result.ok ? result : null);
  }
  return programCache.get(key) ?? null;
}

/**
 * The expression a layer's shader has to be built for, or `''` for no field.
 *
 * A field with no amount is no field: it displaces nothing, so it should not
 * cost a shader either. The amount itself stays a uniform, so dragging that
 * slider never rebuilds anything.
 */
export function fieldSource(field: FieldSpec | undefined): string {
  const spec = field ?? FIELD_NONE;
  if (spec.amount === 0) return '';
  if (spec.image) return imageKey(spec.image);
  const source = spec.source.trim();
  return source && compileFieldCached(source) ? source : '';
}

/**
 * An image field's key, as the material's "source": a new image is a new
 * shader exactly as a new expression is. Hashed once per data URL, because the
 * renderer asks on every dirty frame.
 */
const imageKeys = new Map<string, string>();
function imageKey(data: string): string {
  let key = imageKeys.get(data);
  if (!key) {
    let h = 2166136261;
    for (let i = 0; i < data.length; i++) {
      h ^= data.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    key = `image:${data.length}:${h.toString(16)}`;
    if (imageKeys.size > 64) imageKeys.clear();
    imageKeys.set(data, key);
  }
  return key;
}

/** An image as a field: its texture, its pixel size, and its height over its width. */
export interface ImageField {
  texture: THREE.Texture;
  width: number;
  height: number;
  aspect: number;
}

/** What a slot's field is built from: an unrolled expression, an image, or nothing. */
export type FieldProgram = CompiledField | ImageField | null;

export function isImageField(program: FieldProgram): program is ImageField {
  return !!program && 'texture' in program;
}

function writeField(slot: LayerSlot, field: FieldSpec | undefined) {
  const spec = field ?? FIELD_NONE;
  // Muting keeps the compiled program and zeroes the uniform, so the toggle is
  // instant where clearing the source would be a rebuild.
  slot.fieldAmount.value = fieldSource(field) && spec.enabled !== false ? spec.amount : 0;
  slot.fieldScale.value = spec.scale || 200;
  slot.fieldMode.value = spec.mode === 'halves' ? 1 : spec.mode === 'weave' ? 2 : 0;
  slot.fieldRole.value = spec.role ?? 1;
  slot.fieldSoften.value = Math.max(0, spec.soften ?? 0);
  slot.fieldSeed.value = spec.seed ?? 1;
  slot.fieldCell.value = Math.max(0.05, spec.cell ?? 1);
}

export function createCameraUniforms() {
  return {
    zoom: uniform(1),
    // The interaction buffer's scale (1 at rest, down the ladder while a hand
    // is on something). `zoom` already includes it, so `pixel` is the BUFFER
    // pixel; `pixel * scale` is the pixel at rest. Everything that sets the
    // picture's MEAN -- the hairline floor, the ramp inside an integral, the
    // pooling weight -- is measured at rest, so a smaller buffer changes the
    // blur and nothing else; only the anti-aliasing ramp of a drawn edge and
    // the pooling box follow the buffer. Before this, thin strokes darkened
    // and the pooled share jumped at every ladder step: the zoom flashed.
    scale: uniform(1),
    pan: uniform(new THREE.Vector2(0, 0)),
    background: uniform(new THREE.Color(0xffffff)),
  };
}

export type CameraUniforms = ReturnType<typeof createCameraUniforms>;

/**
 * The envelope view: the fringe field itself, rather than the strokes that carry
 * it.
 *
 * The fringe theorem averages ink over a neighbourhood small enough that the
 * index differences are constant but large enough that the carrier completes a
 * period. There are two ways to sweep such a neighbourhood, and the stack decides
 * which one is available.
 *
 * Advancing every family's phase together by one of its own periods holds every
 * index difference fixed exactly while each carrier completes exactly one cycle.
 * That is not a blur: there is no kernel, in pixels or in world units, nothing is
 * sampled off-centre, and a uniform grid integrates a periodic integrand exactly
 * but for harmonics above `taps`. Tens of taps land well inside a colour step.
 *
 * The alternative is to sweep the honest thing — a translation of the whole stack,
 * which moves each family's index by its component along that family's normal.
 * That is geometrically exact where the phase sweep is only bookkeeping, and it is
 * unusable: the taps then sample a two-dimensional disc for a stroke that covers a
 * few percent of it, so a few of the taps carry the answer and the rest carry
 * noise. Sixty-four of them leave the carrier standing and the fringes mottled.
 * The phase sweep's fiction is what makes it exact.
 *
 * What makes it affordable is that the sweep never re-solves. Each layer is solved
 * once, for the three nearest members of its family, and a tap slides that triple
 * by an offset — a couple of instructions instead of a search. Only the lattices
 * resample, and a lattice is a closed-form cell lookup.
 *
 * `sweep` is 0 when the view is off, which collapses the loop to a single tap at
 * zero phase: the ordinary render, bit for bit.
 */
export function createViewUniforms() {
  return {
    taps: uniform(1, 'int'),
    sweep: uniform(0),
    contrast: uniform(1),
    // THE PIXEL AS A POOLING OBSERVER. Raised by the renderer when some
    // visible family's pitch falls under a few buffer pixels: the plain
    // render then blends, per pixel, toward the closed-form sweep run as a
    // two-pixel box window over each family (rate 2·pixel/spacing, at most
    // one period), which is the window multiplier theorem doing the
    // anti-aliasing. A carrier the pixel cannot resolve averages to its
    // duty, a beat that is slow at the pixel's scale survives as the tent,
    // and nothing beats against the buffer's own comb. Point-sampling a
    // family at two pixels a period draws the star of hyperbolae that
    // concentric rings make against a pixel grid, and the hairline floor
    // then inks the whole pitch black; both were the zoom-out artifacts.
    // Scalar stacks only, like the exact sweep it reuses.
    pool: uniform(0),
    // 1 while a hand is on the view. The exact envelope then draws by the
    // synthesis below instead of the chain: the same terms, alias-free at
    // any buffer, and cheap enough that the stream can start full size.
    stream: uniform(0),
    // 1 when the exact envelope of a pair reads its tents from the table the
    // renderer draws each frame (see buildTableColorNode) instead of running
    // the chain per pixel.
    table: uniform(0),
    // A flat exposure shift after the contrast expansion, for reading a fringe
    // field whose pivot sits too dark or too bright to print well.
    lift: uniform(0),
    // Fade the envelope toward its pivot where the heterodyne ratio is past 1/4.
    // Where the two carriers are too different to fringe, Phi(D) is a faithful
    // but carrier-fine stripe field that reads as "the average failed"; masking
    // it makes the view assert fringes only where fringes exist. 0 shows the
    // raw Phi(D); 1 masks the out-of-regime region entirely.
    envMask: uniform(0),
    // The ratio view: slot indices of the two layers to compare, ranked on the
    // CPU so the shader never orders layers, or -1 for none. `ratio` swaps the
    // composite for the heat map and widens the solver guard the way `sweep`
    // does, since the ratio needs the phase measured everywhere, not just under
    // the strokes.
    ratio: uniform(0),
    ratioA: uniform(-1, 'int'),
    ratioB: uniform(-1, 'int'),
    ratioC: uniform(-1, 'int'),
    contours: uniform(0),
    contourW: uniform(1.6),
    contourBand: uniform(0.4),
    /** How much of the heat map covers the composite: 1 replaces, less overlays. */
    ratioBlend: uniform(1),
    /** Centre of the map's marked boundary. 1/4 is the theory's line. */
    ratioThreshold: uniform(0.25),
    // Two-lattice (twist) mode: the slot index of the reference lattice, set
    // only when no scalar layer is visible. Every other lattice matches its
    // generators to the reference's and rides the same tap schedule, so the
    // twist moire's two slow characters survive the average in lockstep.
    latA: uniform(-1, 'int'),
    // The lattice whose beat the contour overlay draws: the twist partner when
    // latA is set, else the topmost lattice beating against the ranked scalar.
    // A lattice indexes members by a pair of integers, so its fringe skeleton
    // is not the scalar scan's winning character — it has to be read off the
    // generator matching the sweep itself uses.
    latB: uniform(-1, 'int'),
    // The measurement's lattice ranking — the topmost two whenever any view
    // measures the stack, the ratio map included — independent of latA/latB,
    // which drive the sweep's twist matching and the overlay's channels.
    scanLatA: uniform(-1, 'int'),
    scanLatB: uniform(-1, 'int'),
    // The SOLO pivot: with two or more layers the envelope grades about the
    // per-pixel independent-phase mean, so contrast amplifies exactly the
    // beat correlations — but a sole layer has mean == pivot identically
    // (nothing to correlate with), which would leave the contrast dial dead
    // and its drift structure flat. A single family's duty drift IS its
    // picture (a walking family's bunching, the fold rung's level sets), so
    // with exactly one visible layer the grading falls back to a constant
    // pivot: the layer's nominal coverage, computed in writeSlots.
    pivotConst: uniform(new THREE.Color(0xffffff)),
    soloPivot: uniform(0),
    // Per-frame deviation LICENSES, one per ranked pair: (on, |a|, |b|).
    // A higher-order schedule deviation is granted only to the character the
    // pair's NOMINAL pitch ratio certifies as a global rational lock (the 1D
    // convergent merit of the two spacings, computed in writeSlots). The
    // per-pixel scan still finds every local station — the ratio view maps
    // them — but holding a different schedule in every pocket quilts the
    // envelope with seams between textures (a dipole-warped 2.3:1 line pair
    // tiled the frame with (2,-1)/(5,-2)/(3,-1) pockets and drew circular
    // rims around each), so deviation identity is a decision of the STACK,
    // never of the pixel. First-order sum/difference beats bypass the
    // license: their handover is the originally tuned per-pixel fade.
    licAB: uniform(new THREE.Vector3(0, 0, 0)),
    licAC: uniform(new THREE.Vector3(0, 0, 0)),
    licBC: uniform(new THREE.Vector3(0, 0, 0)),
    // The EXACT sweep: for an all-scalar stack the enveloped average is a
    // one-dimensional integral of piecewise-cubic profiles whose corner
    // positions are known in closed form from each phase trio, so it is
    // segmented and integrated exactly (Gauss-4 per segment) instead of
    // tapped. No tap noise, no tap-adequacy limit: a rate-q schedule
    // contributes q times the corners instead of needing taps >= 8q.
    // writeSlots raises this only when the envelope is on and every visible
    // layer (morph sources included) carries a scalar index; lattices keep
    // the tap loop, whose cell resampling has no 1-D closed form.
    exactSweep: uniform(0),
    // The observer's front end. 0 averages the drawing itself (a linear
    // observer); 1 averages its square (a square-law detector) -- the
    // observer theorem's N∘I with N the square: the same characters, other
    // amplitudes, and a duty null that reopens on the anti-alias ramps. The
    // pivot follows it: E[c²] over independent phases, composed exactly from
    // each layer's (E[α], E[α²]) by `pivotStep` in sweepStack.
    observer: uniform(0),
  };
}

/** Spaces a second phase against the first without ever repeating. */
const GOLDEN = 0.6180339887498949;

export type ViewUniforms = ReturnType<typeof createViewUniforms>;

/**
 * The deepest inset a layer's edge distance can be trusted to, in units of
 * `spacing`. For a catalogue tiling it is the bins' own reach; for the three
 * closed-form grids it is the face's incircle, which their solvers report
 * exactly: half a cell for the square, the apothem for the hexagon, and a
 * third of the height for the triangle.
 */
function fillReach(type: PatternType): number {
  if (type === 'grid-square') return 0.5;
  if (type === 'grid-hex') return 0.86602540378;
  if (type === 'grid-triangle') return 0.28867513459;
  return BIN_REACH;
}

export function writeLayerSlot(slot: LayerSlot, layer: PatternLayer | undefined) {
  if (!layer || !layer.visible) {
    slot.active.value = 0;
    return;
  }
  slot.active.value = 1;
  slot.type.value = patternTypeCode(layer.type);
  slot.color.value.set(layer.color);
  slot.position.value.set(layer.position.x, layer.position.y);
  slot.rotation.value = (layer.rotation * Math.PI) / 180;
  slot.opacity.value = layer.opacity;
  slot.spacing.value = layer.spacing;
  slot.thickness.value = layer.thickness;
  slot.phase.value = layer.phase;
  slot.offset.value.set(layer.offset.x, layer.offset.y);
  slot.rotationOffset.value = layer.rotationOffset;
  slot.sides.value = layer.sides;
  slot.vertexSize.value = layer.vertexSize ?? 0;
  slot.drawEdges.value = layer.drawEdges === false ? 0 : 1;
  slot.scale.value.set(layer.scale?.x ?? 1, layer.scale?.y ?? 1);
  slot.lineCount.value = layer.lineCount ?? 8;
  slot.bend.value = layer.bend ?? 0;
  slot.frequency.value = layer.frequency ?? 1;
  const range = TILE_TABLE.ranges[tilingIndex(layer.tiling)];
  slot.tileBinBase.value = range.binBase;
  slot.tileBins.value = range.bins;
  slot.tileFill.value = layer.tileFill ?? 0;
  // The inset the fill slider asks for, in world units. It runs from the
  // deepest distance the layer's ink can report down to zero, so the slider
  // sweeps from "only the largest faces" through to solid.
  slot.tileFillEdge.value = (1 - (layer.tileFill ?? 0)) * fillReach(layer.type) * layer.spacing;
  slot.tileCell.value.set(
    range.a1[0] * layer.spacing,
    range.a1[1] * layer.spacing,
    range.a2[0] * layer.spacing,
    range.a2[1] * layer.spacing
  );
  writeField(slot, layer.field);
  const morph = layerMorph(layer.id);
  if (morph) {
    slot.typeFrom.value = patternTypeCode(morph.from);
    slot.type.value = patternTypeCode(morph.to);
    slot.morph.value = morph.t;
  } else {
    slot.typeFrom.value = slot.type.value;
    slot.morph.value = 1;
  }
}

/**
 * The whole composite, as one fragment function.
 *
 * `fields` is per slot and parallel to `slots`: the expression that slot's field
 * is compiled from, unrolled into the shader, or null for no field. It is the one
 * thing here that is baked rather than uniform, so changing an expression means a
 * new material — which is what `MoireRenderer` debounces. Layer count, colours,
 * types and every slider stay uniforms, and none of them rebuild anything.
 */
export function buildColorNode(
  camera: CameraUniforms,
  view: ViewUniforms,
  slots: LayerSlot[],
  fields: FieldProgram[] = [],
  table: THREE.Texture | null = null
) {
  return Fn(() => {
    const centered = screenCoordinate.sub(screenSize.mul(0.5));
    const world = vec2(centered.x, centered.y.negate()).div(camera.zoom).add(camera.pan);
    const pixel = float(1).div(max(camera.zoom, float(0.08)));

    // The character scan exists for three consumers: the envelope's sweep
    // schedule (taps > 1), the ratio view, and the contour overlay. A plain
    // render reads none of it — one tap at zero sweep never consults a rate,
    // and every eta consumer in `grade` sits behind one of these toggles —
    // yet the reduction, the candidate merits, and the lattice matching had
    // been running per pixel unconditionally, and together they tripled the
    // plain render (22 → 66 ms per 2.7 Mpx frame on Apple Metal). The gate
    // is a view uniform, so the branch is uniform control flow; everything
    // that needs a screen derivative stays outside it.
    const scanOn = view.taps
      .greaterThan(1.5)
      .or(view.ratio.greaterThan(0.5))
      .or(view.contours.greaterThan(0.5));

    const pixelRest = pixel.mul(camera.scale.max(0.05));
    const solved = solveLayers(slots, fields, view, world, pixel, pixelRest, scanOn);
    const coords = latticeCoords(solved);
    const scan = scanCharacters(view, solved, coords, scanOn);
    const lattice = matchLattices(view, solved, scan, coords, scanOn);
    const swept = sweepStack(camera, view, solved, lattice.coh, scan, scanOn, table);
    return grade(camera, view, swept.mean, swept.pivot, scan.etaAll, scan.etaEnv, [
      { val: scan.beatVal, rate: scan.beatRate, eta: scan.eta, on: float(1) },
      ...lattice.chars,
    ]);
  })();
}

/**
 * The first three rings of the dual lattice, in generator coordinates, with
 * each kind's ink weight `[square, hexagon, triangle]` — 1 marks a kind's
 * fundamental families, a mild penalty its weaker-but-real harmonics, and 4
 * a combination the kind has no ink at, kept only so the candidate list
 * stays uniform. One table, three consumers: the sweep's candidate
 * matching, the twist contour channels, and the eta measurement.
 */
const DUAL_RING = [
  { a: 1, b: 0, pens: [1.0, 1.2, 1.0] },
  { a: 0, b: 1, pens: [1.0, 1.2, 1.0] },
  { a: 1, b: 1, pens: [1.3, 1.2, 1.0] },
  { a: 1, b: -1, pens: [1.3, 1.0, 1.3] },
  { a: 2, b: 1, pens: [4.0, 1.0, 1.3] },
  { a: 1, b: 2, pens: [4.0, 1.0, 1.3] },
  { a: 2, b: 0, pens: [1.25, 1.15, 1.25] },
  { a: 0, b: 2, pens: [1.25, 1.15, 1.25] },
  { a: 2, b: 2, pens: [4.0, 1.15, 1.25] },
];

/** The pen for a combination given a slot's type node (square 5, hex 6, tri 7). */
function kindPen(typeNode, pens) {
  const isSquare = float(1).sub(step(5.5, typeNode));
  const isHexK = step(5.5, typeNode).mul(float(1).sub(step(6.5, typeNode)));
  const isTri = step(6.5, typeNode);
  return isSquare.mul(pens[0]).add(isHexK.mul(pens[1])).add(isTri.mul(pens[2]));
}

// Per-lattice generator index coordinates and their EXACT screen gradients —
// each combination's continuous index is linear in the layer point, so no
// derivative estimate is involved. Computed unconditionally for every slot so
// the screen-space derivatives downstream stay in uniform control flow; a
// non-lattice slot yields garbage coordinates nothing reads.
function latticeCoords(solved) {
  return solved.map(({ cell, local, shift }) => {
    // step keeps the guard non-zero at d = 0 (a non-lattice slot's empty
    // cell), where sign() would return 0 and divide by zero.
    const safe = (d) => step(0, d).mul(2).sub(1).mul(d.abs().max(1e-6));
    const perp1 = vec2(cell.w.negate(), cell.z);
    const perp2 = vec2(cell.y.negate(), cell.x);
    const b1 = perp1.div(safe(cell.xy.dot(perp1)));
    const b2 = perp2.div(safe(cell.zw.dot(perp2)));
    // A lattice spends its field as a translation along generator 1 (the
    // tap resample advances by uLat + shift), so the field belongs to the
    // first generator's continuous index — without it, a field-warped grid
    // against its unmodulated twin reads as no beat at all.
    const xi1 = local.dot(b1).sub(shift);
    const xi2 = local.dot(b2);
    return {
      x1: xi1,
      x2: xi2,
      g1: vec2(dFdx(xi1), dFdy(xi1)),
      g2: vec2(dFdx(xi2), dFdy(xi2)),
    };
  });
}

// Solved once per layer, before the sweep. Everything the tap loop needs is in
// here, so a tap costs arithmetic rather than a search — and a hidden layer
// costs nothing, because the whole solve sits under the same branch that
// decides whether the layer draws at all.
function solveLayers(slots, fields, view, world, pixel, pixelRest, scanOn) {
  return slots.map((slot, index) => {
    const local = vec2(0).toVar();
    const halfT = float(0).toVar();
    const aa = float(0).toVar();
    // The ramp at rest, for the integrals (envelope, pooling pivot): a ramp
    // that widened with the buffer drained the beat out of the enveloped
    // average while zooming, and snapped back when the buffer settled.
    const aaRest = float(0).toVar();
    const cell = vec4(0).toVar();
    const shift = float(0).toVar();
    const phase = vec4(0).toVar();
    const phaseFrom = vec4(0).toVar();
    // The layer's continuous-index gradient in SCREEN space, closed form for
    // every scalar family. Direction comes from the family's own phase
    // gradient (inverse.wgsl's *IndexDir twins), magnitude from the member gap
    // the phase sample measured — so the estimate takes no screen derivative.
    // It cannot: a derivative of the fractional index is Nyquist-limited, and
    // once a member spans under two pixels it aliases, which is how the
    // walking families it once served grew the handover quilt.
    const sgrad = vec2(0).toVar();
    // The nearest member the ring solve found, which its direction is built
    // from: a walking member's facet normal lives in that member's own frame.
    const ringN = float(-1).toVar();
    // Code 14 joins the 5..7 grids: a tiling is a lattice, indexed by a pair
    // of integers, so every lattice path downstream takes it unchanged.
    const isLattice = slot.type
      .greaterThan(4.5)
      .and(slot.type.lessThan(7.5))
      .or(slot.type.greaterThan(13.5));

    If(slot.active.greaterThan(0.5), () => {
      const c = slot.rotation.cos();
      const s = slot.rotation.sin();
      local.assign(
        vec2(
          c.mul(world.x).add(s.mul(world.y)),
          s.negate().mul(world.x).add(c.mul(world.y))
        ).sub(slot.position)
      );

      // The hairline floor in REST pixels: the same widening while a hand is
      // on the zoom as after it settles, so the mean ink does not follow the
      // buffer. The drawn edge's ramp follows the buffer, which it must, and
      // a ramp is mean-preserving. The floor exists so a sparse thin line
      // survives the screen; it never takes more than 0.15 of the pitch, so
      // a fine family keeps its true duty instead of inking its pitch black,
      // continuously in the zoom, with no hand-over to carry.
      const floorCap = slot.spacing.abs().mul(0.15);
      const floorW = mix(pixelRest.mul(1.15), min(pixelRest.mul(1.15), floorCap), step(float(1e-3), slot.spacing.abs()));
      halfT.assign(max(slot.thickness.mul(0.5), floorW));
      aa.assign(pixel.mul(0.7));
      aaRest.assign(pixelRest.mul(0.7));
      // How exactly the phase must be measured depends on who consumes it.
      // The plain render only asks whether a member sits within the stroke, so
      // the rotated-ring scan may stop at the FIRST member that close
      // (`accept`) and prove the rest away (`reject` at the stroke edge). The
      // envelope, the ratio view, and the contours consume the phase itself —
      // the residual trio and the measured local gap — so there `accept` must
      // drop to zero and `reject` widen to a whole pitch: an early exit hands
      // back a member that is merely close enough, and where a rotating family
      // crowds (past radius ≈ spacing/θ the ring index turns non-monotonic and
      // several rings pass near every point) the true neighbours then measure
      // NEARER than it, are rejected as impossible, and the gap silently falls
      // back to the nominal spacing — the sweep averages over the wrong period
      // and the carrier survives as sector-shaped hash. With the exact argmin
      // the neighbour trio is honest by construction.
      const needPhase = max(max(view.sweep, view.pool), max(view.ratio, view.contours));
      const accept = max(halfT.sub(aa), float(0)).mul(step(needPhase, float(0)));
      const reject = max(halfT.add(aa), needPhase.mul(slot.spacing));

      // A field is a displacement of the layer's *index*: `shift` many members,
      // wherever you stand. That is the one description every family shares, and
      // it is what makes the fringes against an unmodulated twin the level sets
      // of the field. Each family then spends it in its own currency — phase for
      // the level-set families, a rotation for the radial fan, a translation
      // along a generator for the lattices.
      //
      // The expression is unrolled into this shader rather than interpreted from
      // uniforms, so a layer with no field emits no field code at all — not a
      // branch around it, nothing — and a layer with one pays for its own
      // arithmetic and no dispatch.
      const shiftGrad = vec2(0).toVar();
      const program = fields[index];
      if (isImageField(program)) {
        // An image as the field: its darkness, read in layer coordinates over
        // a box `fieldScale` wide with the image's own aspect, zero outside
        // it, at the mip level `fieldSoften` asks for. Sampled at an explicit
        // level, so the read needs no uniform control flow.
        //
        // The shift's gradient is deliberately NOT reported. The stroke is a
        // Euclidean band, its width divided by the index gradient, so a
        // reported warp makes a jitter of lines a jitter of pen widths as
        // well, and the interleave that is the inverse moiré's black then
        // covers 75% in one place and 100% in the next. Left at zero, the
        // band is measured in the family's own phase and every member keeps
        // its DUTY, which is the profile the theory pools. The price is that
        // the rate machinery reads such a layer at its nominal rate.
        const L = slot.fieldScale.abs().max(1e-3);
        const H = L.mul(program.aspect);
        const uvOf = (px, py) => vec2(px.div(L).add(0.5), float(0.5).sub(py.div(H)));
        const insideOf = (uv) =>
          step(0, uv.x).mul(step(uv.x, 1)).mul(step(0, uv.y)).mul(step(uv.y, 1));
        const darkAt = (uv, level) =>
          float(1).sub(texture(program.texture, uv, level).r).mul(insideOf(uv));
        const mode = slot.fieldMode;
        const isHalves = step(0.5, mode).mul(step(mode, 1.5));
        const isWeave = step(1.5, mode);
        // Plain and halves: the picture where we stand. Halves gives each side
        // half the shift, signed by its role, so the pair's difference is the
        // whole amount.
        const d = darkAt(uvOf(local.x, local.y), slot.fieldSoften);
        const direct = d.mul(slot.fieldAmount).mul(mix(float(1), slot.fieldRole.mul(0.5), isHalves));
        // Weave: cells one pitch across the members and `fieldCell` pitches
        // along them -- aligned to the members for parallel lines (x across,
        // y along) and for concentric rings (radius across, arc along), square
        // in layer space for everything else. Every cell shifts by half the
        // amount, left or right by a hash of the cell and the seed; the layer
        // of role -1 flips WHOLE cells inside the picture, with a probability
        // equal to the cell's mean darkness (the picture read at the cell's
        // centre at the mip level of the cell's size) drawn from a second
        // hash. Flipping by the darkness itself would leave a partly dark cell
        // with a partly cancelled jitter, and the picture's edges and thin
        // strokes would show on that layer alone as calmer lines; flipping
        // whole cells keeps every cell a full jitter, so alone both layers are
        // the same weave everywhere, greys come out dithered, and in register
        // the jitter cancels outside the picture and doubles inside it.
        const p = slot.spacing.abs().max(1e-3);
        const ell = p.mul(slot.fieldCell.max(0.05));
        const isLine = step(slot.type, 0.1);
        const isRing = step(0.9, slot.type).mul(step(slot.type, 4.5));
        const TAU = float(6.283185307);
        const r = length(local);
        const theta = atan(local.y, local.x);
        const nRing = floor(r.sub(slot.phase).div(p).add(0.5));
        const sectors = floor(TAU.mul(nRing.abs().max(0.5)).mul(p).div(ell).add(0.5)).max(1);
        const kRing = floor(theta.div(TAU).add(0.5).mul(sectors));
        const cxLine = floor(local.x.sub(slot.phase).div(p).add(0.5));
        const cxSquare = floor(local.x.div(p).add(0.5));
        const cyAlong = floor(local.y.div(ell));
        const cx = mix(mix(cxSquare, cxLine, isLine), nRing, isRing);
        const cy = mix(cyAlong, kRing, isRing);
        const thetaC = kRing.add(0.5).div(sectors).sub(0.5).mul(TAU);
        const rC = nRing.mul(p).add(slot.phase);
        const centreLine = vec2(cxLine.mul(p).add(slot.phase), cyAlong.add(0.5).mul(ell));
        const centreSquare = vec2(cxSquare.mul(p), cyAlong.add(0.5).mul(ell));
        const centreRing = vec2(rC.mul(thetaC.cos()), rC.mul(thetaC.sin()));
        const centre = mix(mix(centreSquare, centreLine, isLine), centreRing, isRing);
        const cellLevel = log2(p.mul(program.width).div(L).max(1)).max(slot.fieldSoften);
        const dCell = darkAt(uvOf(centre.x, centre.y), cellLevel);
        const hashOf = (salt) =>
          fract(dot(vec3(cx, cy, slot.fieldSeed.add(salt)), vec3(12.9898, 78.233, 37.719)).sin().mul(43758.5453));
        const jitter = step(0.5, hashOf(0)).mul(2).sub(1).mul(slot.fieldAmount).mul(0.5);
        const flips = step(hashOf(0.5), dCell).mul(step(0.001, dCell));
        const keeps = step(0, slot.fieldRole);
        const weave = jitter.mul(mix(float(1).sub(flips.mul(2)), float(1), keeps));
        shift.assign(mix(direct, weave, isWeave));
      } else if (program) {
        const sample = fieldFunction(program, `moireField${index}`)(local, slot.fieldScale);
        shift.assign(sample.x.mul(slot.fieldAmount));
        shiftGrad.assign(vec2(sample.y, sample.z).mul(slot.fieldAmount));
      }
      const warp = shift.mul(slot.spacing);
      const warpGrad = shiftGrad.mul(slot.spacing);

      cell.assign(
        latticeCellWgsl(slot.type.sub(5), slot.spacing, slot.scale.x, slot.scale.y)
      );
      // A catalogue tiling carries its own translation cell; the layer's
      // stretch applies per axis, exactly as the grids' cells do.
      If(slot.type.greaterThan(13.5), () => {
        cell.assign(
          vec4(
            slot.tileCell.x.mul(slot.scale.x),
            slot.tileCell.y.mul(slot.scale.y),
            slot.tileCell.z.mul(slot.scale.x),
            slot.tileCell.w.mul(slot.scale.y)
          )
        );
      });

      // A morph has two families in flight at once, so it needs both phases.
      const phaseOf = (typeNode, out, nOut) => {
        If(typeNode.lessThanEqual(0.1), () => {
          out.assign(
            linePhase(local, float(0), slot.spacing, slot.phase, slot.offset.x, warp, warpGrad)
          );
        }).Else(() => {
          If(typeNode.lessThan(4.5), () => {
            // Two halves, so the member's index survives the vec4 phase.
            const hit = ringHit(
              local,
              slot.offset,
              slot.rotationOffset,
              slot.spacing,
              slot.phase,
              typeNode,
              slot.sides,
              accept,
              reject,
              warp,
              warpGrad
            ).toVar();
            out.assign(
              ringTrio(
                local,
                hit,
                slot.offset,
                slot.rotationOffset,
                slot.spacing,
                slot.phase,
                typeNode,
                slot.sides,
                reject,
                warp,
                warpGrad
              )
            );
            nOut.assign(hit.y);
          }).Else(() => {
            If(typeNode.lessThan(8.5), () => {
              out.assign(
                radialLinePhase(local, slot.lineCount, slot.phase, shift, shiftGrad)
              );
            }).Else(() => {
              out.assign(
                curvePhase(
                  local,
                  typeNode.sub(9),
                  slot.spacing,
                  slot.phase,
                  slot.bend,
                  slot.frequency,
                  warp,
                  warpGrad
                )
              );
            });
          });
        });
      };

      // A lattice never reads the phase, and the solvers are the expensive part,
      // so it does not pay for one.
      If(isLattice.not(), () => {
        phaseOf(slot.type, phase, ringN);
        // The direction follows the target family, so the source's member is
        // not kept.
        If(slot.morph.lessThan(0.999), () =>
          phaseOf(slot.typeFrom, phaseFrom, float(0).toVar())
        );

        // The index direction, in layer coordinates. The measurement's xi
        // reads the TARGET family's phase during a morph, so the direction
        // follows the target type unconditionally. Only the character scan
        // reads it, and the ring/curve directions cost transcendentals per
        // pixel per layer, so the whole block sits behind the scan gate
        // (uniform, and nothing here takes a screen derivative).
        // The family's screen gradient serves the scan's characters and the
        // synthesis' term frequencies alike: the plain pool and the exact
        // envelope's ladder frames need it with the scan off.
        const needGrad = scanOn
          .or(view.pool.greaterThan(0.5))
          .or(view.exactSweep.greaterThan(0.5));
        If(needGrad, () => {
          const dir = vec2(1, 0).toVar();
          If(slot.type.lessThanEqual(0.1), () => {
            dir.assign(lineIndexDir(float(0), warpGrad));
          }).Else(() => {
            If(slot.type.lessThan(4.5), () => {
              // The nearest member's facet normal, in the layer frame: closed
              // form for a walking family too, since the solve says which
              // member it found and where that member's frame sits.
              dir.assign(
                ringIndexDir(
                  local,
                  ringN,
                  slot.offset,
                  slot.rotationOffset,
                  slot.type,
                  slot.sides,
                  warpGrad
                )
              );
            }).Else(() => {
              If(slot.type.lessThan(8.5), () => {
                dir.assign(radialIndexDir(local, slot.lineCount, shiftGrad));
              }).Else(() => {
                dir.assign(
                  curveIndexDir(
                    local,
                    slot.type.sub(9),
                    slot.spacing,
                    slot.phase,
                    slot.bend,
                    slot.frequency,
                    warpGrad
                  )
                );
              });
            });
          });

          // Layer frame to world (the layer's rotation), world to screen (zoom;
          // TSL's dFdy runs along WebGL's bottom-up window y, so world y and
          // derivative y agree and no flip is needed — the lattice coordinates'
          // dFdx-based gradients are the same convention, and the two meet in
          // the candidate matching), and index units per world unit from the
          // gap the sample measured — the same gap the fractional xi divides
          // by, so the two agree by construction.
          const gw = vec2(
            c.mul(dir.x).sub(s.mul(dir.y)),
            s.mul(dir.x).add(c.mul(dir.y))
          );
          const gap = max(phase.y.sub(phase.x).abs(), float(1e-6));
          sgrad.assign(gw.mul(pixel).div(gap));
        });
      });
    });

    return { slot, local, halfT, aa, aaRest, isLattice, cell, shift, phase, phaseFrom, sgrad };
  });
}

// The heterodyne ratio of the two ranked layers, computed before the sweep
// because the sweep needs it. A visible moire is an integer combination
// kA*phiA + kB*phiB that varies slowly against the carriers, so each
// candidate character k gets eta_k = |kA gA + kB gB| / (|kA gA - kB gB| / 2)
// -- beat gradient over the mean gradient of the carriers in the labeling
// that brings them close -- times the amplitude weight |kA kB| (a beat at
// (kA, kB) rides one layer's |kA|-th harmonic and the other's |kB|-th, and
// a stroke profile's harmonics decay like 1/m, so the weight is what makes
// "slowest visible beat" well-posed: unweighted, good rational
// approximations exist at every order and the minimum favours beats no ink
// can carry). The criterion is the minimum weighted merit over the
// candidates. (1,-1) and (1,1) are the classical difference and sum moires
// at weight 1, exactly as before; higher orders pay their weight. The
// merit << 1 is the fringe regime; past 1/4 no fringe forms.
function scanCharacters(view, solved, latGrads, scanOn) {
  const xiA = float(0).toVar();
  const xiB = float(0).toVar();
  const xiC = float(0).toVar();
  // Screen-space index gradients, closed form for every scalar family
  // (solveLayers computed each beside its phase). Nothing here takes a
  // screen derivative: a derivative of the fractional index wraps by a whole
  // unit where the nearest member changes, and unwrapping that is sound only
  // while a member spans two pixels or more — below, it aliases, two layers
  // unwrap differently, and their SUM reads as the slow character. That was
  // the walking families' path once, and the handover quilt was its picture.
  const gradA = vec2(0).toVar();
  const gradB = vec2(0).toVar();
  const gradC = vec2(0).toVar();
  // Whether the layer can put ink anywhere at this pixel. The phase sample's
  // floor is the part of the family that does not slide — a radial pencil's
  // Start hole, a saturated solve's guard, the hyperbola's missing innermost
  // member — and where the floor alone exceeds the stroke, no tap of any
  // schedule inks the layer. Its index field is still perfectly defined there
  // (a pencil's rays exist as geometry inside the hole), which is exactly the
  // trap: the scan would rank beats against members that carry no ink, claim
  // fringe regime in blank paper, and the envelope's mask would paint
  // "structure" in the empty disc of a Start hole.
  const inkA = float(1).toVar();
  const inkB = float(1).toVar();
  const inkC = float(1).toVar();
  solved.forEach(({ phase, sgrad, halfT }, index) => {
    // Continuous index, modulo its integer part: signed residual over the
    // local member gap, oriented at the neighbour with the smaller residual so
    // the index counts the same way whichever family produced the trio.
    const toward = min(phase.y, phase.z);
    const xi = phase.x.div(max(phase.x.sub(toward), float(1e-6)));
    const inked = step(phase.w, halfT);
    If(view.ratioA.equal(int(index)), () => {
      xiA.assign(xi);
      gradA.assign(sgrad);
      inkA.assign(inked);
    });
    If(view.ratioB.equal(int(index)), () => {
      xiB.assign(xi);
      gradB.assign(sgrad);
      inkB.assign(inked);
    });
    If(view.ratioC.equal(int(index)), () => {
      xiC.assign(xi);
      gradC.assign(sgrad);
      inkC.assign(inked);
    });
  });
  // Candidate characters, scanned over every pair among the three ranked
  // layers. On K layers the superposition lives on T^K and the characters
  // are k in Z^K; the diagonal sweep w = (1,...,1) preserves the whole
  // zero-sum sublattice (k summing to zero) at once — every pairwise
  // difference and every zero-sum ternary beat — so those need no schedule
  // at all, and every unranked layer rides the diagonal. What needs a
  // deviation is a winning character that is NOT zero-sum (a sum beat, a
  // higher-order beat): its pair takes the rates (wP, wQ) with
  // kP wP + kQ wQ = 0 while everything else stays at 1. Scanning only one
  // pair chose that deviation blind: a sum beat between the top two layers
  // would scramble a slower difference beat the second layer makes with the
  // THIRD — the fringe stood in the render and washed from the view. The
  // scan compares all three pairs and deviates only for the global winner.
  //
  // The candidates are NOT an order cap. A |k| <= 2 enumeration missed a
  // fifth of the visible fringes in random carrier pairs (858 of 4000,
  // clustering at pitch ratios near 3 — paper/tools/exp/convergents.mjs):
  // two line families at 3:1 beat in (3,-1), which no small cap contains,
  // so the envelope held a phantom (2,-1) schedule and washed a fringe that
  // stood plainly in the render. The slowest character at ANY order is the
  // shortest vector of the 2D lattice {a gP + b gQ}, and Lagrange-Gauss
  // reduction finds it in a handful of iterations — the 2D form of reading
  // a continued fraction's convergents, which is exactly what the visible
  // beat hierarchy is in 1D. The scan therefore reduces the pair's gradient
  // lattice per pixel (integer coordinates carried along in floats) and
  // scans the reduced short vector s plus the window {i s + j t : |i| <= 3,
  // j in {1, 2}} under the amplitude weight — the weighted winner is not
  // always a shortest vector, because a longer lattice vector can carry
  // smaller integer coordinates, and the second row is what catches those
  // (1 miss in 4000 with it, 5 without). The old six stay as a compile-time
  // floor so no degenerate reduction can ever do worse than the cap did.
  const SHIPPED = [
    [1, -1],
    [1, 1],
    [2, -1],
    [2, 1],
    [1, -2],
    [1, 2],
  ];
  // Pairs beyond the first exist only when a third ranked layer does; an
  // absent slot's candidates are pushed out of every comparison. The first
  // pair needs the same guard since the ratio view can rank a lone scalar
  // (B empty): a pair against an absent slot has a zero beat and would win
  // the scan with a false eta of 0.
  const validB = step(float(-0.5), float(view.ratioB));
  const validC = step(float(-0.5), float(view.ratioC));
  // A pair's candidates exist where the slot is ranked AND both layers can
  // ink this pixel; either failing pushes the whole pair out of every
  // minimum (three fans with Start holes: inside fan i's hole only the other
  // pair's beats are real, and in the shared central hole no beat is).
  const bGate = float(1).sub(validB.mul(inkA).mul(inkB)).mul(1e5);
  const acGate = float(1).sub(validC.mul(inkA).mul(inkC)).mul(1e5);
  const bcGate = float(1).sub(validC.mul(inkB).mul(inkC)).mul(1e5);
  const ternGate = float(1).sub(validC.mul(inkA).mul(inkB).mul(inkC)).mul(1e5);
  // Every pair reduces. The reduction takes gradients seriously enough to be
  // poisoned by per-quad noise — two noisy vectors accidentally near-parallel
  // read as a slow high-order character — which is why it was once licensed
  // to analytic pairs only, and why every scalar family's gradient is now
  // closed form, walking families included.
  const PAIRS = [
    { gP: gradA, gQ: gradB, xP: xiA, xQ: xiB, gate: bGate, who: 0, lic: view.licAB },
    { gP: gradA, gQ: gradC, xP: xiA, xQ: xiC, gate: acGate, who: 1, lic: view.licAC },
    { gP: gradB, gQ: gradC, xP: xiB, xQ: xiC, gate: bcGate, who: 2, lic: view.licBC },
  ];
  const etaBest = float(1e6).toVar();
  const pickBest = float(1e6).toVar();
  // The winner's own amplitude weight, kept beside it: the margin a winner
  // must clear before its schedule deviation engages scales with this
  // (devW below), because holding a high-order character costs more of the
  // picture than holding a sum beat does.
  const pickW = float(1).toVar();
  // The winner's fastest slide rate, max(|a|, |b|): what its schedule asks
  // of the tap budget. A rate-q slide samples each period taps/q times, and
  // below ~8 samples the "held" fringe is mostly undersampled carrier hash.
  const pickRate = float(1).toVar();
  // Whether the winner may deviate at all: 1 for first-order characters
  // (their per-pixel handover is the originally tuned fade) and for the one
  // character the pair's frame-wide license names; 0 for every other
  // higher-order winner, which then rides the diagonal like its
  // surroundings. Deviation identity is a decision of the stack, not of the
  // pixel — the license is what keeps a ratio-varying stack from quilting
  // into per-pocket schedules with seams between them.
  const pickLic = float(1).toVar();
  // The best ZERO-SUM candidate, tracked beside the global winner. Every
  // zero-sum character rides the plain diagonal, so among them the schedule
  // never changes and no seam can form; only a non-zero-sum winner deviates
  // the rates. The margin between the two is what softens that deviation's
  // boundary (devW below): a hard per-pixel switch of sweep schedule is a
  // hard edge in the averaged image, standing exactly where the sum or a
  // second-order beat stops winning.
  const zeroBest = float(1e6).toVar();
  const rateA = float(1).toVar();
  const rateB = float(1).toVar();
  const rateC = float(1).toVar();
  // The winner's character (a, b) itself, for the pair table's row.
  const pickA = float(0).toVar();
  const pickB = float(0).toVar();
  // The winning character's beat phase and its per-pixel rate, for the
  // contour overlay: level sets of the phase at integers are the fringe
  // centres, and the rate turns a phase residual into screen pixels.
  const beatVal = float(0).toVar();
  const beatRate = float(0).toVar();
  // Everything the scan hands back, as variables with plain-render defaults:
  // no fringe claimed (eta 1), unit rates, no deviation. The gate is the
  // uniform scan toggle from buildColorNode; the gradients above stay outside
  // it because dFdx must live in unconditional control flow.
  const etaOut = float(1).toVar();
  const etaAllOut = float(1).toVar();
  const etaEnvOut = float(1).toVar();
  const devW = float(0).toVar();
  If(scanOn, () => {
  PAIRS.forEach(({ gP, gQ, xP, xQ, gate, who, lic }) => {
    // One candidate (a, b): its merit joins the heat map (wMap), and the
    // zero-sum ledger and the pick (wPick). Everything is sign-invariant —
    // (a, b) and (-a, -b) are the same character, and the merit, the
    // weight, the rates, and the contour residual all survive the flip —
    // so candidates need no canonical sign. `skip` pushes a candidate out
    // (a zero coordinate is one layer's own carrier, not a beat). The
    // weight doubles as the near-tie resolver the old 1.5 penalty was:
    // comparable slowness resolves toward the lower order, whose ink
    // carries more contrast, and the per-pixel choice cannot flicker
    // between them.
    const consider = (a, b, beat, wMap, wPick, skip) => {
      const carrier = gP.mul(a).sub(gQ.mul(b));
      // The heterodyne ratio is FLOORED at a thousandth: a beat slower than a
      // thousand carriers is a constant across any frame, and a constant is
      // preserved by every schedule, so it must not out-pick a visible fringe
      // by paying nothing. Without the floor an exactly rational pitch ratio
      // — 16.4 : 8 is 41 : 20 — hands the reduction a character (20,-41)
      // whose beat is exactly zero, zero times its weight of 820 is zero, it
      // wins the pick, no gate will hold it, and the sweep rides the
      // diagonal past the station (1,-2) that the pair plainly shows. With
      // the floor an exact character of orders p, q pays 2e-3 pq: a 3:1 lock
      // still wins at 0.006, the 41:20 phantom loses at 1.6.
      const carrierLen = max(length(carrier).mul(0.5), float(1e-6));
      const eRaw = max(length(beat), carrierLen.mul(2e-3)).div(carrierLen);
      const eMap = eRaw.mul(wMap).add(gate).add(skip).toVar();
      const ePick = eRaw.mul(wPick).add(gate).add(skip).toVar();
      If(eMap.lessThan(etaBest), () => etaBest.assign(eMap));
      If(ePick.lessThan(zeroBest).and(a.add(b).abs().lessThan(0.5)), () =>
        zeroBest.assign(ePick)
      );
      // The schedule that holds (a, b) fixed: wP a + wQ b = 0.
      const wP = b.abs();
      const wQ = a.negate().mul(b.sign());
      If(ePick.lessThan(pickBest), () => {
        pickBest.assign(ePick);
        pickW.assign(wPick);
        pickRate.assign(max(a.abs(), b.abs()));
        // First-order characters carry their own licence; a higher-order one
        // must be the very character the frame-wide licence names (same
        // orders, opposite signs — a pitch lock, not a sum).
        const w1 = step(wPick, float(1.05));
        const opp = float(1).sub(a.mul(b).sign()).mul(0.5);
        const match = step(a.abs().sub(lic.y).abs(), float(0.5))
          .mul(step(b.abs().sub(lic.z).abs(), float(0.5)))
          .mul(lic.x)
          .mul(opp);
        pickLic.assign(max(w1, match));
        rateA.assign(who === 2 ? float(1) : wP);
        rateB.assign(who === 0 ? wQ : who === 2 ? wP : float(1));
        rateC.assign(who === 0 ? float(1) : wQ);
        pickA.assign(a);
        pickB.assign(b);
        beatVal.assign(xP.mul(a).add(xQ.mul(b)));
        beatRate.assign(length(beat));
      });
    };

    // The compile-time floor, paying the same |a b| weight the window
    // candidates do: one merit currency, so the argmin is coherent.
    SHIPPED.forEach(([ka, kb]) => {
      const w = float(Math.abs(ka * kb));
      consider(float(ka), float(kb), gP.mul(ka).add(gQ.mul(kb)), w, w, float(0));
    });

    // Lagrange-Gauss reduction of the pair's gradient lattice, the integer
    // coordinates carried along in floats (exact far past any weight the
    // scan keeps). Eight steps unrolled: once a step's remainder fails to
    // shrink, every later step recomputes and rejects the same remainder,
    // so the unroll needs no done flag. The quotient clamp keeps a
    // degenerate pair (an absent slot's zero gradient, a near-flat layer)
    // finite; its candidates then lose on the gates.
    const uV = vec2(0).toVar();
    const uK = vec2(0).toVar();
    const wV = vec2(0).toVar();
    const wK = vec2(0).toVar();
    If(gP.dot(gP).lessThan(gQ.dot(gQ)), () => {
      uV.assign(gQ);
      uK.assign(vec2(0, 1));
      wV.assign(gP);
      wK.assign(vec2(1, 0));
    }).Else(() => {
      uV.assign(gP);
      uK.assign(vec2(1, 0));
      wV.assign(gQ);
      wK.assign(vec2(0, 1));
    });
    for (let it = 0; it < 8; it += 1) {
      const mu = round(uV.dot(wV).div(max(wV.dot(wV), float(1e-12)))).clamp(-64, 64);
      const rV = uV.sub(wV.mul(mu)).toVar();
      const rK = uK.sub(wK.mul(mu)).toVar();
      If(rV.dot(rV).lessThan(wV.dot(wV)), () => {
        uV.assign(wV);
        uK.assign(wK);
        wV.assign(rV);
        wK.assign(rK);
      });
    }

    // The short vector s and the two-row window {i s + j t}. The beat
    // vector comes straight from the reduced basis — the cancellation is
    // already done, which is what f32 wants — while the carrier and the
    // contour value are formed from the integer coordinates.
    const windowCand = (i, j) => {
      const a = wK.x.mul(i).add(uK.x.mul(j));
      const b = wK.y.mul(i).add(uK.y.mul(j));
      const nz = step(float(0.5), a.abs()).mul(step(float(0.5), b.abs()));
      const wgt = a.abs().mul(b.abs());
      consider(a, b, wV.mul(i).add(uV.mul(j)), wgt, wgt, float(1).sub(nz).mul(1e5));
    };
    windowCand(1, 0);
    for (let j = 1; j <= 2; j += 1) {
      for (let i = -3; i <= 3; i += 1) windowCand(i, j);
    }
  });
  // Zero-sum ternary characters — beats BETWEEN beats, like (1,1,-2) slow
  // where 2/s3 = 1/s1 + 1/s2 and the three directions conspire. They join
  // the scan for the heat map's sake; as zero-sum characters they already
  // ride the diagonal, so a ternary winner asks for no rate deviation at
  // all. Their amplitude weight is |ka kb kc| = 2, the same currency the
  // pairwise candidates pay.
  const TERNARY = [
    [1, 1, -2],
    [1, -2, 1],
    [-2, 1, 1],
  ];
  TERNARY.forEach(([ka, kb, kc]) => {
    const beat = gradA.mul(ka).add(gradB.mul(kb)).add(gradC.mul(kc));
    const carrier = max(
      length(gradA).mul(Math.abs(ka)),
      max(length(gradB).mul(Math.abs(kb)), length(gradC).mul(Math.abs(kc)))
    );
    const eRaw = length(beat).div(max(carrier.mul(0.5), float(1e-6)));
    const eMap = eRaw.mul(2).add(ternGate).toVar();
    const ePick = eRaw.mul(2).add(ternGate).toVar();
    If(eMap.lessThan(etaBest), () => etaBest.assign(eMap));
    If(ePick.lessThan(zeroBest), () => zeroBest.assign(ePick));
    If(ePick.lessThan(pickBest), () => {
      pickBest.assign(ePick);
      // Zero-sum: rides the diagonal, so the deviation margin never applies.
      pickW.assign(1);
      pickRate.assign(1);
      pickLic.assign(1);
      rateA.assign(1);
      rateB.assign(1);
      rateC.assign(1);
      beatVal.assign(xiA.mul(ka).add(xiB.mul(kb)).add(xiC.mul(kc)));
      beatRate.assign(length(beat));
    });
  });
  etaOut.assign(etaBest.clamp(0, 1));

  // Whether a schedule-deviating winner actually gets its deviation. THE
  // DIAGONAL IS THE ENVELOPE; a deviation is an exception, licensed only
  // when averaging diagonally would blank a fringe the render shows
  // decisively (the 3:1 / 5:2 family). Three independent gates multiply,
  // each in [0, 1] so the handover is always a fade, never a seam:
  //
  // P — decisiveness against the diagonal's own content: the winner must
  // clear the best zero-sum candidate by a margin that scales with its
  // amplitude weight, (1 + w) / 2. Zero at the flip boundary, so a station
  // embedded in visible zero-sum texture rides the diagonal like its
  // surroundings (the three-fan thumbs; zoo fan-trio-envelope).
  //
  // R — the winner must be a CERTIFIED fringe, its weighted merit inside
  // the regime threshold the whole theory runs on. The earlier band keyed
  // on hash scale (1.7-3.4 thr) and was tuned for first-order sum beats,
  // whose handover rims it fixed (rings-sum-handover, the wave pair's
  // beading) — it keeps that band at w = 1. But a higher-order winner with
  // merit at 0.4-0.6 is a fringe the criterion itself calls invisible, and
  // holding its schedule hoists a faint beat to prominence while washing
  // the stripes and swirls the render actually features. Above order one
  // the fade starts AT the threshold — exactly where the map stops calling
  // the winner a fringe — and is done by 1.7x. Tighter still (a band
  // starting at thr/2) half-washed the legitimate 5:2 hold, whose 1 degree
  // of rotation prices even a perfect pitch lock at ~0.7 thr.
  //
  // T — the tap budget must resolve the schedule: a rate-q slide samples
  // each family period taps/q times, and under ~8 the held fringe is
  // mostly undersampled carrier — the striped fill of those discs. Deep
  // stations ((12,-5) and friends, hair-thin loci) die here at any default
  // tap count, and raising the Quality dial is what legitimately revives
  // them. 3:1 at 24 taps (8 per period) and 5:2 at 48 (9.6) both pass.
  const thr = max(view.ratioThreshold, float(0.02));
  const devP = smoothstep(
    float(0),
    max(view.ratioThreshold.mul(0.5), float(0.02)).mul(pickW.add(1).mul(0.5)),
    zeroBest.sub(pickBest)
  );
  const hiOrder = pickW.sub(1).clamp(0, 1);
  const devR = float(1).sub(
    smoothstep(thr.mul(mix(float(1.7), float(1.0), hiOrder)), thr.mul(mix(float(3.4), float(1.7), hiOrder)), pickBest)
  );
  const devT = float(view.taps).div(max(pickRate, float(1))).sub(4).div(4).clamp(0, 1);
  devW.assign(devP.mul(devR).mul(devT).mul(pickLic));

  // Lattice coordinates join the measurement. eta is defined over the
  // characters of the JOINT index torus, and a lattice's visible families
  // are its dual-ring combinations — so the map must darken where a grid
  // family beats a scalar carrier, or where two lattices' matched families
  // beat, exactly as it darkens for a scalar pair; without this the ratio
  // view is blind to every lattice in the stack. Measurement only: the
  // sweep's schedules keep their own matching below, so nothing here can
  // move an envelope pixel.
  const latEntry = (sel) => {
    const g1 = vec2(0).toVar();
    const g2 = vec2(0).toVar();
    const type = float(-1).toVar();
    solved.forEach(({ slot }, index) => {
      If(sel.equal(int(index)), () => {
        g1.assign(latGrads[index].g1);
        g2.assign(latGrads[index].g2);
        type.assign(slot.type);
      });
    });
    // 1e5 pushes a missing lattice's characters out of every minimum.
    const missing = float(1).sub(step(float(-0.5), float(sel))).mul(1e5);
    return { g1, g2, type, missing };
  };
  const latP = latEntry(view.scanLatA);
  const latQ = latEntry(view.scanLatB);
  // The ranked scalar's ink gate joins its validity: a fan's empty Start disc
  // must not measure beats against a lattice either.
  const sGate = float(1).sub(step(float(-0.5), float(view.ratioA)).mul(inkA)).mul(1e5);
  const etaOf = (beat, carrier) =>
    length(beat).div(max(length(carrier).mul(0.5), float(1e-6)));
  let latMin = float(1e6);
  DUAL_RING.forEach(({ a, b, pens }) => {
    const gP = latP.g1.mul(a).add(latP.g2.mul(b));
    const gQ = latQ.g1.mul(a).add(latQ.g2.mul(b));
    // A combination the kind carries no ink at must not darken the map.
    const penP = step(float(1.4), kindPen(latP.type, pens)).mul(1e5);
    const penQ = step(float(1.4), kindPen(latQ.type, pens)).mul(1e5);
    // Each lattice's combination against the ranked scalar, either way
    // around, and the matched same-combination difference across the pair.
    const pScalar = min(etaOf(gP.sub(gradA), gP.add(gradA)), etaOf(gP.add(gradA), gP.sub(gradA)));
    const qScalar = min(etaOf(gQ.sub(gradA), gQ.add(gradA)), etaOf(gQ.add(gradA), gQ.sub(gradA)));
    const pq = min(etaOf(gP.sub(gQ), gP.add(gQ)), etaOf(gP.add(gQ), gP.sub(gQ)));
    latMin = min(latMin, pScalar.add(penP).add(latP.missing).add(sGate));
    latMin = min(latMin, qScalar.add(penQ).add(latQ.missing).add(sGate));
    latMin = min(latMin, pq.add(max(penP, penQ)).add(latQ.missing));
  });
  // The joint minimum feeds the heat map; the scalar minimum keeps gating
  // the scalar beat channel, whose own regime is what its contour annotates.
  etaAllOut.assign(min(etaBest, latMin).clamp(0, 1));
  // The envelope's mask instead reads the merit of what the sweep PRESERVES:
  // the winner's where the deviation engaged, the best zero-sum character's
  // where the margin rule declined it — so a declined station fades like its
  // surroundings instead of standing as an unfaded disc of carrier hash.
  etaEnvOut.assign(min(mix(zeroBest, pickBest, devW), latMin).clamp(0, 1));
  });

  return {
    xiA,
    gradA,
    eta: etaOut,
    etaAll: etaAllOut,
    etaEnv: etaEnvOut,
    rateA,
    rateB,
    rateC,
    pickA,
    pickB,
    beatVal,
    beatRate,
    devW,
  };
}

// A lattice joins the sweep by translation — but along what, and stepped
// which way? Wrong either way and the beat its lines make with the rest of
// the stack averages out while the lattice's own carrier washes clean:
// fringes that are plainly in the pattern vanish from its envelope. The
// beating system is a per-pixel fact (a ring family's counting direction
// rotates around its centre, taking turns against each lattice direction),
// so it is chosen per pixel among the lattice's beat-capable index
// combinations. Which combinations those are is a property of where the
// lattice puts its ink: the candidates are the first three rings of the
// dual lattice — (1,0) (0,1) (1,1) (1,-1) (2,1) (1,2), and the doubled
// generators (2,0) (0,2) (2,2) — in generator coordinates.
// A square grid's line families are its first ring and its vertex
// diagonals the second, both inside the old four. A honeycomb is the
// trap: its hexagon walls of one orientation repeat at pitch (√3/2)s,
// and the dual vectors normal to the three wall families are (1,-1),
// (2,1), (1,2) — the SECOND ring. Match only first-ring combinations and
// the envelope schedules correctly in a third of the directions a partner
// gradient can point, washing the plainly visible wall beat everywhere
// else. Each candidate is weighted by the kind's ink placement (the
// honeycomb's fundamental is its second ring, a square grid has no ink at
// (2,1) at all), the weight multiplying the match error so near-ties
// resolve toward the family that actually carries contrast. Each
// combination's continuous index is linear in the layer point, so its
// screen gradient is exact; whichever combination, stepped forward or
// backward, best matches the ranked partner's index gradient is held
// coherent by the tap schedule below, and everything else is golden-ratio
// scrambled so the lattice never beats with itself: any self-hatch would
// need two combinations coherent at once, which no schedule provides.
//
// The schedules, as (generator-1, generator-2) offsets with g the golden
// scramble and su the signed sweep; each is the unimodular completion that
// sends its own combination to su and every other candidate to a nonzero
// multiple of g (or a mix), so exactly one character survives:
//   (1,0)   (su, g)          (0,1)   (g, su)
//   (1,1)   (su - g, g)      (1,-1)  (g, g - su)
//   (2,1)   (su - g, 2g - su)
//   (1,2)   (su - 2g, g)
//   (2,0)   (su/2, g)        (0,2)   (g, su/2)
//   (2,2)   (su/2 - g, g)
function matchLattices(view, solved, scan, latGrads, scanOn) {
  const { gradA, xiA } = scan;
  // The reference lattice's generator gradients and continuous indices, for
  // twist mode and its contour overlay.
  const g1Ref = vec2(0).toVar();
  const g2Ref = vec2(0).toVar();
  const x1Ref = float(0).toVar();
  const x2Ref = float(0).toVar();
  solved.forEach((_, index) => {
    If(view.latA.equal(int(index)), () => {
      g1Ref.assign(latGrads[index].g1);
      g2Ref.assign(latGrads[index].g2);
      x1Ref.assign(latGrads[index].x1);
      x2Ref.assign(latGrads[index].x2);
    });
  });
  // The matched twist pair's slow characters D1 = a1 − b1 and D2 = a2 − b2,
  // recorded as a value plus BOTH sides' gradient vectors, so their integer
  // combinations — the kind's dual-ring characters, the skeleton of the
  // visible rosette — can be formed after the matching. A pixel with no
  // twist pair leaves the gradients at zero, which gates every combination
  // off through its rate.
  const m1Val = float(0).toVar();
  const m2Val = float(0).toVar();
  const m1Ref = vec2(0).toVar();
  const m1Oth = vec2(0).toVar();
  const m2Ref = vec2(0).toVar();
  const m2Oth = vec2(0).toVar();
  const latBType = float(-1).toVar();
  // Scalar-partner mode's single character, recorded where the sweep's own
  // candidate matching decides it. A slot with no lattice leaves the rate at
  // zero, which the overlay's gate reads as "nothing to draw".
  const latVal1 = float(0).toVar();
  const latRate1 = float(0).toVar();
  const latEta1 = float(0).toVar();

  // Each lattice's tap schedule, as coefficients on (u, v): generator 1
  // advances by cu1*u + cv1*v per tap, generator 2 by cu2*u + cv2*v.
  //
  // Twist mode (latA >= 0; no scalar layers visible): the reference lattice
  // rides (u, v) directly, and every other lattice matches each of its
  // generators, signed, to the reference's — matched generators then advance
  // in lockstep across layers, so the twist pair's two slow characters
  // (a1−b1 and a2−b2, in the matched labeling) are preserved exactly at
  // every tap, while each lattice's own carrier, its self-beats, and the
  // cross combinations all ride nonzero rates of u, v, or u−v and average
  // away. This is the sweep-orthogonal-to-the-kept-characters rule with a
  // rank-2 kept set: w = (1, γ, 1, γ) on the four-torus annihilates
  // everything but the two matched differences.
  //
  // Scalar-partner mode (latA < 0): the classic per-pixel choice among the
  // four beat-capable combinations — each generator, their sum, and their
  // difference — matched forward or backward against the ranked partner's
  // index gradient. The schedules, as (generator-1, generator-2) offsets
  // with g the golden scramble and su the signed sweep:
  //   gen1  (su, g)        — index 1 coherent, 2 scrambled
  //   gen2  (g, su)        — index 2 coherent, 1 scrambled
  //   sum   (g, su - g)    — indices 1, 2 each pure noise; 1+2 rides su
  //   diff  (g, g - su)    — likewise, 1-2 rides su
  const latCoh = solved.map(({ slot }, index) => {
    const { g1, g2, x1, x2 } = latGrads[index];
    const cu1 = float(1).toVar();
    const cv1 = float(0).toVar();
    const cu2 = float(0).toVar();
    const cv2 = float(1).toVar();
    // The per-pixel schedule choice only matters when a sweep will consult
    // it (taps > 1) or a contour channel will draw it; a plain render's
    // single tap sits at u = v = 0, where every schedule is the identity.
    // Behind the same uniform gate as the character scan.
    If(scanOn, () => {
    If(view.latA.greaterThanEqual(int(0)), () => {
      If(view.latA.equal(int(index)).not(), () => {
        // Which generator, and which sign, matches the reference's first?
        const e1p = length(g1.sub(g1Ref));
        const e1m = length(g1.add(g1Ref));
        const e2p = length(g2.sub(g1Ref));
        const e2m = length(g2.add(g1Ref));
        // step(a, b) = 1 where b >= a: forward when its error is not larger.
        const s1 = step(e1p, e1m).mul(2).sub(1);
        const s2 = step(e2p, e2m).mul(2).sub(1);
        // The unmatched generator's sign against the reference's second.
        const o1p = length(g2.sub(g2Ref));
        const o1m = length(g2.add(g2Ref));
        const o2p = length(g1.sub(g2Ref));
        const o2m = length(g1.add(g2Ref));
        const t1 = step(o1p, o1m).mul(2).sub(1);
        const t2 = step(o2p, o2m).mul(2).sub(1);
        If(min(e1p, e1m).lessThanEqual(min(e2p, e2m)), () => {
          cu1.assign(s1);
          cv1.assign(0);
          cu2.assign(0);
          cv2.assign(t1);
          // The twist pair's slow characters, in this matched labeling, for
          // the contour overlay: a1 - b1 and a2 - b2 with the matched signs.
          If(view.latB.equal(int(index)), () => {
            latBType.assign(slot.type);
            m1Val.assign(x1Ref.sub(x1.mul(s1)));
            m1Ref.assign(g1Ref);
            m1Oth.assign(g1.mul(s1));
            m2Val.assign(x2Ref.sub(x2.mul(t1)));
            m2Ref.assign(g2Ref);
            m2Oth.assign(g2.mul(t1));
          });
        }).Else(() => {
          cu1.assign(0);
          cv1.assign(t2);
          cu2.assign(s2);
          cv2.assign(0);
          If(view.latB.equal(int(index)), () => {
            latBType.assign(slot.type);
            m1Val.assign(x1Ref.sub(x2.mul(s2)));
            m1Ref.assign(g1Ref);
            m1Oth.assign(g2.mul(s2));
            m2Val.assign(x2Ref.sub(x1.mul(t2)));
            m2Ref.assign(g2Ref);
            m2Oth.assign(g1.mul(t2));
          });
        });
      });
    }).Else(() => {
      // The third ring is the doubled generators — the honeycomb's vertex
      // rows repeat at half the row pitch, and a thin-lined square grid is
      // rich in each family's second harmonic, so (2,0)-type beats stand in
      // the render (hex against rings: the ring-3 beat is nearly as slow as
      // the wall beat and owns the sectors 30 degrees away). Holding a
      // doubled combination puts the bare generator on u/2, which washes
      // that one carrier over only half a period; the residue sits at
      // carrier scale under a coarse fringe and is accepted. Pens come from
      // the shared DUAL_RING ink table, selected by this slot's kind.
      const schedules = [
        { g: g1, co: (s) => [s, 0, 0, 1], ab: [1, 0] },
        { g: g2, co: (s) => [0, 1, s, 0], ab: [0, 1] },
        { g: g1.add(g2), co: (s) => [s, -1, 0, 1], ab: [1, 1] },
        { g: g1.sub(g2), co: (s) => [0, 1, s.negate(), 1], ab: [1, -1] },
        { g: g1.mul(2).add(g2), co: (s) => [s, -1, s.negate(), 2], ab: [2, 1] },
        { g: g1.add(g2.mul(2)), co: (s) => [s, -2, 0, 1], ab: [1, 2] },
        { g: g1.mul(2), co: (s) => [s.mul(0.5), 0, 0, 1], ab: [2, 0] },
        { g: g2.mul(2), co: (s) => [0, 1, s.mul(0.5), 0], ab: [0, 2] },
        { g: g1.add(g2).mul(2), co: (s) => [s.mul(0.5), -1, 0, 1], ab: [2, 2] },
      ];
      const cand = schedules.map((c, k) => ({
        ...c,
        pen: kindPen(slot.type, DUAL_RING[k].pens),
      }));
      const best = float(1e6).toVar();
      cand.forEach(({ g, co, ab, pen }) => {
        const ep = length(g.sub(gradA));
        const em = length(g.add(gradA));
        const e = min(ep, em).mul(pen);
        If(e.lessThan(best), () => {
          best.assign(e);
          const s = step(ep, em).mul(2).sub(1);
          const c = co(s);
          cu1.assign(c[0]);
          cv1.assign(c[1]);
          cu2.assign(c[2]);
          cv2.assign(c[3]);
          // The character this combination beats in against the ranked
          // partner, for the contour overlay: comb - s*xiA is the slow
          // difference in the labeling the match chose.
          If(view.latB.equal(int(index)), () => {
            latVal1.assign(x1.mul(ab[0]).add(x2.mul(ab[1])).sub(xiA.mul(s)));
            latRate1.assign(length(g.sub(gradA.mul(s))));
            latEta1.assign(
              latRate1.div(max(length(g.add(gradA.mul(s))).mul(0.5), float(1e-6)))
            );
          });
        });
      });
    });
    });
    return { cu1, cv1, cu2, cv2 };
  });

  // The contour channels. In twist mode the skeleton is the matched pair's
  // characters combined into the latB kind's FUNDAMENTAL dual-ring families
  // — (1,0)/(0,1) for a square lattice's line families, (1,-1)/(2,1)/(1,2)
  // for the honeycomb's three wall families, (1,0)/(0,1)/(1,1) for the
  // triangle lattice's edges — because a contour should annotate a fringe
  // the ink actually carries: the hex twist's visible rosette is the wall
  // beat, and its generator differences alone are two faint lines through
  // it. Every combination of the two matched characters survives the
  // lockstep sweep, so drawing more of them costs nothing but the gate.
  // `on` admits only the kind's fundamentals; the weights are the shared
  // DUAL_RING ink table's, and −1 (no twist pair anywhere) lands on the
  // square column with zero rates, so nothing draws.
  const chars = DUAL_RING.slice(0, 6).map(({ a, b, pens }) => {
    const val = m1Val.mul(a).add(m2Val.mul(b));
    const beat = m1Ref.sub(m1Oth).mul(a).add(m2Ref.sub(m2Oth).mul(b));
    const carrier = m1Ref.add(m1Oth).mul(a).add(m2Ref.add(m2Oth).mul(b));
    const rate = length(beat);
    return {
      val,
      rate,
      eta: rate.div(max(length(carrier).mul(0.5), float(1e-6))),
      on: step(kindPen(latBType, pens), float(1.05)),
    };
  });
  chars.push({ val: latVal1, rate: latRate1, eta: latEta1, on: float(1) });
  return { coh: latCoh, chars };
}

/**
 * One set of tiling nodes per renderer.
 *
 * These were module-level singletons, on the reasoning that the table is static
 * and may as well be uploaded once. But a `uniformArray` is not only data: it
 * owns a buffer on whichever device first compiled it, and this tool mounts more
 * than one renderer -- the offscreen capture rig does, and React's development
 * double-mount does. The second device then found the first one's buffers, and
 * every frame failed validation with "associated with [Device], and cannot be
 * used with [Device]". The table itself is still computed once and shared, being
 * ordinary numbers; only the GPU-side arrays, and the function that closes over
 * them, are per renderer.
 */
function createTilingNodes() {
  /** One descriptor per bin: segment start and count, vertex start and count. */
  const TILE_BINS = uniformArray(
    Array.from({ length: TILE_TABLE.binDescs.length / 4 }, (_, i) =>
      new THREE.Vector4(
        TILE_TABLE.binDescs[i * 4],
        TILE_TABLE.binDescs[i * 4 + 1],
        TILE_TABLE.binDescs[i * 4 + 2],
        TILE_TABLE.binDescs[i * 4 + 3]
      )
    ),
    'vec4'
  );
  /** The segments themselves, grouped by bin — read straight, no indirection. */
  const TILE_SEGS = uniformArray(
    Array.from({ length: TILE_TABLE.binSegs.length / 4 }, (_, i) =>
      new THREE.Vector4(
        TILE_TABLE.binSegs[i * 4],
        TILE_TABLE.binSegs[i * 4 + 1],
        TILE_TABLE.binSegs[i * 4 + 2],
        TILE_TABLE.binSegs[i * 4 + 3]
      )
    ),
    'vec4'
  );
  const TILE_VERTS = uniformArray(
    Array.from({ length: TILE_TABLE.binVerts.length / 2 }, (_, i) =>
      new THREE.Vector2(TILE_TABLE.binVerts[i * 2], TILE_TABLE.binVerts[i * 2 + 1])
    ),
    'vec2'
  );

  /**
   * A catalogue tiling's edge and vertex distance, by walking its own segments.
   *
   * The three original grids each got a hand-written distance function; a
   * catalogue cannot, so a tiling's ink is data — the segments of its cell and
   * of every neighbour within reach, in the shared uniform table. The point
   * folds into the cell once and the walk is flat, with no neighbourhood search,
   * because the table already carries the copies that could win.
   *
   * The fold is the fractional part in the generator basis, which is the same
   * pair of coordinates the character scan reads off this layer — so the ink and
   * the indices agree about what a cell is, by construction.
   *
   * The stretch lives in world space: the fold and the closest-point solve run in
   * unstretched layer coordinates and only the final difference is scaled, so an
   * anisotropic tiling stretches its ink rather than its parameterisation. That
   * is the convention the hexagon and triangle grids already use.
   */
  const tilingInkFn = Fn(([p, cellVec, spacing, scaleVec, binBase, bins, wantEdge, wantVert]) => {
    const sgn = (v) => step(0, v).mul(2).sub(1).mul(v.abs().max(1e-4));
    const sx = sgn(scaleVec.x);
    const sy = sgn(scaleVec.y);
    const q = vec2(p.x.div(sx), p.y.div(sy));
    const a = cellVec.xy;
    const b = cellVec.zw;
    const det = a.x.mul(b.y).sub(a.y.mul(b.x));
    const safe = step(0, det).mul(2).sub(1).mul(det.abs().max(1e-6));
    const u = q.x.mul(b.y).sub(q.y.mul(b.x)).div(safe).fract();
    const v = a.x.mul(q.y).sub(a.y.mul(q.x)).div(safe).fract();
    const f = a.mul(u).add(b.mul(v)).toVar();

    // The bin this point lands in. Its list holds every segment that could be
    // nearest to any point in the bin, so the walk is exact — it simply skips
    // the copies that never could have won. Twenty-four taps over a two-tiling
    // stack made walking the whole list cost more than everything else in the
    // frame put together.
    const nb = float(bins);
    const bi = u.mul(nb).floor().clamp(0, nb.sub(1));
    const bj = v.mul(nb).floor().clamp(0, nb.sub(1));
    const desc = TILE_BINS.element(binBase.add(int(bj.mul(nb).add(bi))));

    // Each walk is skipped when nothing asks for it — a uniform branch, so a
    // stack that draws edges without vertex dots pays for one loop, not two.
    const edge = float(1e8).toVar();
    Loop(wantEdge.greaterThan(0.5).select(int(desc.y), int(0)), ({ i }) => {
      const seg = TILE_SEGS.element(int(desc.x).add(i));
      const p1 = seg.xy.mul(spacing);
      const e = seg.zw.sub(seg.xy).mul(spacing);
      const t = f.sub(p1).dot(e).div(max(e.dot(e), float(1e-9))).clamp(0, 1);
      const d = f.sub(p1.add(e.mul(t)));
      edge.assign(min(edge, length(vec2(d.x.mul(sx), d.y.mul(sy)))));
    });

    const vert = float(1e8).toVar();
    Loop(wantVert.greaterThan(0.5).select(int(desc.w), int(0)), ({ i }) => {
      const vtx = TILE_VERTS.element(int(desc.z).add(i));
      const d = f.sub(vtx.mul(spacing));
      vert.assign(min(vert, length(vec2(d.x.mul(sx), d.y.mul(sy)))));
    });

    return vec2(edge, vert);
  });

  return { ink: tilingInkFn };
}

function tilingInk(slot, p) {
  const hit = slot.tiling.ink(
    p,
    slot.tileCell,
    slot.spacing,
    slot.scale,
    slot.tileBinBase,
    slot.tileBins,
    max(slot.drawEdges, slot.tileFill),
    slot.vertexSize
  ).toVar();
  return { edge: hit.x, vert: hit.y };
}

/**
 * The tap loop: the whole stack composited once per tap, each layer
 * advanced by its schedule — scalars slide their solved phase at the
 * scan's rates, lattices resample along the matched combination — and the
 * taps averaged into the mean the envelope grades. One tap at zero sweep
 * is the ordinary render, bit for bit.
 */
function sweepStack(camera, view, solved, latCoh, scan, scanOn, table = null) {
  const { rateA, rateB, rateC, devW, pickA, pickB } = scan;
  // Two averages ride the loop together: the winning schedule's, and the
  // plain diagonal's. They differ only in the ranked scalar layers' slide
  // rates, so the second costs a few instructions per tap, and the blend by
  // devW below is what turns the winner's boundary from a seam into a fade.
  const sumDev = vec3(0).toVar();
  const sumDiag = vec3(0).toVar();
  // Each layer's own mean ink rides along too: compositing those means in
  // paint order gives the INDEPENDENT-PHASE mean — the DC of the envelope,
  // with every beat correlation left out — which is the pivot the grading
  // expands about. It has to be per pixel: a fan's duty falls with radius, a
  // parabola's with |x|, a field-warped family's wherever the field
  // stretches its gap, and grading that drifting DC against one global
  // constant crushed three dense fans to a black frame around a blown core.
  // Accumulated from the taps themselves, it is exact for every family,
  // morph, field, and tiling, with no nominal ink model at all — and where
  // no beat stands, mean == pivot identically, so the view sits at the true
  // local gray at any contrast.
  const sumLayer = solved.map(() => float(0).toVar());
  // Each layer's mean SQUARED alpha rides beside its mean: the square-law
  // observer's pivot is E[c²] over independent phases, which the per-layer
  // pairs (E[α], E[α²]) compose exactly (pivotStep below).
  const sumLayerSq = solved.map(() => float(0).toVar());
  const meanOut = vec3(0).toVar();
  const pivotOut = vec3(camera.background).toVar();
  const pivotSq = vec3(camera.background).mul(vec3(camera.background)).toVar();
  // One layer joins the independent-phase pivot. E[c] composites as the
  // shipped mix; E[c²] needs the previous E[c] as well: with c' = c(1 − α) +
  // col·α and α independent of c, E[c'²] = E[c²]·E[(1−α)²] + 2·E[c]·col·E[α(1−α)]
  // + col²·E[α²], where E[(1−α)²] = 1 − 2m + m₂ and E[α(1−α)] = m − m₂.
  // Exact for every family, since independence is the whole assumption.
  const pivotStep = (col, m, m2) => {
    pivotSq.assign(
      pivotSq
        .mul(float(1).sub(m.mul(2)).add(m2))
        .add(pivotOut.mul(col).mul(m.sub(m2)).mul(2))
        .add(col.mul(col).mul(m2))
    );
    pivotOut.assign(mix(pivotOut, col, m));
  };

  // Inside the enveloped average the stroke keeps its TRUE width: the
  // hairline floor (1.15 px) exists so a render's line survives the screen,
  // but inside the mean it inflates every stroke as the zoom falls, duty
  // saturates, and the beat modulation drains out of the average — the
  // envelope "blurred away" on zoom-out. The envelope's display features are
  // fringes, not carriers; sub-pixel strokes keep correct mean coverage
  // through the aa ramp, which is all the integral needs.
  const isEnv = step(float(1.5), float(view.taps));

  // The pixel as a pooling observer (see the `pool` uniform): members per
  // BUFFER pixel of the finest visible family, and the weight with which the
  // drawn colour hands over to the synthesis -- nothing while every
  // harmonic the buffer can show is one the synthesis carries, everything
  // by the pitch where a hard stroke's harmonics reach the buffer's comb
  // (seven pixels a period to four for a pair, which keeps eight harmonics;
  // a shorter series hands over later). The drawing fails a buffer in two
  // ways: a period it cannot resolve, and a stroke it cannot -- its
  // 0.7-pixel ramp wider than the stroke's half-width, so every sample is
  // partial. Measured in the buffer's own pixels: a coarser interaction
  // buffer pools more, and since the synthesis draws the same profile the
  // rest frame draws, only through the buffer's window, that changes no
  // mean -- a coarse frame is the rest frame through a wider window.
  const poolPx = float(1).div(max(camera.zoom, float(0.08)));
  const poolPxRest = poolPx.mul(camera.scale.max(0.05));
  const poolWRest = float(0).toVar();
  const poolWBuf = float(0).toVar();
  const strokeW = float(0).toVar();
  solved.forEach(({ slot, halfT, aa }) => {
    const members = slot.active.div(slot.spacing.abs().max(1e-3));
    poolWRest.assign(max(poolWRest, poolPxRest.mul(members)));
    poolWBuf.assign(max(poolWBuf, poolPx.mul(members)));
    strokeW.assign(max(strokeW, aa.div(halfT.max(1e-6)).mul(slot.active)));
  });
  const [bandLo, bandHi] = POOL_BAND[Math.min(solved.length, 4)];
  const poolOn = view.pool.clamp(0, 1);
  // The REST weight decides the look: how far the profile has gone from the
  // drawn one (soft ramp, composited per layer) to the true one (hard, the
  // window applied to the composite). The BUFFER weight decides only
  // whether the buffer can still point-sample the drawing, and never moves
  // a mean, because what it hands to is that same drawing under the
  // buffer's window.
  const poolTRest = smoothstep(float(bandLo), float(bandHi), poolWRest).mul(poolOn);
  const poolTBuf = max(
    smoothstep(float(bandLo), float(bandHi), poolWBuf),
    smoothstep(float(0.65), float(1.0), strokeW)
  ).mul(poolOn);
  const poolT = max(poolTRest, poolTBuf);

  const tapLoop = () => {
  Loop(view.taps, ({ i }) => {
    // Centred on zero so that a single tap is the pattern itself, and so that
    // the trio of members brackets every phase the sweep visits.
    const along = float(i).add(0.5).div(float(view.taps));
    const u = along.sub(0.5).mul(view.sweep);

    // The scrambled generator's offsets: a rank-1 golden-ratio rule over the
    // taps, quasi-uniform over the cell whichever parity or count the taps
    // have. Which generator it scrambles is the per-pixel choice above.
    const v = float(i).mul(GOLDEN).fract().sub(0.5).mul(view.sweep);

    const colorDev = camera.background.toVar();
    const colorDiag = camera.background.toVar();
    solved.forEach(({ slot, local, halfT, aa, aaRest, isLattice, cell, shift, phase, phaseFrom }, index) => {
      If(slot.active.greaterThan(0.5), () => {
        // The ranked layers advance at the integer rates that hold the
        // winning character fixed while everything else averages out;
        // unranked layers ride the diagonal, which alone preserves every
        // zero-sum character among them. All rates 1 is the plain diagonal,
        // (1, -1) the backwards sweep for a sum beat, (1, 2) and friends
        // the second-order schedules — always on the winning pair only.
        const rate = float(1).toVar();
        If(view.ratioA.equal(int(index)), () => rate.assign(rateA));
        If(view.ratioB.equal(int(index)), () => rate.assign(rateB));
        If(view.ratioC.equal(int(index)), () => rate.assign(rateC));
        // Uniform per slot, so the diagonal twin below costs nothing on the
        // layers whose rate can never deviate — and nothing at all in a
        // plain render, where devW sits at its zero default and the blend
        // below returns the diagonal chain regardless.
        const ranked = view.ratioA
          .equal(int(index))
          .or(view.ratioB.equal(int(index)))
          .or(view.ratioC.equal(int(index)))
          .and(scanOn);
        const hInk = mix(halfT, max(slot.thickness.mul(0.5), float(1e-3)), isEnv);
        // The ramp never exceeds the half-stroke (see exactAlphaWgsl): a
        // symmetric ramp conserves a stroke's mass only while it fits inside
        // it. The tap loop, the chain and the synthesis draw one profile.
        const aaUse = mix(aa, aaRest, isEnv).min(hInk);
        const strokeAlpha = (d) =>
          float(1)
            .sub(smoothstep(hInk.sub(aaUse), hInk.add(aaUse), d))
            .mul(slot.opacity);

        const alpha = float(0).toVar();
        const alphaDiag = float(0).toVar();
        If(isLattice, () => {
          // A lattice has no scalar phase to slide, so it resamples: each
          // generator is a translation, and stepping along one is exactly one step
          // of the index it counts. The field rides in on the first of them.
          // The schedule is the per-pixel coefficient choice above.
          const uLat = u.mul(latCoh[index].cu1).add(v.mul(latCoh[index].cv1));
          const vLat = u.mul(latCoh[index].cu2).add(v.mul(latCoh[index].cv2));
          const shifted = local.sub(cell.xy.mul(uLat.add(shift))).sub(cell.zw.mul(vLat));
          // Both lookups sit behind what asks for them: a lattice resample is the
          // most expensive thing a tap can do, and the sweep does it two dozen
          // times over.
          const kind = slot.type.sub(5);
          const ink = float(0).toVar();
          const edgeD = float(1e8).toVar();
          const vertD = float(1e8).toVar();
          If(slot.type.greaterThan(13.5), () => {
            const hit = tilingInk(slot, shifted);
            edgeD.assign(hit.edge);
            vertD.assign(hit.vert);
          }).Else(() => {
            If(slot.drawEdges.greaterThan(0.5).or(slot.tileFill.greaterThan(0.001)), () => {
              edgeD.assign(
                gridDistance(shifted, kind, slot.spacing, float(0), slot.scale.x, slot.scale.y)
              );
            });
            If(slot.vertexSize.greaterThan(0.001), () => {
              vertD.assign(
                gridDistance(shifted, kind, slot.spacing, float(1), slot.scale.x, slot.scale.y)
              );
            });
          });
          If(slot.drawEdges.greaterThan(0.5), () => {
            ink.assign(float(1).sub(smoothstep(hInk.sub(aa), hInk.add(aa), edgeD)));
          });
          If(slot.vertexSize.greaterThan(0.001), () => {
            const vR = slot.vertexSize;
            ink.assign(
              max(ink, float(1).sub(smoothstep(max(vR.sub(aa), float(0)), vR.add(aa), vertD)))
            );
          });
          // Fill inks a face inward from its edges. Because the threshold is
          // an inset, a face survives only while its incircle clears it — so
          // one slider sweeps from the largest faces alone through to solid,
          // and which faces are large is exactly what distinguishes one
          // tiling from another.
          If(slot.tileFill.greaterThan(0.001), () => {
            ink.assign(
              max(ink, smoothstep(slot.tileFillEdge.sub(aa), slot.tileFillEdge.add(aa), edgeD))
            );
          });
          alpha.assign(ink.mul(slot.opacity));
          // Rates never touch a lattice's schedule, so both chains share it.
          alphaDiag.assign(alpha);
        }).Else(() => {
          // One local period per unit of `u`, so the sweep covers exactly one
          // carrier cycle whatever the family's pitch happens to be here. A
          // |rate| of 2 advances up to a full local period, past the trio the
          // solve bracketed, so the offset wraps back into the half-period the
          // trio covers -- exact for the phase families, whose residual is
          // periodic in the gap, and first-order elsewhere, like the slide
          // itself. At |rate| = 1 the wrap never engages.
          const slide = (ph, rt) => {
            const gap = max(ph.y.sub(ph.x).abs(), float(1e-6));
            const off = u.mul(rt).mul(gap);
            const wrapped = off.sub(round(off.div(gap)).mul(gap));
            return phaseDistWgsl(ph, wrapped);
          };
          If(slot.morph.greaterThan(0.999), () => {
            alpha.assign(strokeAlpha(slide(phase, rate)));
          }).Else(() => {
            alpha.assign(
              strokeAlpha(mix(slide(phaseFrom, rate), slide(phase, rate), slot.morph))
            );
          });
          // The diagonal twin, for the schedule handover. Identical unless
          // this layer is ranked, so only the ranked slots pay the second
          // slide.
          If(ranked, () => {
            If(slot.morph.greaterThan(0.999), () => {
              alphaDiag.assign(strokeAlpha(slide(phase, float(1))));
            }).Else(() => {
              alphaDiag.assign(
                strokeAlpha(mix(slide(phaseFrom, float(1)), slide(phase, float(1)), slot.morph))
              );
            });
          }).Else(() => {
            alphaDiag.assign(alpha);
          });
        });
        colorDev.assign(mix(colorDev, slot.color, alpha.clamp(0, 1)));
        colorDiag.assign(mix(colorDiag, slot.color, alphaDiag.clamp(0, 1)));
        const aD = alphaDiag.clamp(0, 1);
        sumLayer[index].addAssign(aD);
        sumLayerSq[index].addAssign(aD.mul(aD));
      });
    });
    // The observer's front end meets the drawing at this tap, before the
    // average: a square-law detector sees E[c²], which is not E[c]².
    sumDev.addAssign(mix(colorDev, colorDev.mul(colorDev), view.observer));
    sumDiag.addAssign(mix(colorDiag, colorDiag.mul(colorDiag), view.observer));
  });
  solved.forEach(({ slot }, index) => {
    If(slot.active.greaterThan(0.5), () => {
      pivotStep(
        vec3(slot.color),
        sumLayer[index].div(float(view.taps)),
        sumLayerSq[index].div(float(view.taps))
      );
    });
  });
  meanOut.assign(mix(sumDiag, sumDev, devW).div(float(view.taps)));
  };

  // The EXACT path: for an all-scalar stack (writeSlots raises the uniform)
  // the sweep is not sampled at all — both chains are integrated in closed
  // form by the generated segment integrator, and the pivot is each layer's
  // exact mean coverage. The tap loop remains for lattices, whose cell
  // average has no 1-D segmentation, and for the plain render.
  If(view.exactSweep.greaterThan(0.5), () => {
    const chain = exactChain(solved.length);
    const argsDev: unknown[] = [view.sweep, vec3(camera.background), view.observer];
    const argsDiag: unknown[] = [view.sweep, vec3(camera.background), view.observer];
    const rates: unknown[] = [];
    const prs = solved.map(({ slot, aaRest, phase }, index) => {
      const hInk = max(slot.thickness.mul(0.5), float(1e-3));
      const pr = vec4(hInk, aaRest, slot.opacity, float(0));
      const rate = float(1).toVar();
      rates.push(rate);
      If(scanOn, () => {
        If(view.ratioA.equal(int(index)), () => rate.assign(rateA));
        If(view.ratioB.equal(int(index)), () => rate.assign(rateB));
        If(view.ratioC.equal(int(index)), () => rate.assign(rateC));
      });
      argsDev.push(phase, pr, vec3(slot.color), slot.active, rate);
      argsDiag.push(phase, pr, vec3(slot.color), slot.active, float(1));
      return pr;
    });
    // While a hand is on the view the envelope is drawn by the synthesis
    // below: the same terms the chain integrates, the slide multiplier on
    // each, and the pixel's window on each at its true frequency, so nothing
    // past the buffer's Nyquist is drawn. The chain point-sampled by a
    // reduced buffer aliased its own fast beats -- at the foci of a ring
    // pair -- into rosettes that vanished when the hand lifted; and the
    // chain is slow, so every gesture opened on a coarse buffer. The
    // synthesis is alias-free at any buffer and cheap, so the stream can
    // start full size and stay crisp. Same mean; at rest the chain, sharp.
    const wEnv = solved.length <= SYNTH_MAX_K ? view.stream.clamp(0, 1) : float(0);
    const exact = vec3(0).toVar();
    const tableOn = view.table.greaterThan(0.5);
    If(wEnv.lessThan(0.999).and(tableOn.not()), () => {
      const diag = chain(...argsDiag);
      // The deviation chain runs only where the scan actually deviates —
      // devW is zero at most pixels of most scenes, and the chain is the
      // expensive half. The 0.003 skirt costs at most 0.3% of a blend.
      const dev = vec3(0).toVar();
      If(devW.greaterThan(0.003), () => {
        dev.assign(chain(...argsDev));
      });
      exact.assign(mix(diag, dev, devW.mul(step(0.003, devW))));
    });
    if (solved.length <= SYNTH_MAX_K) {
      If(wEnv.greaterThan(0.001).and(tableOn.not()), () => {
        const synth = poolSynth(solved.length);
        const args: unknown[] = [view.observer, vec3(camera.background), view.sweep, devW, float(SYNTH_SIGMA)];
        solved.forEach(({ slot, phase, sgrad }, index) => {
          args.push(phase, sgrad, prs[index], vec3(slot.color), slot.active, rates[index]);
        });
        exact.assign(mix(exact, synth(...args), wEnv));
      });
    }
    meanOut.assign(exact);
    solved.forEach(({ slot, phase }, index) => {
      If(slot.active.greaterThan(0.5), () => {
        const mm = vec2(0).toVar();
        // Under the table the gap is the pitch and the profile symmetric, so
        // the layer's mean over its period is closed form: the stroke's mass
        // is its width (a symmetric ramp conserves it), and the square loses
        // 0.514 of a ramp to the ramp's shoulders.
        If(view.table.greaterThan(0.5), () => {
          const gap = slot.spacing.abs().max(1e-3);
          const h = min(prs[index].x, gap.mul(0.5));
          const r = min(prs[index].y, h);
          const al = prs[index].z.clamp(0, 1);
          const m1 = al.mul(h.mul(2)).div(gap).min(1);
          const m2 = al.mul(al).mul(h.mul(2).sub(r.mul(0.514))).div(gap).clamp(0, 1);
          mm.assign(vec2(m1, m2));
        }).Else(() => {
          mm.assign(exactLayerMean(phase, prs[index]));
        });
        pivotStep(vec3(slot.color), mm.x, mm.y);
      });
    });
    // THE ENVELOPE OF A PAIR IS A PICTURE ON THE QUOTIENT. Its slide average
    // depends on the two phases only through one number, the character the
    // schedule holds fixed: φ₁ − φ₂ for the diagonal, aφ₁ + bφ₂ for the
    // deviation the scan picked. So it is a one-dimensional periodic
    // function of that count -- the tent -- and the renderer tabulates it
    // once per frame by the exact chain (512 samples a cycle, one row per
    // character), where before the chain ran per pixel. The pixel then
    // reads the tent at its own count through its window: a Gaussian along
    // the count of width sigma times the character's gradient, five
    // Gauss--Hermite taps, and the pivot (the tent's mean) where the beat
    // is faster than the window resolves. Ninety milliseconds a frame
    // became a few texture reads; the fast beats at a ring pair's foci,
    // which the per-pixel chain point-sampled into rosettes on a reduced
    // buffer, are anti-aliased; and a stream draws exactly the rest frame.
    if (solved.length === 2 && table) {
      If(tableOn, () => {
        const [L0, L1] = solved;
        const gap0 = L0.phase.y.sub(L0.phase.x).abs().max(1e-6);
        const gap1 = L1.phase.y.sub(L1.phase.x).abs().max(1e-6);
        const phi0 = L0.phase.x.div(gap0);
        const phi1 = L1.phase.x.div(gap1);
        const sig = float(TABLE_SIGMA);
        const lookup = (row, chi, s) => {
          const v = row.add(0.5).div(TABLE_ROWS);
          const acc = vec3(0).toVar();
          TABLE_TAPS.forEach(([t, wq]) => {
            acc.addAssign(texture(table, vec2(fract(chi.add(s.mul(t))), v)).rgb.mul(wq));
          });
          // Five taps average a tent evenly only while they span well under a
          // cycle; past 0.12 of a cycle the beat is unresolvable anyway, and
          // the pixel shows the tent's mean, which is the pivot.
          return mix(acc, pivotOut, smoothstep(float(0.12), float(0.28), s));
        };
        const rowDiag = float(tableRow(1, -1));
        const Td = lookup(rowDiag, phi0.sub(phi1), sig.mul(L0.sgrad.sub(L1.sgrad).length()));
        // The deviation's character (a, b) is in the scan's ranked order, A
        // and B; the table's rows are in slot order, so swap when A is slot 1.
        // Then normalise to a > 0, in the table's range.
        const swap = step(float(0.5), float(view.ratioA));
        const aR = mix(pickA, pickB, swap);
        const bR = mix(pickB, pickA, swap);
        const flip = step(aR, float(-0.5));
        const a = aR.mul(float(1).sub(flip.mul(2)));
        const b = bR.mul(float(1).sub(flip.mul(2)));
        const valid = step(float(0.5), a)
          .mul(step(a, float(TABLE_A_MAX + 0.5)))
          .mul(step(float(0.5), b.abs()))
          .mul(step(b.abs(), float(TABLE_B_MAX + 0.5)));
        const bi = mix(b.add(TABLE_B_MAX), b.add(TABLE_B_MAX - 1), step(float(0.5), b));
        const rowDev = a.sub(1).mul(2 * TABLE_B_MAX).add(bi);
        const chiDev = phi0.mul(a).add(phi1.mul(b));
        const Tdev = lookup(rowDev, chiDev, sig.mul(L0.sgrad.mul(a).add(L1.sgrad.mul(b)).length()));
        meanOut.assign(mix(Td, Tdev, devW.mul(step(0.003, devW)).mul(valid)));
      });
    }
  }).Else(() => {
    tapLoop();
    // The pixel as a pooling observer (see the `pool` uniform and
    // poolSynthSource). Where the buffer can no longer show the drawing
    // faithfully by point samples, the drawn colour hands over to the
    // drawing's Fourier series under the pixel's own window: each term at
    // its true two-dimensional frequency, kept or killed by a Gaussian half
    // a pixel wide and cut past the buffer's Nyquist square. Nothing
    // wider: a stripe the screen can show keeps its contrast (half of it at
    // three pixels a period), only what would alias goes, and the beat
    // emerges by eye, as it does on paper. The profile is the drawn one --
    // the same floored stroke, the same rest ramp, the same ink -- so the
    // hand-over changes no mean, and a coarse interaction buffer, seeing
    // the same profile through its own wider window, shows the rest frame
    // pooled rather than a darker or an aliased one.
    // One or two families: the window integral itself (poolDirect), at
    // every zoom -- it replaces the point-sampled drawing outright, so there
    // is no hand-over and nothing to keep consistent. The window is as
    // crisp as the drawn edge where the pitch is coarse and widens to keep
    // a fine pitch's harmonics off the buffer's comb, in the buffer's own
    // pixels, so a coarse interaction buffer sees the same drawing through
    // a wider window: the same light, no alias, no flash.
    if (solved.length <= 2) {
      If(view.pool.greaterThan(0.5), () => {
        // The window widens with the pitch, in the buffer's own pixels:
        // the drawn edge's crispness at seven pixels a period and coarser,
        // half a pixel by four, and 0.9 by two, where a stripe sits at the
        // buffer's Nyquist and a Gaussian narrower than that would pass a
        // quarter of it to beat with the pixel grid (0.9 passes 4%).
        const sigma = mix(
          float(DIRECT_SIGMA_COARSE),
          float(DIRECT_SIGMA_FINE),
          smoothstep(float(bandLo), float(bandHi), poolWBuf)
        ).add(smoothstep(float(0.25), float(0.5), poolWBuf).mul(DIRECT_SIGMA_NYQUIST - DIRECT_SIGMA_FINE));
        const sw = sigma.mul(poolPx);
        const prs = solved.map(({ slot, halfT }) => vec4(max(halfT, float(1e-3)), slot.opacity, float(0), float(0)));
        if (solved.length === 1) {
          const { slot, phase } = solved[0];
          meanOut.assign(
            poolDirect1(float(0), vec3(camera.background), sw, phase, prs[0], vec3(slot.color), slot.active)
          );
        } else {
          const n0 = solved[0].sgrad.div(solved[0].sgrad.length().max(1e-6));
          const n1 = solved[1].sgrad.div(solved[1].sgrad.length().max(1e-6));
          const rho = n0.dot(n1).clamp(-1, 1);
          meanOut.assign(
            poolDirect2(
              float(0),
              vec3(camera.background),
              sw,
              rho,
              solved[0].phase,
              prs[0],
              vec3(solved[0].slot.color),
              solved[0].slot.active,
              solved[1].phase,
              prs[1],
              vec3(solved[1].slot.color),
              solved[1].slot.active
            )
          );
        }
      });
    } else if (solved.length <= SYNTH_MAX_K) {
      // Three or four families: the series, with its hand-over band. Two
      // profiles: the drawn one -- floored stroke, 0.7-rest-pixel ramp --
      // is what the per-layer anti-aliasing composites, and its ramps
      // double-count where strokes coincide; the true one is hard, and the
      // window applies to the composite. The rest weight carries the look
      // from the first to the second across the band; the buffer weight
      // replaces point samples of the drawn profile by the drawn profile
      // under the buffer's window.
      If(view.pool.greaterThan(0.5).and(poolT.greaterThan(0.001)), () => {
        const synth = poolSynth(solved.length);
        const call = (hard: boolean) => {
          const args: unknown[] = [float(0), vec3(camera.background), float(0), float(0), float(SYNTH_SIGMA)];
          solved.forEach(({ slot, halfT, aaRest, phase, sgrad }) => {
            const ramp = hard ? float(0) : aaRest.min(halfT);
            const pr = vec4(max(halfT, float(1e-3)), ramp, slot.opacity, float(0));
            args.push(phase, sgrad, pr, vec3(slot.color), slot.active, float(1));
          });
          return synth(...args);
        };
        const inner = meanOut.toVar();
        If(poolTBuf.greaterThan(0.001).and(poolTRest.lessThan(0.999)), () => {
          inner.assign(mix(meanOut, call(false), poolTBuf));
        });
        If(poolTRest.greaterThan(0.001), () => {
          meanOut.assign(mix(inner, call(true), poolTRest));
        }).Else(() => {
          meanOut.assign(inner);
        });
      });
    }
  });

  // The square-law observer grades about E[c²]; the linear one about E[c].
  pivotOut.assign(mix(pivotOut, pivotSq, view.observer));
  // A sole layer grades about its nominal coverage instead: its per-pixel
  // pivot equals its mean identically, and about THAT the contrast is dead.
  // (Hard ink is two-valued, so E[c²] = E[c] there and the constant serves
  // both observers; a soft sole stroke under the square-law is off by the
  // ramp's share, which is the effect the toggle exists to show.)
  pivotOut.assign(mix(pivotOut, vec3(view.pivotConst), view.soloPivot));
  return { mean: meanOut, pivot: pivotOut };
}

// ---------------------------------------------------------------------------
// The exact sweep. The enveloped mean of a scalar layer is an integral over
// one shared period of profiles alpha_i(u) that are piecewise cubic in u
// (a trapezoid with smoothstep ramps, composed with the linear slide), and
// every corner position is known in closed form from the phase trio: the
// three member residuals, the ramp edges at hInk -+ aa around each, the
// argmin midpoints between neighbours, the floor clips, and the wrap seam.
// Segmenting at the corners and integrating each segment with Gauss-4 is
// exact for a pair of cubics and better than 1e-6 beyond (validated against
// 65536-tap ground truth across pairs, trios, walking trios, radial floors,
// sub-pixel strokes, and deep rate-12 stations, where 24 taps err by 0.19).

/** Twin of the tap loop's slide + phaseDistWgsl, as one WGSL helper. */
const EXACT_TRIO_DIST_WGSL = `
fn exactTrioDist(ph: vec4<f32>, rate: f32, u: f32) -> f32 {
  let gap = max(abs(ph.y - ph.x), 1e-6);
  let off = u * rate * gap;
  let wrapped = off - round(off / gap) * gap;
  let near = min(abs(ph.x - wrapped), min(abs(ph.y - wrapped), abs(ph.z - wrapped)));
  return max(near, ph.w);
}
`;
const exactTrioDist = wgslFn(EXACT_TRIO_DIST_WGSL);

/** One layer's swept coverage: trio distance through the stroke profile.
 * pr = (hInk, aa, opacity, unused). Morphing stacks ride the tap loop, so
 * no second trio exists here. The ramp never exceeds the half-stroke: a
 * symmetric ramp conserves the stroke's mass only while it fits inside it,
 * and a ramp wider than a sub-pixel stroke inflated its coverage (a 0.6 px
 * stroke under a 0.7 px ramp carried 9% more ink than its width), which is
 * not the drawing the sweep is meant to average. */
const EXACT_ALPHA_WGSL = `
fn exactAlphaWgsl(ph: vec4<f32>, pr: vec4<f32>, rate: f32, u: f32) -> f32 {
  let d = exactTrioDist(ph, rate, u);
  let r = min(pr.y, pr.x);
  return clamp((1.0 - smoothstep(pr.x - r, pr.x + r, d)) * pr.z, 0.0, 1.0);
}
`;
const exactAlphaWgsl = wgslFn(EXACT_ALPHA_WGSL, [exactTrioDist]);

/** Corner slots per layer. A symmetric trio (every closed-form family)
 * carries at most ten distinct corners per period; a walking family's
 * asymmetric trio at most twenty. */
const EXACT_CORNERS = 20;
/** Hard bound on merge steps per chain, against pathological settings. */
const EXACT_MAX_SEGS = 512;

/** The corner emitter, shared by the chain and the per-layer mean: appends
 * every u in (lo, hi) where one phase's profile can change its polynomial
 * piece. A morphing layer calls it for both of its trios. */
/**
 * One layer's corner RESIDUES: its profile alpha(u) is periodic with period
 * P = 1/|rate| in u, and within one period the polynomial pieces change at a
 * handful of corners the trio names in closed form. This fills a sorted
 * array of those corners as offsets from `lo` folded into [0, P), so the
 * chain can stream the layer's events in order with a cursor — no global
 * event list, no global sort, no capacity to overflow. Returns P.
 */
const EXACT_RESIDUES_WGSL = `
fn exactResidues(ph: vec4<f32>, pr: vec4<f32>, rate: f32, lo: f32,
                 res: ptr<function, array<f32, ${EXACT_CORNERS}>>, cnt: ptr<function, i32>) -> f32 {
  let gap = max(abs(ph.y - ph.x), 1e-6);
  let rg = rate * gap;
  let P = 1.0 / max(abs(rate), 1e-6);
  let r = min(pr.y, pr.x);
  let hlo = pr.x - r;
  let hhi = pr.x + r;
  var corners: array<f32, ${EXACT_CORNERS}>;
  var cn = 0;
  // The nearest member's window, and the wrap seam, always.
  corners[cn] = ph.x; cn++;
  corners[cn] = ph.x - hhi; cn++; corners[cn] = ph.x + hhi; cn++;
  corners[cn] = gap * 0.5; cn++;
  if (hlo > 0.0) {
    corners[cn] = ph.x - hlo; cn++; corners[cn] = ph.x + hlo; cn++;
  }
  if (ph.w > 0.0) {
    corners[cn] = ph.x - ph.w; cn++; corners[cn] = ph.x + ph.w; cn++;
  }
  // A SYMMETRIC trio (every closed-form family) repeats one window per
  // period — the neighbours' corners coincide with the nearest member's
  // modulo the gap. Only a walking family's asymmetric trio adds them.
  let upGap = ph.y - ph.x;
  let dnGap = ph.x - ph.z;
  if (abs(upGap - dnGap) > 1e-4 * gap) {
    corners[cn] = ph.y; cn++;
    corners[cn] = ph.y - hhi; cn++; corners[cn] = ph.y + hhi; cn++;
    corners[cn] = ph.z; cn++;
    corners[cn] = ph.z - hhi; cn++; corners[cn] = ph.z + hhi; cn++;
    if (hlo > 0.0 && cn <= ${EXACT_CORNERS} - 4) {
      corners[cn] = ph.y - hlo; cn++; corners[cn] = ph.y + hlo; cn++;
      corners[cn] = ph.z - hlo; cn++; corners[cn] = ph.z + hlo; cn++;
    }
  }
  // The argmin midpoints matter only when the stroke can reach them.
  if (hhi > 0.499 * upGap && cn < ${EXACT_CORNERS}) {
    corners[cn] = (ph.x + ph.y) * 0.5; cn++;
  }
  if (hhi > 0.499 * dnGap && cn < ${EXACT_CORNERS}) {
    corners[cn] = (ph.x + ph.z) * 0.5; cn++;
  }
  // Fold each corner into its residue in [0, P) past lo, insertion-sorted.
  *cnt = 0;
  for (var j = 0; j < cn; j++) {
    let raw = (corners[j] / rg) - lo;
    var r = fract(raw / P) * P;
    var i = *cnt;
    while (i > 0 && (*res)[i - 1] > r) {
      (*res)[i] = (*res)[i - 1];
      i--;
    }
    (*res)[i] = r;
    *cnt = *cnt + 1;
  }
  return P;
}
`;
const exactResidues = wgslFn(EXACT_RESIDUES_WGSL);

/** Gauss-Legendre 3 on [0, 1]: exact through degree 5, and within a tenth
 * of a display gray level on products of cubics over corner-bounded
 * segments (validated against 65536-tap ground truth; Gauss-2 is not). */
const GAUSS3 = [
  [0.1127016653792583, 0.2777777777777778],
  [0.5, 0.4444444444444444],
  [0.8872983346207417, 0.2777777777777778],
];

const exactChainCache = new Map<number, ReturnType<typeof wgslFn>>();

/**
 * The generated exact chain for a K-slot stack. Each layer's events stream
 * in sorted order from its residue array and period, and a K-way cursor
 * merge marches the segments in order: no global event list, no sort, no
 * capacity — a rate-q schedule simply cycles its residues q times. One
 * function serves both schedules; the diagonal is the all-ones call.
 */
/** The K-slot chain's WGSL as text, built once per K: the shader's own
 * source, and what the paper's GPU harness compiles to certify the SHIPPED
 * integrator against a tap-sampled truth (paper/tools/exp/exactsweep.mjs). */
function exactChainSource(K: number): string {
  const params = Array.from(
    { length: K },
    (_, i) =>
      `ph${i}: vec4<f32>, pr${i}: vec4<f32>, col${i}: vec3<f32>, act${i}: f32, rate${i}: f32`
  ).join(', ');
  const setup = Array.from(
    { length: K },
    (_, i) => `var res${i}: array<f32, ${EXACT_CORNERS}>;
  var cnt${i} = 0;
  var P${i} = 1.0;
  var base${i} = 0.0;
  var idx${i} = 0;
  var next${i} = hi + 1.0;
  if (act${i} > 0.5) {
    P${i} = exactResidues(ph${i}, pr${i}, rate${i}, lo, &res${i}, &cnt${i});
    next${i} = lo + res${i}[0];
  }`
  ).join('\n  ');
  const pickNext = Array.from(
    { length: K },
    (_, i) => `if (next${i} < next) { next = next${i}; winner = ${i}; }`
  ).join('\n    ');
  const advance = Array.from(
    { length: K },
    (_, i) => `if (winner == ${i}) {
      idx${i}++;
      if (idx${i} >= cnt${i}) { idx${i} = 0; base${i} += P${i}; }
      next${i} = lo + base${i} + res${i}[idx${i}];
    }`
  ).join('\n    ');
  const composite = Array.from(
    { length: K },
    (_, i) =>
      `if (act${i} > 0.5) { c = mix(c, col${i}, exactAlphaWgsl(ph${i}, pr${i}, rate${i}, uu)); }`
  ).join('\n        ');
  const gauss = GAUSS3.map(
    ([x, w]) => `{
        let uu = u + ${x} * len;
        var c = bg;
        ${composite}
        seg += ${w} * mix(c, c * c, obs);
      }`
  ).join('\n      ');
  return `
fn exactChain${K}(sweep: f32, bg: vec3<f32>, obs: f32, ${params}) -> vec3<f32> {
  let lo = -sweep * 0.5;
  let hi = sweep * 0.5;
  ${setup}
  var u = lo;
  var total = vec3<f32>(0.0);
  for (var it = 0; it < ${EXACT_MAX_SEGS}; it++) {
    var next = hi;
    var winner = -1;
    ${pickNext}
    let len = min(next, hi) - u;
    if (len > 1e-9) {
      var seg = vec3<f32>(0.0);
      ${gauss}
      total += seg * len;
    }
    u = min(next, hi);
    if (winner < 0 || u >= hi) { break; }
    ${advance}
  }
  return total / max(sweep, 1e-6);
}
`;
}


/**
 * THE PIXEL'S WINDOW, AS THE INTEGRAL ITSELF. For a stack of one or two
 * scalar families the pooled colour is computed in direct space: the pixel
 * is an isotropic Gaussian window of standard deviation sw (world units);
 * along family i's normal the window is a one-dimensional Gaussian of the
 * same width, and along two normals the pair is bivariate normal with
 * correlation n₀·n₁. A family inks where the displacement along its normal
 * falls within a half-width h of a member, so the light is a probability:
 * for one family Σ over members of Φ((c+h)/sw) − Φ((c−h)/sw); for two, the
 * four ink patterns' probabilities from P₀, P₁ and the joint P₀₁, the joint
 * exact in one dimension when the normals are within 25° of parallel (the
 * moiré case: the joint's second axis is then narrower than the strokes)
 * and otherwise a six-point Gauss–Legendre integral of the conditional
 * over each stroke. No series, no harmonics, no hand-over: the same
 * integral at every zoom and every buffer, a wider window on a coarser
 * buffer, the same light. Hard ink is its own square, so the square-law
 * observer is the same sum with the colours squared.
 */
const synthErf = wgslFn(`
fn synthErf(x: f32) -> f32 {
  let s = sign(x);
  let ax = abs(x);
  let t = 1.0 / (1.0 + 0.3275911 * ax);
  let y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-ax * ax);
  return s * y;
}
`, []);
const synthPhi = wgslFn(`
fn synthPhi(x: f32) -> f32 {
  return 0.5 * (1.0 + synthErf(x * 0.70710678));
}
`, [synthErf]);
const synthMember = wgslFn(`
fn synthMember(ph: vec4<f32>, k: i32) -> f32 {
  if (k >= 0) { return ph.x + f32(k) * max(ph.y - ph.x, 1e-6); }
  return ph.x + f32(k) * max(ph.x - ph.z, 1e-6);
}
`, []);
/** The member indices whose stroke can reach the window: k in [lo, hi] with
 * |member(k)| <= reach, clamped to six either side of the nearest. */
const synthMembers = wgslFn(`
fn synthMembers(ph: vec4<f32>, reach: f32) -> vec2<i32> {
  let up = max(ph.y - ph.x, 1e-6);
  let dn = max(ph.x - ph.z, 1e-6);
  let lo = i32(ceil((-reach - ph.x) / dn - 1e-4));
  let hi = i32(floor((reach - ph.x) / up + 1e-4));
  return vec2<i32>(max(lo, -6), min(hi, 6));
}
`, []);
const synthCover = wgslFn(`
fn synthCover(ph: vec4<f32>, h: f32, sw: f32) -> f32 {
  let reach = 3.0 * sw + h;
  let ks = synthMembers(ph, reach);
  var P = 0.0;
  for (var k = ks.x; k <= ks.y; k++) {
    let c = synthMember(ph, k);
    P += synthPhi((c + h) / sw) - synthPhi((c - h) / sw);
  }
  return clamp(P, 0.0, 1.0);
}
`, [synthMember, synthMembers, synthPhi]);
const poolDirect1 = wgslFn(`
fn poolDirect1(obs: f32, bg: vec3<f32>, sw: f32, ph0: vec4<f32>, pr0: vec4<f32>, col0: vec3<f32>, act0: f32) -> vec3<f32> {
  let gap0 = max(abs(ph0.y - ph0.x), 1e-6);
  let h0 = min(pr0.x, 0.5 * gap0);
  let P0 = synthCover(ph0, h0, sw) * act0;
  let cInk = mix(bg, col0, pr0.y);
  let c = mix(bg, cInk, P0);
  let c2 = mix(bg * bg, cInk * cInk, P0);
  return mix(c, c2, obs);
}
`, [synthCover]);
const poolDirect2 = wgslFn(`
fn poolDirect2(obs: f32, bg: vec3<f32>, sw: f32, rho: f32, ph0: vec4<f32>, pr0: vec4<f32>, col0: vec3<f32>, act0: f32, ph1: vec4<f32>, pr1: vec4<f32>, col1: vec3<f32>, act1: f32) -> vec3<f32> {
  let gap0 = max(abs(ph0.y - ph0.x), 1e-6);
  let gap1 = max(abs(ph1.y - ph1.x), 1e-6);
  let h0 = min(pr0.x, 0.5 * gap0);
  let h1 = min(pr1.x, 0.5 * gap1);
  let P0 = synthCover(ph0, h0, sw) * act0;
  let P1 = synthCover(ph1, h1, sw) * act1;
  var P01 = 0.0;
  // No stroke of either family within the window's reach: no joint ink.
  if (act0 > 0.5 && act1 > 0.5 && P0 > 1e-4 && P1 > 1e-4) {
    let reach0 = 3.0 * sw + h0;
    let reach1 = 3.0 * sw + h1;
    let ks = synthMembers(ph0, reach0);
    let ls = synthMembers(ph1, reach1);
    if (abs(rho) > 0.9) {
      // Nearly parallel: the second displacement is rho times the first.
      let ir = 1.0 / rho;
      for (var k = ks.x; k <= ks.y; k++) {
        let c = synthMember(ph0, k);
        let a0 = c - h0;
        let b0 = c + h0;
        for (var l = ls.x; l <= ls.y; l++) {
          let d = synthMember(ph1, l);
          let e0 = (d - h1) * ir;
          let e1 = (d + h1) * ir;
          let lo = max(a0, min(e0, e1));
          let hi = min(b0, max(e0, e1));
          if (hi > lo) { P01 += synthPhi(hi / sw) - synthPhi(lo / sw); }
        }
      }
    } else {
      // Crossing: integrate the conditional cover of the second family over
      // each stroke of the first, under the first's Gaussian.
      let s = sqrt(1.0 - rho * rho);
      let sws = sw * s;
      let lim = 3.0 * sw;
      for (var k = ks.x; k <= ks.y; k++) {
        let c = synthMember(ph0, k);
        let a = max(c - h0, -lim);
        let b = min(c + h0, lim);
        if (b <= a) { continue; }
        let mid = 0.5 * (a + b);
        let half = 0.5 * (b - a);
        for (var q = 0; q < 6; q++) {
          var x = 0.2386191861; var wq = 0.4679139346;
          if (q == 1) { x = -0.2386191861; }
          if (q == 2) { x = 0.6612093865; wq = 0.3607615730; }
          if (q == 3) { x = -0.6612093865; wq = 0.3607615730; }
          if (q == 4) { x = 0.9324695142; wq = 0.1713244924; }
          if (q == 5) { x = -0.9324695142; wq = 0.1713244924; }
          let u = mid + half * x;
          let wgt = half * wq * 0.39894228 * exp(-0.5 * u * u / (sw * sw)) / sw;
          var G = 0.0;
          for (var l = ls.x; l <= ls.y; l++) {
            let d = synthMember(ph1, l);
            G += synthPhi((d + h1 - rho * u) / sws) - synthPhi((d - h1 - rho * u) / sws);
          }
          P01 += wgt * clamp(G, 0.0, 1.0);
        }
      }
    }
  }
  P01 = clamp(P01, 0.0, min(P0, P1));
  let pNone = max(1.0 - P0 - P1 + P01, 0.0);
  let pOnly0 = max(P0 - P01, 0.0);
  let pOnly1 = max(P1 - P01, 0.0);
  let c0 = mix(bg, col0, pr0.y);
  let c1 = mix(bg, col1, pr1.y);
  let cBoth = mix(c0, col1, pr1.y);
  let c = pNone * bg + pOnly0 * c0 + pOnly1 * c1 + P01 * cBoth;
  let c2 = pNone * bg * bg + pOnly0 * c0 * c0 + pOnly1 * c1 * c1 + P01 * cBoth * cBoth;
  return mix(c, c2, obs);
}
`, [synthCover, synthMember, synthMembers, synthPhi]);
const DIRECT_SIGMA_COARSE = 0.35;
const DIRECT_SIGMA_FINE = 0.55;
const DIRECT_SIGMA_NYQUIST = 0.9;


/**
 * THE PAIR TABLE. One row per character (a, b), a in 1..TABLE_A_MAX and b in
 * -TABLE_B_MAX..TABLE_B_MAX without 0 (the diagonal is (1, -1)); along the
 * row, TABLE_N samples of the tent over one cycle of the character's count.
 * Each texel runs the exact chain on synthetic trios that realise the count
 * -- phase chi/a for the first family, 0 for the second, symmetric members a
 * pitch apart -- under the schedule that holds the character fixed, rates
 * (|b|, -a·sign b). Whole-number sweeps give the same tent, so the sweep
 * is one; the profile is the chain's (true width, the rest ramp), and the
 * observer's front end is applied inside, so the table is E[c] or E[c²].
 */
export const TABLE_N = 512;
export const TABLE_A_MAX = 6;
export const TABLE_B_MAX = 6;
export const TABLE_ROWS = TABLE_A_MAX * 2 * TABLE_B_MAX;
/** The pixel's window along the count, in buffer pixels: the tent is smooth,
 * its harmonics fall as 1/m², so the drawn edge's crispness serves. */
const TABLE_SIGMA = 0.4;

/** Five-point Gauss--Hermite taps for a unit Gaussian: offsets and weights. */
const TABLE_TAPS: [number, number][] = [
  [0, 0.533333],
  [1.355626, 0.222076],
  [-1.355626, 0.222076],
  [2.85697, 0.011257],
  [-2.85697, 0.011257],
];
function tableRow(a: number, b: number): number {
  return (a - 1) * 2 * TABLE_B_MAX + (b < 0 ? b + TABLE_B_MAX : b + TABLE_B_MAX - 1);
}

export function buildTableColorNode(camera: CameraUniforms, view: ViewUniforms, slots: LayerSlot[]) {
  return Fn(() => {
    const u = uv();
    const chi = u.x;
    // A render target's first texel row is the quad's TOP edge (uv.y = 1),
    // and sampling reads v = 0 there: the row is written upside down so that
    // the lookup's v = (row + 0.5) / rows lands on it.
    const row = floor(float(1).sub(u.y).mul(TABLE_ROWS));
    const a = floor(row.div(2 * TABLE_B_MAX)).add(1);
    const bi = row.sub(a.sub(1).mul(2 * TABLE_B_MAX));
    const b = mix(bi.sub(TABLE_B_MAX), bi.sub(TABLE_B_MAX - 1), step(float(TABLE_B_MAX - 0.5), bi));
    const wP = b.abs();
    const wQ = a.negate().mul(b.sign());
    const gap0 = slots[0].spacing.abs().max(1e-3);
    const gap1 = slots[1].spacing.abs().max(1e-3);
    const x0 = chi.div(a).mul(gap0);
    const ph0 = vec4(x0, x0.add(gap0), x0.sub(gap0), float(0));
    const ph1 = vec4(float(0), gap1, gap1.negate(), float(0));
    const aaRest = float(0.7).div(camera.zoom.max(0.08)).mul(camera.scale.max(0.05));
    const pr0 = vec4(max(slots[0].thickness.mul(0.5), float(1e-3)), aaRest, slots[0].opacity, float(0));
    const pr1 = vec4(max(slots[1].thickness.mul(0.5), float(1e-3)), aaRest, slots[1].opacity, float(0));
    const chain = exactChain(2);
    const c = chain(
      float(1),
      vec3(camera.background),
      view.observer,
      ph0,
      pr0,
      vec3(slots[0].color),
      slots[0].active,
      wP,
      ph1,
      pr1,
      vec3(slots[1].color),
      slots[1].active,
      wQ
    );
    return vec4(c, float(1));
  })();
}

/**
 * THE PIXEL'S WINDOW, TERM BY TERM. The pooled colour is the window
 * multiplier theorem run literally: the drawing's Fourier series in the K
 * phases, each term multiplied by the pixel's window at that term's own
 * spatial frequency, k = Σ mᵢ ∇φᵢ in cycles per buffer pixel. A carrier the
 * pixel cannot resolve is a term with |k| large, and the window kills it; a
 * beat that is slow at the pixel's scale is a term with |k| small, and it
 * survives; a term past the buffer's Nyquist square would alias when drawn,
 * so it is not drawn at all. The frequency is the term's TRUE one, in two
 * dimensions: where two families run parallel the (1,−1) term is slow and
 * the moiré is drawn, and where they cross at an angle it is fast and the
 * pool is grey — which is what the one-dimensional lockstep sweep this
 * replaces could not tell (it kept every (m,−m) term at full strength
 * wherever the pitches matched, and drew rosettes where the families cross).
 *
 * Profiles are the drawn ones: a box of half-width h with smoothstep ramps
 * of half-width r, coefficient sin(2πmh)/(πm) times the ramp's transform
 * (synthRamp), a floor clip subtracted where the trio carries one. The square-law observer needs the series of
 * a², a(1−a) and (1−a)² as well: hard ink is its own square, and the ramps'
 * loss a(1−a) is modelled as two narrow pulses at the edges whose mass is
 * the smoothstep's exact 0.514·r. The slide multiplies term m by
 * sinc(sweep·Σmᵢrᵢ) (Theorem thm:sweep), so the envelope has the same form.
 *
 * Harmonics per layer by stack size: (2M+1)^K terms of a cosine each. A
 * hairline is a narrow pulse with a wide spectrum, and a pair in register
 * keeps every (m,−m) term slow, so a pair needs eight: checked on the CPU
 * against brute-force window averages, eight harmonics agree to a percent
 * of light where three were off by two.
 */
const SYNTH_M = [0, 8, 8, 3, 2];
const SYNTH_MAX_K = 4;
/** The pixel's window, in buffer pixels: a Gaussian of this sigma, with the
 * cut at the Nyquist square. Half a pixel keeps a stripe of three pixels a
 * period at half contrast and one of five at three quarters. */
const SYNTH_SIGMA = 0.55;
/** Where the hand-over runs, in members per buffer pixel, by stack size: a
 * series of M harmonics carries every term the buffer can show once the
 * pitch is under 2M pixels, and a hard stroke's harmonics reach the comb
 * from about seven pixels a period; shorter series hand over later. */
const POOL_BAND: Record<number, [number, number]> = {
  1: [0.14, 0.25],
  2: [0.14, 0.25],
  3: [0.167, 0.286],
  4: [0.2, 0.333],
};

const SYNTH_SINC_WGSL = `
fn synthSinc(x: f32) -> f32 {
  let px = 3.14159265358979 * x;
  if (abs(px) < 1e-4) { return 1.0; }
  return sin(px) / px;
}
`;
const synthSinc = wgslFn(SYNTH_SINC_WGSL);
/** The drawn ramp is a smoothstep, whose slope is the parabolic bump
 * 6t(1−t): a pulse with such ramps is a box convolved with that bump, so
 * its m-th coefficient is the box's times the bump's transform at
 * a = 4πrm (r the ramp half-width in cycles), 12(2 sin(a/2) − a cos(a/2))/a³.
 * The ramps' loss a(1−a) is a bump of the same family, narrower (variance
 * 0.034 against 0.05 in ramp units), so it uses the same form at 0.824 a. */
const SYNTH_RAMP_WGSL = `
fn synthRamp(a: f32) -> f32 {
  if (a < 1e-2) { return 1.0 - a * a / 40.0; }
  return 12.0 * (2.0 * sin(a * 0.5) - a * cos(a * 0.5)) / (a * a * a);
}
`;
const synthRamp = wgslFn(SYNTH_RAMP_WGSL);
/** The integers m with |kp + m g| < c, intersected into [lo, hi]: the range
 * of one index for which a term can still land inside the Nyquist square,
 * given the frequency the outer indices have already accumulated (kp) and
 * the most the inner ones can add (folded into c). Only surviving terms are
 * visited, which is what keeps the synthesis at the plain render's cost. */
const SYNTH_RANGE_WGSL = `
fn synthRange(kp: f32, g: f32, c: f32, cur: vec2<i32>) -> vec2<i32> {
  if (abs(g) < 1e-7) {
    if (abs(kp) >= c) { return vec2<i32>(1, 0); }
    return cur;
  }
  let a = (-c - kp) / g;
  let b = (c - kp) / g;
  let l = ceil(min(a, b) + 1e-4);
  let h = floor(max(a, b) - 1e-4);
  return vec2<i32>(max(cur.x, i32(l)), min(cur.y, i32(h)));
}
`;
const synthRange = wgslFn(SYNTH_RANGE_WGSL);

const poolSynthCache = new Map<number, ReturnType<typeof wgslFn>>();

function poolSynthSource(K: number): string {
  const M = SYNTH_M[K];
  const L = Array.from({ length: K }, (_, i) => i);
  const params = L.map(
    (i) =>
      `ph${i}: vec4<f32>, g${i}: vec2<f32>, pr${i}: vec4<f32>, col${i}: vec3<f32>, act${i}: f32, rate${i}: f32`
  ).join(', ');
  // Per layer, the constants: the profile in cycles of its own pitch, and
  // one sine and cosine of each angle a harmonic advances by (the phase,
  // the half-width, the floor clip, the ramp, the ramp's loss).
  const consts = L.map(
    (i) => `let gap${i} = max(abs(ph${i}.y - ph${i}.x), 1e-6);
  let phi${i} = ph${i}.x / gap${i};
  let hc${i} = min(pr${i}.x / gap${i}, 0.5);
  let rc${i} = clamp(pr${i}.y / gap${i}, 0.0, hc${i});
  let al${i} = clamp(pr${i}.z, 0.0, 1.0) * act${i};
  let wc${i} = max(ph${i}.w, 0.0) / gap${i};
  var aw${i} = 1.0;
  if (wc${i} > hc${i} - rc${i}) {
    aw${i} = clamp((hc${i} + rc${i} - wc${i}) / max(2.0 * rc${i}, 1e-6), 0.0, 1.0);
  }
  let wcl${i} = min(wc${i}, hc${i});
  let th${i} = 6.28318530718 * phi${i};
  let hh${i} = 6.28318530718 * hc${i};
  let ww${i} = 6.28318530718 * wcl${i};
  let ra${i} = 6.28318530718 * rc${i};
  let qa${i} = 5.17735 * rc${i};
  let tc${i} = cos(th${i}); let ts${i} = sin(th${i});
  let hcs${i} = cos(hh${i}); let hsn${i} = sin(hh${i});
  let wcs${i} = cos(ww${i}); let wsn${i} = sin(ww${i});
  let rcs${i} = cos(ra${i}); let rsn${i} = sin(ra${i});
  let qcs${i} = cos(qa${i}); let qsn${i} = sin(qa${i});
  let e2${i} = exp(-2.0 * sig2 * dot(g${i}, g${i}));`
  ).join('\n  ');
  const linTerms = [
    `bg * (${L.map((j) => `b${j}`).join(' * ')})`,
    ...L.map(
      (i) => `col${i} * (${L.map((j) => (j < i ? `d${j}` : j === i ? `a${j}` : `b${j}`)).join(' * ')})`
    ),
  ];
  const sqPer = L.map(
    (i) =>
      `let aa${i} = al${i} * al${i} * (F${i} - Q${i}); let ab${i} = al${i} * (1.0 - al${i}) * F${i} + al${i} * al${i} * Q${i}; let bb${i} = d${i} - al${i} * (2.0 - al${i}) * F${i} - al${i} * al${i} * Q${i};`
  ).join('\n            ');
  // Colour term t: 0 is the background (every layer a "not inked" factor b);
  // t = i + 1 is layer i's own colour (one below it, a at it, b above it).
  const fac = (t: number, j: number) => (t === 0 ? 'b' : j < t - 1 ? 'one' : j === t - 1 ? 'a' : 'b');
  const pairName = (x: string, y: string, j: number) => {
    const key = [x, y].sort().join('|');
    return {
      'one|one': `d${j}`,
      'a|one': `a${j}`,
      'b|one': `b${j}`,
      'a|a': `aa${j}`,
      'a|b': `ab${j}`,
      'b|b': `bb${j}`,
    }[key];
  };
  const colName = (t: number) => (t === 0 ? 'bg' : `col${t - 1}`);
  const sqTerms: string[] = [];
  for (let t = 0; t <= K; t++) {
    for (let u = t; u <= K; u++) {
      const prod = L.map((j) => pairName(fac(t, j), fac(u, j), j)).join(' * ');
      sqTerms.push(`${t === u ? '' : '2.0 * '}${colName(t)} * ${colName(u)} * (${prod})`);
    }
  }
  const sumM = L.map((i) => `mf${i}`).join(' + ');
  const sumMR = L.map((i) => `mf${i} * rate${i}`).join(' + ');
  // The innermost body: the term's window, the slide, the colour terms.
  const term = `let kx = kpx${K} ; let ky = kpy${K};
          let mm = max(abs(kx), abs(ky));
          if (mm < 0.5) {
            let Wc = W * (1.0 - smoothstep(0.42, 0.5, mm));
            var Sm = 1.0;
            if (sweep > 0.0) {
              Sm = mix(synthSinc(sweep * (${sumM})), synthSinc(sweep * (${sumMR})), devW);
            }
            let cw = Cacc${K - 1} * Wc * Sm;
            acc += cw * (${linTerms.join(' + ')});
            if (obs > 0.001) {
              ${sqPer}
              acc2 += cw * (${sqTerms.join(' + ')});
            }
          }
          W = W * R; R = R * e2${K - 1};`;
  // One loop level: its range from the frequency the outer levels
  // accumulated and the most the inner ones can add; every recurrence
  // started at the range's first harmonic and advanced once per step, so
  // no harmonic costs a transcendental and nothing is indexed.
  const level = (i: number): string => {
    const inner = i === K - 1;
    const rest = L.filter((j) => j > i);
    const rx = rest.length ? rest.map((j) => `${M}.0 * abs(g${j}.x)`).join(' + ') : '0.0';
    const ry = rest.length ? rest.map((j) => `${M}.0 * abs(g${j}.y)`).join(' + ') : '0.0';
    const gauss = inner
      ? `let kxs = kpx${i} + mf${i}0 * g${i}.x; let kys = kpy${i} + mf${i}0 * g${i}.y;
    var W = exp(-sig2 * (kxs * kxs + kys * kys));
    var R = exp(-sig2 * (2.0 * (kpx${i} * g${i}.x + kpy${i} * g${i}.y) + (2.0 * mf${i}0 + 1.0) * dot(g${i}, g${i})));`
      : '';
    const acc =
      i === 0
        ? `let Cacc0 = pc0; let Sacc0 = ps0;`
        : `let Cacc${i} = Cacc${i - 1} * pc${i} - Sacc${i - 1} * ps${i}; let Sacc${i} = Sacc${i - 1} * pc${i} + Cacc${i - 1} * ps${i};`;
    return `var rg${i} = vec2<i32>(-${M}, ${M});
  rg${i} = synthRange(kpx${i}, g${i}.x, 0.5 + ${rx}, rg${i});
  rg${i} = synthRange(kpy${i}, g${i}.y, 0.5 + ${ry}, rg${i});
  if (rg${i}.x <= rg${i}.y) {
    let mf${i}0 = f32(rg${i}.x);
    var pc${i} = cos(th${i} * mf${i}0); var ps${i} = sin(th${i} * mf${i}0);
    var hC${i} = cos(hh${i} * mf${i}0); var hS${i} = sin(hh${i} * mf${i}0);
    var wC${i} = cos(ww${i} * mf${i}0); var wS${i} = sin(ww${i} * mf${i}0);
    var rC${i} = cos(ra${i} * mf${i}0); var rS${i} = sin(ra${i} * mf${i}0);
    var qC${i} = cos(qa${i} * mf${i}0); var qS${i} = sin(qa${i} * mf${i}0);
    ${gauss}
    for (var m${i} = rg${i}.x; m${i} <= rg${i}.y; m${i}++) {
      let mf${i} = f32(m${i});
      var Fv${i} = 2.0 * hc${i}; var Bw${i} = 2.0 * wcl${i}; var ramp${i} = 1.0; var rampq${i} = 1.0;
      if (m${i} != 0) {
        let a = 12.5663706144 * rc${i} * mf${i};
        if (abs(a) < 1e-2) { ramp${i} = 1.0 - a * a / 40.0; } else { ramp${i} = 12.0 * (2.0 * rS${i} - a * rC${i}) / (a * a * a); }
        let aq = 10.3547 * rc${i} * mf${i};
        if (abs(aq) < 1e-2) { rampq${i} = 1.0 - aq * aq / 40.0; } else { rampq${i} = 12.0 * (2.0 * qS${i} - aq * qC${i}) / (aq * aq * aq); }
        Fv${i} = hS${i} / (3.14159265359 * mf${i}) * ramp${i};
        Bw${i} = wS${i} / (3.14159265359 * mf${i});
      }
      let F${i} = Fv${i} - (1.0 - aw${i}) * Bw${i};
      let Q${i} = 0.514 * rc${i} * hC${i} * rampq${i};
      let d${i} = select(0.0, 1.0, m${i} == 0); let a${i} = al${i} * F${i}; let b${i} = d${i} - a${i};
      ${acc}
      let kpx${i + 1} = kpx${i} + mf${i} * g${i}.x; let kpy${i + 1} = kpy${i} + mf${i} * g${i}.y;
      ${inner ? term : level(i + 1)}
      { let t = pc${i} * tc${i} - ps${i} * ts${i}; ps${i} = ps${i} * tc${i} + pc${i} * ts${i}; pc${i} = t; }
      { let t = hC${i} * hcs${i} - hS${i} * hsn${i}; hS${i} = hS${i} * hcs${i} + hC${i} * hsn${i}; hC${i} = t; }
      { let t = wC${i} * wcs${i} - wS${i} * wsn${i}; wS${i} = wS${i} * wcs${i} + wC${i} * wsn${i}; wC${i} = t; }
      { let t = rC${i} * rcs${i} - rS${i} * rsn${i}; rS${i} = rS${i} * rcs${i} + rC${i} * rsn${i}; rC${i} = t; }
      { let t = qC${i} * qcs${i} - qS${i} * qsn${i}; qS${i} = qS${i} * qcs${i} + qC${i} * qsn${i}; qC${i} = t; }
    }
  }`;
  };
  return `
fn poolSynth${K}(obs: f32, bg: vec3<f32>, sweep: f32, devW: f32, sigma: f32, ${params}) -> vec3<f32> {
  let sig2 = 19.7392088 * sigma * sigma;
  ${consts}
  var acc = vec3<f32>(0.0);
  var acc2 = vec3<f32>(0.0);
  let kpx0 = 0.0; let kpy0 = 0.0;
  ${level(0)}
  return mix(acc, acc2, obs);
}
`;
}

function poolSynth(K: number) {
  const cached = poolSynthCache.get(K);
  if (cached) return cached;
  const fn = wgslFn(poolSynthSource(K), [synthSinc, synthRamp, synthRange]);
  poolSynthCache.set(K, fn);
  return fn;
}

function exactChain(K: number) {
  const cached = exactChainCache.get(K);
  if (cached) return cached;
  const fn = wgslFn(exactChainSource(K), [exactResidues, exactAlphaWgsl]);
  exactChainCache.set(K, fn);
  return fn;
}

/** One layer's exact mean coverage over its own full period, and the mean
 * of its square: the pivot's ingredients for the linear and the square-law
 * observer — a single-stream march of the layer's residues at rate one. */
const EXACT_LAYER_MEAN_WGSL = `
fn exactLayerMean(ph0: vec4<f32>, pr0: vec4<f32>) -> vec2<f32> {
  var res: array<f32, ${EXACT_CORNERS}>;
  var cnt = 0;
  let P = exactResidues(ph0, pr0, 1.0, -0.5, &res, &cnt);
  var total = vec2<f32>(0.0);
  var u = -0.5;
  for (var j = 0; j <= cnt; j++) {
    var next = 0.5;
    if (j < cnt) { next = -0.5 + res[j]; }
    let len = next - u;
    if (len > 1e-9) {
      var seg = vec2<f32>(0.0);
      ${GAUSS3.map(([x, w]) => `{ let a = exactAlphaWgsl(ph0, pr0, 1.0, u + ${x} * len); seg += ${w} * vec2<f32>(a, a * a); }`).join('\n      ')}
      total += seg * len;
    }
    u = next;
  }
  return total;
}
`;
const exactLayerMean = wgslFn(EXACT_LAYER_MEAN_WGSL, [exactResidues, exactAlphaWgsl]);

/**
 * The exact sweep as plain WGSL text — every helper plus the K-slot chain and
 * the per-layer mean — so the paper's GPU harness can compile the shipped
 * integrator into a standalone compute pass and certify it against a
 * 65536-tap truth. Text rather than nodes, because the harness owns its own
 * device and must run exactly what the renderer runs.
 */
export function exactSweepWgsl(K: number): string {
  return [
    EXACT_TRIO_DIST_WGSL,
    EXACT_ALPHA_WGSL,
    EXACT_RESIDUES_WGSL,
    exactChainSource(K),
    EXACT_LAYER_MEAN_WGSL,
  ].join('\n');
}

/**
 * Grading and overlays: contrast expansion about the pivot, the regime
 * mask, the heat map, and the contour overlay — which draws every ranked
 * character channel the scan and the lattice matching handed over.
 */
function grade(camera, view, mean, pivot, eta, etaMask, channels) {
  // Ink for the fringe regime, paper for failure, with a soft step at the
  // marked threshold so the boundary reads without a legend. 1/4 is the
  // theory's line; the uniform lets an author read the map's gradations.
  const thr = max(view.ratioThreshold, float(0.02));
  const heat = mix(
    vec3(0.07, 0.075, 0.09),
    camera.background,
    smoothstep(float(0), thr, eta)
      .mul(0.45)
      .add(smoothstep(thr.sub(0.02), thr.add(0.02), eta).mul(0.2))
      .add(smoothstep(thr, float(1), eta).mul(0.35))
  );

  // Contrast expands about the per-pixel independent-phase mean (localPivot),
  // so what it amplifies is exactly the beat correlation, wherever the
  // stack's own duty drifts. At contrast 1 this returns the average
  // untouched, and with one tap and no sweep that is the render itself.
  const out = mix(pivot, mean, view.contrast).add(view.lift).clamp(0, 1).toVar();
  // The regime mask, for the envelope: outside the fringe regime Phi(D) is a
  // carrier-fine stripe field that reads as a failed average, so fade it to
  // the pivot there. The eta of the two ranked layers is already in hand; with
  // no eligible pair the uniforms sit at -1 and the mask never engages.
  If(
    view.envMask
      .greaterThan(0.001)
      .and(view.ratio.lessThan(0.5))
      .and(view.ratioA.greaterThanEqual(int(0)))
      .and(view.ratioB.greaterThanEqual(int(0))),
    () => {
      // The band tracks the same threshold uniform the heat map marks, so
      // moving the Threshold slider moves both boundaries together. The mask
      // reads its own eta: the merit of what the sweep actually PRESERVES,
      // not of the best character measured. A station whose deviation the
      // margin rule declined is genuinely in regime — the heat map should
      // say so — but the enveloped picture there is the diagonal wash, and
      // keeping the pocket unfaded put a disc of bare carrier hash in an
      // otherwise faded frame.
      const fade = smoothstep(thr.sub(0.03), thr.add(0.05), etaMask).mul(view.envMask);
      out.assign(mix(out, pivot.add(view.lift).clamp(0, 1), fade));
    }
  );
  // At blend 1 the map replaces the picture; below it the map reads over the
  // drawing, so an author sees where on the picture fringes will live.
  If(view.ratio.greaterThan(0.5), () => out.assign(mix(out, heat, view.ratioBlend.clamp(0, 1))));
  // Fringe contours: the winning character's beat phase crosses an integer
  // exactly at each fringe centre, so its level sets, one pixel wide, are
  // the skeleton of the moiré — the same curves the character-hills figure
  // lifts onto its surfaces. The phase residual over the beat rate is a
  // screen-space distance, so the stroke holds one width at any zoom, and
  // the overlay fades out of the fringe regime with the same threshold the
  // heat map marks: where the beat runs at carrier scale the level sets are
  // the carrier, not a fringe skeleton. Drawn after the heat map so the
  // skeleton annotates that view too; the colour is the paper accent in the
  // shader's linear working space (raw sRGB values here render neon).
  If(view.contours.greaterThan(0.5), () => {
    const w = view.contourW;
    const acc = float(0).toVar();
    // One character's contribution: stroke at its integer levels plus the
    // widened companion — a soft fill in INDEX units, so its screen width
    // is the actual fringe width, expanding exactly where the character
    // runs flat, which is the artifact figure's band look. A scalar stack
    // draws the winning character of the pairwise scan; a lattice draws the
    // characters its own generator matching decided (the twist pair's
    // fundamental dual-ring combinations, or one against a scalar partner).
    // `on` is the channel's own admission gate — a kind whose ink does not
    // carry the combination stays quiet — and a degenerate rate gates the
    // rest, so only real beats draw.
    const addChar = ({ val, rate, eta: et, on }) => {
      const fd = val.sub(round(val)).abs();
      const dpx = fd.div(max(rate, float(1e-6)));
      const gate = step(float(1e-5), rate)
        .mul(on)
        .mul(float(1).sub(smoothstep(thr, thr.mul(2).add(0.1), et)));
      const stroke = float(1).sub(smoothstep(w.mul(0.6), w.mul(1.4).add(0.4), dpx));
      const band = pow(max(float(1).sub(fd.div(0.28)), float(0)), 1.5)
        .mul(view.contourBand);
      acc.assign(max(acc, max(stroke.mul(0.85), band.mul(0.55)).mul(gate)));
    };
    for (const ch of channels) addChar(ch);
    out.assign(mix(out, vec3(ACCENT_LINEAR.r, ACCENT_LINEAR.g, ACCENT_LINEAR.b), acc));
  });
  return out;
}

export function createSlots(count = MAX_LAYERS): LayerSlot[] {
  // One set for the whole stack and none shared with any other renderer: the
  // slots are already per-renderer, so they are where these belong.
  const tiling = createTilingNodes();
  return Array.from({ length: count }, () => ({ ...createLayerSlot(), tiling }));
}

