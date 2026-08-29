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
  step,
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
    /** How much of the heat map covers the composite: 1 replaces, less overlays. */
    ratioBlend: uniform(1),
    /** Centre of the map's marked boundary. 1/4 is the theory's line. */
    ratioThreshold: uniform(0.25),
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

    // The heterodyne ratio of the two ranked layers, computed before the sweep
    // because the sweep needs it. eta = |grad D| / |mean index gradient|, D the
    // difference of continuous indices; eta << 1 is the fringe regime and past
    // 1/4 no fringe forms. A family's index sign is a convention -- relabel its
    // members n -> -n and the layer is unchanged -- so the beat lives in
    // whichever of phi1 - phi2 and phi1 + phi2 is the slower: the classical
    // difference and sum moires. The criterion is the minimum of the two.
    const xiA = float(0).toVar();
    const xiB = float(0).toVar();
    solved.forEach(({ phase }, index) => {
      // Continuous index, modulo its integer part: signed residual over the
      // local member gap, oriented at the neighbour with the smaller residual so
      // the index counts the same way whichever family produced the trio.
      const toward = min(phase.y, phase.z);
      const xi = phase.x.div(max(phase.x.sub(toward), float(1e-6)));
      If(view.ratioA.equal(int(index)), () => xiA.assign(xi));
      If(view.ratioB.equal(int(index)), () => xiB.assign(xi));
    });
    // Screen-space index gradients. xi wraps by one whole unit where the nearest
    // member changes; rounding the per-pixel delta away unwraps every unit
    // boundary, sound while the carrier spans a couple of pixels. What survives
    // the unwrap, the clamp turns into bright lines rather than garbage.
    const unwrap = (v) => v.sub(round(v));
    const gradA = vec2(unwrap(dFdx(xiA)), unwrap(dFdy(xiA)));
    const gradB = vec2(unwrap(dFdx(xiB)), unwrap(dFdy(xiB)));
    const gd = gradA.sub(gradB);
    const gs = gradA.add(gradB);
    const etaDiff = length(gd).div(max(length(gs).mul(0.5), float(1e-6)));
    const etaSum = length(gs).div(max(length(gd).mul(0.5), float(1e-6)));
    const eta = min(etaDiff, etaSum).clamp(0, 1);
    // Where the sum beat is the slower one, the envelope's diagonal sweep would
    // average it away -- advancing both phases together holds phi1 - phi2 fixed
    // and washes phi1 + phi2 out. Sweeping the second layer backwards there
    // holds the sum fixed instead. Either direction covers the same period of
    // that family, so each layer's own average is untouched; only which beat
    // survives the average changes, and it should be the one the eye sees.
    const flipB = etaSum.lessThan(etaDiff);

    // A lattice joins the sweep by translation — but along what, and stepped
    // which way? Wrong either way and the beat its lines make with the rest of
    // the stack averages out while the lattice's own carrier washes clean:
    // fringes that are plainly in the pattern vanish from its envelope. The
    // beating system is a per-pixel fact (a ring family's counting direction
    // rotates around its centre, taking turns against each lattice direction),
    // so it is chosen per pixel among the lattice's four beat-capable index
    // combinations — each generator alone, their sum, and their difference,
    // which for a hex or triangle lattice is where the third row direction
    // lives. Each combination's continuous index is linear in the layer point,
    // so its screen gradient is exact; whichever combination, stepped forward
    // or backward, best matches the ranked partner's index gradient is held
    // coherent by the tap schedule below, and everything else is golden-ratio
    // scrambled so the lattice never beats with itself: any self-hatch would
    // need two combinations coherent at once, which no schedule provides.
    //
    // The schedules, as (generator-1, generator-2) offsets with g the golden
    // scramble and su the signed sweep:
    //   gen1  (su, g)        — index 1 coherent, 2 scrambled
    //   gen2  (g, su)        — index 2 coherent, 1 scrambled
    //   sum   (g, su - g)    — indices 1, 2 each pure noise; 1+2 rides su
    //   diff  (g, g - su)    — likewise, 1-2 rides su
    const latCoh = solved.map(({ cell, local }) => {
      // step keeps the guard non-zero at d = 0 (a non-lattice slot's empty
      // cell), where sign() would return 0 and divide by zero.
      const safe = (d) => step(0, d).mul(2).sub(1).mul(d.abs().max(1e-6));
      const perp1 = vec2(cell.w.negate(), cell.z);
      const perp2 = vec2(cell.y.negate(), cell.x);
      const b1 = perp1.div(safe(cell.xy.dot(perp1)));
      const b2 = perp2.div(safe(cell.zw.dot(perp2)));
      const xi1 = local.dot(b1);
      const xi2 = local.dot(b2);
      const g1 = vec2(dFdx(xi1), dFdy(xi1));
      const g2 = vec2(dFdx(xi2), dFdy(xi2));
      const cand = [g1, g2, g1.add(g2), g1.sub(g2)];
      const best = float(1e6).toVar();
      const sign = float(1).toVar();
      const mode = float(0).toVar();
      cand.forEach((g, k) => {
        const ep = length(g.sub(gradA));
        const em = length(g.add(gradA));
        const e = min(ep, em);
        If(e.lessThan(best), () => {
          best.assign(e);
          // step(a, b) = 1 where b >= a: forward when its error is not larger.
          sign.assign(step(ep, em).mul(2).sub(1));
          mode.assign(k);
        });
      });
      return { sign, mode };
    });

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
          // The ranked second layer sweeps backwards where the sum beat is the
          // slower one; everything else rides the diagonal.
          const sign = float(1).toVar();
          If(view.ratioB.equal(int(index)).and(flipB), () => sign.assign(-1));
          const strokeAlpha = (d) =>
            float(1).sub(smoothstep(halfT.sub(aa), halfT.add(aa), d)).mul(slot.opacity);

          const alpha = float(0).toVar();
          If(isLattice, () => {
            // A lattice has no scalar phase to slide, so it resamples: each
            // generator is a translation, and stepping along one is exactly one step
            // of the index it counts. The field rides in on the first of them.
            // The chosen combination's schedule, from the table above: one-hot
            // masks over {gen1, gen2, sum, diff}.
            const su = u.mul(latCoh[index].sign);
            const mode = latCoh[index].mode;
            const isK = (k) => float(1).sub(min(mode.sub(k).abs(), 1));
            const w1 = isK(0);
            const w2 = isK(1);
            const w3 = isK(2);
            const w4 = isK(3);
            const uLat = su.mul(w1).add(v.mul(float(1).sub(w1)));
            const vLat = su
              .mul(w2.add(w3).sub(w4))
              .add(v.mul(w1.add(w4).sub(w3)));
            const shifted = local.sub(cell.xy.mul(uLat.add(shift))).sub(cell.zw.mul(vLat));
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
              return phaseDistWgsl(ph, u.mul(sign).mul(gap));
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
    const mean = sum.div(float(view.taps));
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
        const fade = smoothstep(float(0.22), float(0.3), eta).mul(view.envMask);
        out.assign(mix(out, view.pivot.add(view.lift).clamp(0, 1), fade));
      }
    );
    // At blend 1 the map replaces the picture; below it the map reads over the
    // drawing, so an author sees where on the picture fringes will live.
    If(view.ratio.greaterThan(0.5), () => out.assign(mix(out, heat, view.ratioBlend.clamp(0, 1))));
    return out;
  })();
}

export function createSlots(count = MAX_LAYERS): LayerSlot[] {
  return Array.from({ length: count }, () => createLayerSlot());
}
