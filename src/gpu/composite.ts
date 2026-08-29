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
  smoothstep,
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
import { layerMorph } from './typeMorph';
import { compileField, type CompiledField } from '../fields/expr';
import { fieldFunction } from '../fields/expr.wgsl';

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
    default:
      return 1;
  }
}

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
  };
}

export type LayerSlot = ReturnType<typeof createLayerSlot>;

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
    pivot: uniform(new THREE.Color(0xffffff)),
    // The ratio view: slot indices of the two layers to compare, ranked on the
    // CPU so the shader never orders layers, or -1 for none. `ratio` swaps the
    // composite for the heat map and widens the solver guard the way `sweep`
    // does, since the ratio needs the phase measured everywhere, not just under
    // the strokes.
    ratio: uniform(0),
    ratioA: uniform(-1, 'int'),
    ratioB: uniform(-1, 'int'),
  };
}

/** Spaces a second phase against the first without ever repeating. */
const GOLDEN = 0.6180339887498949;

export type ViewUniforms = ReturnType<typeof createViewUniforms>;

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

    // Solved once per layer, before the sweep. Everything the tap loop needs is in
    // here, so a tap costs arithmetic rather than a search — and a hidden layer
    // costs nothing, because the whole solve sits under the same branch that
    // decides whether the layer draws at all.
    const solved = slots.map((slot, index) => {
      const local = vec2(0).toVar();
      const halfT = float(0).toVar();
      const aa = float(0).toVar();
      const cell = vec4(0).toVar();
      const shift = float(0).toVar();
      const phase = vec4(0).toVar();
      const phaseFrom = vec4(0).toVar();
      const isLattice = slot.type.greaterThan(4.5).and(slot.type.lessThan(7.5));

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
        const accept = max(halfT.sub(aa), float(0));
        // Past halfT + aa the stroke is fully transparent, so the ring solver is
        // free to prove indices away instead of measuring them. Under the sweep the
        // stroke visits every phase, and under the ratio view the index has to be
        // differentiable between strokes, so both measure a whole pitch out.
        const reject = max(halfT.add(aa), max(view.sweep, view.ratio).mul(slot.spacing));

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

    const sum = vec3(0).toVar();
    Loop(view.taps, ({ i }) => {
      // Centred on zero so that a single tap is the pattern itself, and so that
      // the trio of members brackets every phase the sweep visits.
      const along = float(i).add(0.5).div(float(view.taps));
      const u = along.sub(0.5).mul(view.sweep);

      // A lattice's second generator, swept against the first rather than with it.
      // In lockstep the two indices stay correlated and the lattice beats against
      // itself: a fine diagonal hatch, at the carrier's own scale, that no amount
      // of contrast can be read through. Advancing this one by the golden ratio
      // instead is a rank-1 lattice rule over the two-torus — it decorrelates a
      // lattice from itself while keeping it in step with every other layer's
      // matching generator, which is where the fringes people want actually live.
      const v = float(i).mul(GOLDEN).fract().sub(0.5).mul(view.sweep);

      const color = camera.background.toVar();
      for (const { slot, local, halfT, aa, isLattice, cell, shift, phase, phaseFrom } of solved) {
        If(slot.active.greaterThan(0.5), () => {
          const strokeAlpha = (d) =>
            float(1).sub(smoothstep(halfT.sub(aa), halfT.add(aa), d)).mul(slot.opacity);

          const alpha = float(0).toVar();
          If(isLattice, () => {
            // A lattice has no scalar phase to slide, so it resamples: each
            // generator is a translation, and stepping along one is exactly one step
            // of the index it counts. The field rides in on the first of them.
            const shifted = local.sub(cell.xy.mul(u.add(shift))).sub(cell.zw.mul(v));
            // Both lookups sit behind what asks for them: a lattice resample is the
            // most expensive thing a tap can do, and the sweep does it two dozen
            // times over.
            const kind = slot.type.sub(5);
            const ink = float(0).toVar();
            If(slot.drawEdges.greaterThan(0.5), () => {
              const edgeD = gridDistance(
                shifted,
                kind,
                slot.spacing,
                float(0),
                slot.scale.x,
                slot.scale.y
              );
              ink.assign(float(1).sub(smoothstep(halfT.sub(aa), halfT.add(aa), edgeD)));
            });
            If(slot.vertexSize.greaterThan(0.001), () => {
              const vertD = gridDistance(
                shifted,
                kind,
                slot.spacing,
                float(1),
                slot.scale.x,
                slot.scale.y
              );
              const vR = slot.vertexSize;
              ink.assign(
                max(ink, float(1).sub(smoothstep(max(vR.sub(aa), float(0)), vR.add(aa), vertD)))
              );
            });
            alpha.assign(ink.mul(slot.opacity));
          }).Else(() => {
            // One local period per unit of `u`, so the sweep covers exactly one
            // carrier cycle whatever the family's pitch happens to be here.
            const slide = (ph) => {
              const gap = max(ph.y.sub(ph.x).abs(), float(1e-6));
              return phaseDistWgsl(ph, u.mul(gap));
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
      }
      sum.addAssign(color);
    });

    // The heterodyne ratio, eta = |grad D| / |mean index gradient|, D the
    // difference of the two chosen layers' continuous indices. eta << 1 is the
    // fringe regime — the index difference is nearly constant over a carrier
    // period, so a fringe forms — and past 1/4 the carriers are too different to
    // interfere. The pair is ranked on the CPU; lattices index by a pair of
    // integers and so have no scalar index to difference.
    const xiA = float(0).toVar();
    const xiB = float(0).toVar();
    solved.forEach(({ phase }, index) => {
      // Continuous index, modulo its integer part: signed residual over the local
      // member gap. Every solver measures a residual as phase-at-p minus member,
      // so the neighbour with the smaller residual is always the next member up
      // in index — orienting the gap at that neighbour keeps the index counting
      // the same way whichever family produced the trio.
      const toward = min(phase.y, phase.z);
      const xi = phase.x.div(max(phase.x.sub(toward), float(1e-6)));
      If(view.ratioA.equal(int(index)), () => xiA.assign(xi));
      If(view.ratioB.equal(int(index)), () => xiB.assign(xi));
    });

    // Screen-space index gradients. xi wraps by one whole unit where the nearest
    // member changes, so the integer part of a per-pixel delta is the wrap, not
    // the index moving: rounding it away unwraps every unit boundary — sound as
    // long as the carrier spans a couple of pixels, which is also when the render
    // itself resolves it. What survives — neighbour substitutions, saturated
    // solves, one-sided families — the clamp turns into bright lines rather than
    // garbage.
    const unwrap = (v) => v.sub(round(v));
    const gradA = vec2(unwrap(dFdx(xiA)), unwrap(dFdy(xiA)));
    const gradB = vec2(unwrap(dFdx(xiB)), unwrap(dFdy(xiB)));
    const eta = length(gradA.sub(gradB))
      .div(max(length(gradA.add(gradB)).mul(0.5), float(1e-6)))
      .clamp(0, 1);

    // Ink for the fringe regime, paper for failure, with a soft step at the 1/4
    // threshold so the boundary reads without a legend.
    const heat = mix(
      vec3(0.07, 0.075, 0.09),
      camera.background,
      smoothstep(float(0), float(0.25), eta)
        .mul(0.45)
        .add(smoothstep(float(0.23), float(0.27), eta).mul(0.2))
        .add(smoothstep(float(0.25), float(1), eta).mul(0.35))
    );

    // Contrast expands about the stack's nominal mean coverage, so the pivot does
    // not drift as the fringes move. At contrast 1 this returns the average
    // untouched, and with one tap and no sweep that is the render itself.
    const mean = sum.div(float(view.taps));
    const out = mix(view.pivot, mean, view.contrast).add(view.lift).clamp(0, 1).toVar();
    If(view.ratio.greaterThan(0.5), () => out.assign(heat));
    return out;
  })();
}

export function createSlots(count = MAX_LAYERS): LayerSlot[] {
  return Array.from({ length: count }, () => createLayerSlot());
}
