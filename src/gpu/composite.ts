// @ts-nocheck — TSL node types do not compose through helpers.
import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  screenCoordinate,
  screenSize,
  vec2,
  float,
  uniform,
  mix,
  max,
  min,
  smoothstep,
} from 'three/tsl';
import { MAX_LAYERS, type PatternLayer, type PatternType } from '../types/moire';
import { curveDistance, lineDistance, radialLineDistance, ringDistance } from './inverse.wgsl';
import { gridDistance } from './lattice.wgsl';
import { layerMorph } from './typeMorph';

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
    typeFrom: uniform(1),
    morph: uniform(1),
  };
}

export type LayerSlot = ReturnType<typeof createLayerSlot>;

export function createCameraUniforms() {
  return {
    zoom: uniform(1),
    pan: uniform(new THREE.Vector2(0, 0)),
    background: uniform(new THREE.Color(0xffffff)),
  };
}

export type CameraUniforms = ReturnType<typeof createCameraUniforms>;

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

export function buildColorNode(camera: CameraUniforms, slots: LayerSlot[]) {
  return Fn(() => {
    const centered = screenCoordinate.sub(screenSize.mul(0.5));
    const world = vec2(centered.x, centered.y.negate()).div(camera.zoom).add(camera.pan);
    const color = camera.background.toVar();

    for (const slot of slots) {
      If(slot.active.greaterThan(0.5), () => {
        const c = slot.rotation.cos();
        const s = slot.rotation.sin();
        const rotated = vec2(
          c.mul(world.x).add(s.mul(world.y)),
          s.negate().mul(world.x).add(c.mul(world.y))
        );
        const local = rotated.sub(slot.position);

        const pixel = float(1).div(max(camera.zoom, float(0.08)));
        const halfT = max(slot.thickness.mul(0.5), pixel.mul(1.15));
        const aa = pixel.mul(0.7);
        const accept = max(halfT.sub(aa), float(0));
        // Past halfT + aa the stroke is fully transparent, so the ring solver is
        // free to prove indices away instead of measuring them.
        const reject = halfT.add(aa);

        const strokeAlpha = (d) =>
          float(1).sub(smoothstep(halfT.sub(aa), halfT.add(aa), d)).mul(slot.opacity);

        const distOf = (typeNode, rejectAbove = reject) => {
          const dist = float(1e6).toVar();
          If(typeNode.lessThanEqual(0.1), () => {
            dist.assign(lineDistance(local, float(0), slot.spacing, slot.phase, slot.offset.x));
          }).Else(() => {
            If(typeNode.lessThan(4.5), () => {
              dist.assign(
                ringDistance(
                  local,
                  slot.offset,
                  slot.rotationOffset,
                  slot.spacing,
                  slot.phase,
                  typeNode,
                  slot.sides,
                  accept,
                  rejectAbove
                )
              );
            }).Else(() => {
              If(typeNode.lessThan(7.5), () => {
                const kind = typeNode.sub(5);
                const edgeD = gridDistance(
                  local,
                  kind,
                  slot.spacing,
                  float(0),
                  slot.scale.x,
                  slot.scale.y
                );
                const vertD = gridDistance(
                  local,
                  kind,
                  slot.spacing,
                  float(1),
                  slot.scale.x,
                  slot.scale.y
                );
                const edgeOnly = float(1e6).toVar();
                If(slot.drawEdges.greaterThan(0.5), () => edgeOnly.assign(edgeD));
                const vertOnly = float(1e6).toVar();
                If(slot.vertexSize.greaterThan(0.001), () => vertOnly.assign(vertD));
                dist.assign(min(edgeOnly, vertOnly));
              }).Else(() => {
                If(typeNode.lessThan(8.5), () => {
                  dist.assign(radialLineDistance(local, slot.lineCount, slot.phase));
                }).Else(() => {
                  dist.assign(
                    curveDistance(
                      local,
                      typeNode.sub(9),
                      slot.spacing,
                      slot.phase,
                      slot.bend,
                      slot.frequency
                    )
                  );
                });
              });
            });
          });
          return dist;
        };

        const inkOf = (typeNode) => {
          const ink = float(0).toVar();
          If(typeNode.greaterThan(4.5), () => {
            If(typeNode.lessThan(7.5), () => {
              const kind = typeNode.sub(5);
              const edgeD = gridDistance(
                local,
                kind,
                slot.spacing,
                float(0),
                slot.scale.x,
                slot.scale.y
              );
              const vertD = gridDistance(
                local,
                kind,
                slot.spacing,
                float(1),
                slot.scale.x,
                slot.scale.y
              );
              const edgeA = float(1)
                .sub(smoothstep(halfT.sub(aa), halfT.add(aa), edgeD))
                .mul(slot.drawEdges);
              const vertA = float(0).toVar();
              If(slot.vertexSize.greaterThan(0.001), () => {
                const vR = slot.vertexSize;
                vertA.assign(
                  float(1).sub(smoothstep(max(vR.sub(aa), float(0)), vR.add(aa), vertD))
                );
              });
              ink.assign(max(edgeA, vertA).mul(slot.opacity));
            }).Else(() => {
              ink.assign(strokeAlpha(distOf(typeNode)));
            });
          }).Else(() => {
            ink.assign(strokeAlpha(distOf(typeNode)));
          });
          return ink;
        };

        const alpha = float(0).toVar();
        If(slot.morph.greaterThan(0.999), () => {
          alpha.assign(inkOf(slot.type));
        }).Else(() => {
          // A morph mixes two distances, so both need to stay measured out to a
          // full period or the blend inks early where one side had saturated.
          const wide = max(reject, slot.spacing);
          alpha.assign(
            strokeAlpha(mix(distOf(slot.typeFrom, wide), distOf(slot.type, wide), slot.morph))
          );
        });
        color.assign(mix(color, slot.color, alpha.clamp(0, 1)));
      });
    }

    return color;
  })();
}

export function createSlots(count = MAX_LAYERS): LayerSlot[] {
  return Array.from({ length: count }, () => createLayerSlot());
}
