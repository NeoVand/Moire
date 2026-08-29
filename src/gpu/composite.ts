// @ts-nocheck — TSL node types do not compose through helpers.
import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  Loop,
  screenCoordinate,
  screenSize,
  vec2,
  vec3,
  vec4,
  float,
  uniform,
  mix,
  max,
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
  slot.fieldAmount.value = fieldSource(field) ? spec.amount : 0;
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
    pivot: uniform(new THREE.Color(0xffffff)),
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
        // stroke visits every phase, so it has to be measured a whole pitch out.
        const reject = max(halfT.add(aa), view.sweep.mul(slot.spacing));

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

    // Contrast expands about the stack's nominal mean coverage, so the pivot does
    // not drift as the fringes move. At contrast 1 this returns the average
    // untouched, and with one tap and no sweep that is the render itself.
    const mean = sum.div(float(view.taps));
    return mix(view.pivot, mean, view.contrast).clamp(0, 1);
  })();
}

export function createSlots(count = MAX_LAYERS): LayerSlot[] {
  return Array.from({ length: count }, () => createLayerSlot());
}
