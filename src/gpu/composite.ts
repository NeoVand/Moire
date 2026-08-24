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
  smoothstep,
} from 'three/tsl';
import { MAX_LAYERS, type PatternLayer, type PatternType } from '../types/moire';
import { lineDistance, ringDistance } from './inverse.wgsl';

export function patternTypeCode(type: PatternType): number {
  switch (type) {
    case 'straight-lines':
      return 0;
    case 'concentric-circles':
      return 1;
    case 'concentric-squares':
      return 2;
    case 'concentric-triangles':
      return 3;
    case 'concentric-polygons':
      return 4;
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
}

export function buildColorNode(camera: CameraUniforms, slots: LayerSlot[]) {
  return Fn(() => {
    const centered = screenCoordinate.sub(screenSize.mul(0.5));
    const world = vec2(centered.x, centered.y.negate()).div(camera.zoom).add(camera.pan);
    const color = camera.background.toVar();

    for (const slot of slots) {
      If(slot.active.greaterThan(0.5), () => {
        const rel = world.sub(slot.position);
        const c = slot.rotation.cos();
        const s = slot.rotation.sin();
        const local = vec2(
          c.mul(rel.x).add(s.mul(rel.y)),
          s.negate().mul(rel.x).add(c.mul(rel.y))
        );

        const dist = float(0).toVar();
        If(slot.type.lessThanEqual(0.1), () => {
          dist.assign(lineDistance(local, float(0), slot.spacing, slot.phase, slot.offset.x));
        }).Else(() => {
          dist.assign(
            ringDistance(
              local,
              slot.offset,
              slot.rotationOffset,
              slot.spacing,
              slot.phase,
              slot.type,
              slot.sides
            )
          );
        });

        const pixel = float(1).div(max(camera.zoom, float(0.08)));
        const halfT = max(slot.thickness.mul(0.5), pixel.mul(1.15));
        const alpha = float(1)
          .sub(smoothstep(halfT.sub(pixel.mul(0.7)), halfT.add(pixel.mul(0.7)), dist))
          .mul(slot.opacity)
          .clamp(0, 1);
        color.assign(mix(color, slot.color, alpha));
      });
    }

    return color;
  })();
}

export function createSlots(count = MAX_LAYERS): LayerSlot[] {
  return Array.from({ length: count }, () => createLayerSlot());
}
