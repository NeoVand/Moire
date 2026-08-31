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
  curvePhase,
  linePhase,
  phaseDistWgsl,
  radialLinePhase,
  ringPhase,
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
    case 'tiling-periodic':
      return 13;
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
  const source = spec.source.trim();
  return source && compileFieldCached(source) ? source : '';
}

function writeField(slot: LayerSlot, field: FieldSpec | undefined) {
  const spec = field ?? FIELD_NONE;
  // Muting keeps the compiled program and zeroes the uniform, so the toggle is
  // instant where clearing the source would be a rebuild.
  slot.fieldAmount.value = fieldSource(field) && spec.enabled !== false ? spec.amount : 0;
  slot.fieldScale.value = spec.scale || 200;
}

export function createCameraUniforms() {
  return {
    zoom: uniform(1),
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
    // A flat exposure shift after the contrast expansion, for reading a fringe
    // field whose pivot sits too dark or too bright to print well.
    lift: uniform(0),
    // Fade the envelope toward its pivot where the heterodyne ratio is past 1/4.
    // Where the two carriers are too different to fringe, Phi(D) is a faithful
    // but carrier-fine stripe field that reads as "the average failed"; masking
    // it makes the view assert fringes only where fringes exist. 0 shows the
    // raw Phi(D); 1 masks the out-of-regime region entirely.
    envMask: uniform(0),
    pivot: uniform(new THREE.Color(0xffffff)),
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
  fields: (CompiledField | null)[] = []
) {
  return Fn(() => {
    const centered = screenCoordinate.sub(screenSize.mul(0.5));
    const world = vec2(centered.x, centered.y.negate()).div(camera.zoom).add(camera.pan);
    const pixel = float(1).div(max(camera.zoom, float(0.08)));

    const solved = solveLayers(slots, fields, view, world, pixel);
    const coords = latticeCoords(solved);
    const scan = scanCharacters(view, solved, coords);
    const lattice = matchLattices(view, solved, scan, coords);
    const mean = sweepStack(camera, view, solved, lattice.coh, scan);
    return grade(camera, view, mean, scan.etaAll, [
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
function solveLayers(slots, fields, view, world, pixel) {
  return slots.map((slot, index) => {
    const local = vec2(0).toVar();
    const halfT = float(0).toVar();
    const aa = float(0).toVar();
    const cell = vec4(0).toVar();
    const shift = float(0).toVar();
    const phase = vec4(0).toVar();
    const phaseFrom = vec4(0).toVar();
    // Code 13 joins the 5..7 grids: a tiling is a lattice, indexed by a pair
    // of integers, so every lattice path downstream takes it unchanged.
    const isLattice = slot.type
      .greaterThan(4.5)
      .and(slot.type.lessThan(7.5))
      .or(slot.type.greaterThan(12.5));

    If(slot.active.greaterThan(0.5), () => {
      const c = slot.rotation.cos();
      const s = slot.rotation.sin();
      local.assign(
        vec2(
          c.mul(world.x).add(s.mul(world.y)),
          s.negate().mul(world.x).add(c.mul(world.y))
        ).sub(slot.position)
      );

      halfT.assign(max(slot.thickness.mul(0.5), pixel.mul(1.15)));
      aa.assign(pixel.mul(0.7));
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
      const needPhase = max(view.sweep, max(view.ratio, view.contours));
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
      if (program) {
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
      If(slot.type.greaterThan(12.5), () => {
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
      const phaseOf = (typeNode, out) => {
        If(typeNode.lessThanEqual(0.1), () => {
          out.assign(
            linePhase(local, float(0), slot.spacing, slot.phase, slot.offset.x, warp, warpGrad)
          );
        }).Else(() => {
          If(typeNode.lessThan(4.5), () => {
            out.assign(
              ringPhase(
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
              )
            );
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
        phaseOf(slot.type, phase);
        If(slot.morph.lessThan(0.999), () => phaseOf(slot.typeFrom, phaseFrom));
      });
    });

    return { slot, local, halfT, aa, isLattice, cell, shift, phase, phaseFrom };
  });
}

// The heterodyne ratio of the two ranked layers, computed before the sweep
// because the sweep needs it. A visible moire is an integer combination
// kA*phiA + kB*phiB that varies slowly against the carriers, so each
// candidate character k gets eta_k = |kA gA + kB gB| / (|kA gA - kB gB| / 2)
// -- beat gradient over the mean gradient of the carriers in the labeling
// that brings them close -- and the criterion is the minimum over a small
// character set. (1,-1) and (1,1) are the classical difference and sum
// moires; the |k| = 2 pairs are the second-order beats, e.g. two line
// families near a 2:1 pitch ratio beating in 2*phi1 - phi2, which a
// first-order-only criterion declares "no fringe" while the fringe stands
// in the render. eta << 1 is the fringe regime; past 1/4 no fringe forms.
function scanCharacters(view, solved, latGrads) {
  const xiA = float(0).toVar();
  const xiB = float(0).toVar();
  const xiC = float(0).toVar();
  solved.forEach(({ phase }, index) => {
    // Continuous index, modulo its integer part: signed residual over the
    // local member gap, oriented at the neighbour with the smaller residual so
    // the index counts the same way whichever family produced the trio.
    const toward = min(phase.y, phase.z);
    const xi = phase.x.div(max(phase.x.sub(toward), float(1e-6)));
    If(view.ratioA.equal(int(index)), () => xiA.assign(xi));
    If(view.ratioB.equal(int(index)), () => xiB.assign(xi));
    If(view.ratioC.equal(int(index)), () => xiC.assign(xi));
  });
  // Screen-space index gradients. xi wraps by one whole unit where the nearest
  // member changes; rounding the per-pixel delta away unwraps every unit
  // boundary, sound while the carrier spans a couple of pixels. What survives
  // the unwrap, the clamp turns into bright lines rather than garbage.
  const unwrap = (v) => v.sub(round(v));
  const gradA = vec2(unwrap(dFdx(xiA)), unwrap(dFdy(xiA)));
  const gradB = vec2(unwrap(dFdx(xiB)), unwrap(dFdy(xiB)));
  const gradC = vec2(unwrap(dFdx(xiC)), unwrap(dFdy(xiC)));
  // Primitive characters with |k| <= 2, scanned over every pair among the
  // three ranked layers. On K layers the superposition lives on T^K and the
  // characters are k in Z^K; the diagonal sweep w = (1,...,1) preserves the
  // whole zero-sum sublattice (k summing to zero) at once — every pairwise
  // difference and every zero-sum ternary beat — so those need no schedule
  // at all, and every unranked layer rides the diagonal. What needs a
  // deviation is a winning character that is NOT zero-sum (a sum beat, a
  // second-order beat): its pair takes the rates (wP, wQ) with
  // kP wP + kQ wQ = 0 while everything else stays at 1. Scanning only one
  // pair chose that deviation blind: a sum beat between the top two layers
  // would scramble a slower difference beat the second layer makes with the
  // THIRD — the fringe stood in the render and washed from the view. The
  // scan now compares all three pairs and deviates only for the global
  // winner. Higher orders exist classically but their fringes are fainter
  // (the profile's harmonic content decays), so the scan stops where the
  // eye does.
  const CHARACTERS = [
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
  const bGate = float(1).sub(validB).mul(1e5);
  const validC = step(float(-0.5), float(view.ratioC));
  const cGate = float(1).sub(validC).mul(1e5);
  const PAIRS = [
    { gP: gradA, gQ: gradB, xP: xiA, xQ: xiB, gate: bGate, who: 0 },
    { gP: gradA, gQ: gradC, xP: xiA, xQ: xiC, gate: cGate, who: 1 },
    { gP: gradB, gQ: gradC, xP: xiB, xQ: xiC, gate: cGate, who: 2 },
  ];
  const etaBest = float(1e6).toVar();
  const pickBest = float(1e6).toVar();
  const rateA = float(1).toVar();
  const rateB = float(1).toVar();
  const rateC = float(1).toVar();
  // The winning character's beat phase and its per-pixel rate, for the
  // contour overlay: level sets of the phase at integers are the fringe
  // centres, and the rate turns a phase residual into screen pixels.
  const beatVal = float(0).toVar();
  const beatRate = float(0).toVar();
  PAIRS.forEach(({ gP, gQ, xP, xQ, gate, who }) => {
    CHARACTERS.forEach(([ka, kb]) => {
      const beat = gP.mul(ka).add(gQ.mul(kb));
      const carrier = gP.mul(ka).sub(gQ.mul(kb));
      const e = length(beat)
        .div(max(length(carrier).mul(0.5), float(1e-6)))
        .add(gate);
      const wP = Math.abs(kb);
      const wQ = kb < 0 ? ka : -ka;
      If(e.lessThan(etaBest), () => etaBest.assign(e));
      // The heat map shows the true minimum, but the sweep-character choice
      // penalises order two: a second-order fringe rides second harmonics,
      // so its contrast is lower by roughly |cos(pi*duty)| and a near-tie
      // should resolve toward the first-order beat -- also keeps the
      // per-pixel choice from flickering between characters of comparable
      // slowness. A zero-sum winner leaves every rate at 1, so ties among
      // zero-sum characters cost nothing whichever way they fall.
      const order2 = Math.max(Math.abs(ka), Math.abs(kb)) > 1;
      const ep = order2 ? e.mul(1.5) : e;
      const rA = who === 2 ? 1 : wP;
      const rB = who === 0 ? wQ : who === 2 ? wP : 1;
      const rC = who === 0 ? 1 : wQ;
      If(ep.lessThan(pickBest), () => {
        pickBest.assign(ep);
        rateA.assign(rA);
        rateB.assign(rB);
        rateC.assign(rC);
        beatVal.assign(xP.mul(ka).add(xQ.mul(kb)));
        beatRate.assign(length(beat));
      });
    });
  });
  // Zero-sum ternary characters — beats BETWEEN beats, like (1,1,-2) slow
  // where 2/s3 = 1/s1 + 1/s2 and the three directions conspire. They join
  // the scan for the heat map's sake; as zero-sum characters they already
  // ride the diagonal, so a ternary winner asks for no rate deviation at
  // all, and the same 1.5 penalty as order two keeps near-ties with a
  // first-order pairwise beat resolving toward the stronger fringe.
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
    const e = length(beat)
      .div(max(carrier.mul(0.5), float(1e-6)))
      .add(cGate);
    If(e.lessThan(etaBest), () => etaBest.assign(e));
    If(e.mul(1.5).lessThan(pickBest), () => {
      pickBest.assign(e.mul(1.5));
      rateA.assign(1);
      rateB.assign(1);
      rateC.assign(1);
      beatVal.assign(xiA.mul(ka).add(xiB.mul(kb)).add(xiC.mul(kc)));
      beatRate.assign(length(beat));
    });
  });
  const eta = etaBest.clamp(0, 1);

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
  const sGate = float(1).sub(step(float(-0.5), float(view.ratioA))).mul(1e5);
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
  // The joint minimum feeds the heat map and the regime mask; the scalar
  // minimum keeps gating the scalar beat channel, whose own regime is what
  // its contour annotates.
  const etaAll = min(etaBest, latMin).clamp(0, 1);

  return { xiA, gradA, eta, etaAll, rateA, rateB, rateC, beatVal, beatRate };
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
function matchLattices(view, solved, scan, latGrads) {
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
function sweepStack(camera, view, solved, latCoh, scan) {
  const { rateA, rateB, rateC } = scan;
  const sum = vec3(0).toVar();
  Loop(view.taps, ({ i }) => {
    // Centred on zero so that a single tap is the pattern itself, and so that
    // the trio of members brackets every phase the sweep visits.
    const along = float(i).add(0.5).div(float(view.taps));
    const u = along.sub(0.5).mul(view.sweep);

    // The scrambled generator's offsets: a rank-1 golden-ratio rule over the
    // taps, quasi-uniform over the cell whichever parity or count the taps
    // have. Which generator it scrambles is the per-pixel choice above.
    const v = float(i).mul(GOLDEN).fract().sub(0.5).mul(view.sweep);

    const color = camera.background.toVar();
    solved.forEach(({ slot, local, halfT, aa, isLattice, cell, shift, phase, phaseFrom }, index) => {
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
        const strokeAlpha = (d) =>
          float(1).sub(smoothstep(halfT.sub(aa), halfT.add(aa), d)).mul(slot.opacity);

        const alpha = float(0).toVar();
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
          If(slot.type.greaterThan(12.5), () => {
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
            ink.assign(float(1).sub(smoothstep(halfT.sub(aa), halfT.add(aa), edgeD)));
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
        }).Else(() => {
          // One local period per unit of `u`, so the sweep covers exactly one
          // carrier cycle whatever the family's pitch happens to be here. A
          // |rate| of 2 advances up to a full local period, past the trio the
          // solve bracketed, so the offset wraps back into the half-period the
          // trio covers -- exact for the phase families, whose residual is
          // periodic in the gap, and first-order elsewhere, like the slide
          // itself. At |rate| = 1 the wrap never engages.
          const slide = (ph) => {
            const gap = max(ph.y.sub(ph.x).abs(), float(1e-6));
            const off = u.mul(rate).mul(gap);
            const wrapped = off.sub(round(off.div(gap)).mul(gap));
            return phaseDistWgsl(ph, wrapped);
          };
          If(slot.morph.greaterThan(0.999), () => {
            alpha.assign(strokeAlpha(slide(phase)));
          }).Else(() => {
            alpha.assign(
              strokeAlpha(mix(slide(phaseFrom), slide(phase), slot.morph))
            );
          });
        });
        color.assign(mix(color, slot.color, alpha.clamp(0, 1)));
      });
    });
    sum.addAssign(color);
  });
  return sum.div(float(view.taps));
}

/**
 * Grading and overlays: contrast expansion about the pivot, the regime
 * mask, the heat map, and the contour overlay — which draws every ranked
 * character channel the scan and the lattice matching handed over.
 */
function grade(camera, view, mean, eta, channels) {
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

  // Contrast expands about the stack's nominal mean coverage, so the pivot does
  // not drift as the fringes move. At contrast 1 this returns the average
  // untouched, and with one tap and no sweep that is the render itself.
  const out = mix(view.pivot, mean, view.contrast).add(view.lift).clamp(0, 1).toVar();
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
      // moving the Threshold slider moves both boundaries together.
      const fade = smoothstep(thr.sub(0.03), thr.add(0.05), eta).mul(view.envMask);
      out.assign(mix(out, view.pivot.add(view.lift).clamp(0, 1), fade));
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
