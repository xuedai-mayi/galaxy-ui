import { DOMAIN_ANCHORS, DOMAIN_NAMES, FUNCTION_ANCHORS, UNCLASSIFIED_FUNCTION, functionGroup } from './galaxy-config';
import type { Point3 } from './galaxy-camera';

/**
 * A spatial catalogue illustration: exactly one real model per star.
 * Domain labels determine grouping. Position, arm structure, tilt, colour and
 * star size are visual composition only, not scientific similarity or quality.
 */
export interface GalaxyModel {
  id: string;
  name: string;
  domain: string;
  task: string;
  year: number | null;
  interface_count: number;
  reviewed: boolean;
}

export interface GalaxyStar extends GalaxyModel {
  x: number;
  y: number;
  z: number;
  radius: number;
  color: string;
  opacity: number;
  phase: number;
}

export interface GalaxyCluster {
  name: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  color: string;
  count: number;
  rotationAxis: Point3;
  ring?: { radius: number; halfWidth: number; speed: number; labelAngle: number };
}

export interface GalaxyLayout {
  stars: GalaxyStar[];
  clusters: GalaxyCluster[];
  extent: number;
}


const TAU = 2 * Math.PI;

export type GalaxyTaxonomy = 'domain' | 'function';

/** Existing catalogue task labels remain the source of functional membership. */
export function galaxyGroup(model: GalaxyModel, taxonomy: GalaxyTaxonomy): string {
  if (taxonomy === 'domain') return model.domain;
  return functionGroup(model.task);
}

/** Coplanar concentric orbital bands. Each real model contributes exactly one point. */
export function buildFunctionGalaxy(models: readonly GalaxyModel[]): GalaxyLayout {
  const groups = new Map<string, GalaxyModel[]>();
  const ids = new Set<string>();
  for (const model of models) {
    if (!model.id || ids.has(model.id)) throw new Error(`Galaxy model IDs must be nonempty and unique: ${model.id}`);
    ids.add(model.id);
    const name = galaxyGroup(model, 'function');
    const group = groups.get(name);
    if (group) group.push(model);
    else groups.set(name, [model]);
  }
  const stars: GalaxyStar[] = [];
  const clusters: GalaxyCluster[] = [];
  let extent = 0;
  for (const anchor of FUNCTION_ANCHORS) {
    const group = groups.get(anchor.name);
    if (!group) continue;
    const radius = anchor.radius + anchor.halfWidth + 5;
    const rotationAxis = { x: 0, y: 0, z: 1 };
    clusters.push({ name: anchor.name, color: anchor.color, x: 0, y: 0, z: 0,
      radius, count: group.length, rotationAxis,
      ring: { radius: anchor.radius, halfWidth: anchor.halfWidth, speed: anchor.speed, labelAngle: anchor.labelAngle } });
    extent = Math.max(extent, radius);
    for (const model of group.sort(compareIds)) {
      const theta = unitRandom(model.id, 20) * TAU;
      const tubeAngle = unitRandom(model.id, 21) * TAU;
      const tube = Math.sqrt(unitRandom(model.id, 22)) * anchor.halfWidth;
      const radial = anchor.radius + tube * Math.cos(tubeAngle);
      stars.push({ ...model,
        x: Math.cos(theta) * radial,
        y: Math.sin(theta) * radial,
        z: Math.sin(tubeAngle) * tube * 0.35,
        radius: 0.8 + unitRandom(model.id, 5) * 0.8,
        color: unitRandom(model.id, 24) < 0.12 ? '#fff0cf' : anchor.color,
        opacity: (anchor.name === UNCLASSIFIED_FUNCTION ? 0.32 : 0.55) + unitRandom(model.id, 23) * 0.4,
        phase: unitRandom(model.id, 6) * TAU,
      });
    }
  }
  return { stars, clusters, extent: Math.ceil(extent) };
}

/** Stable unsigned FNV-1a hash of UTF-16 code units. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return hash >>> 0;
}

function unitRandom(id: string, channel: number): number {
  let value = hashString(`${channel}:${id}`);
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  value ^= value >>> 15;
  return (value >>> 0) / 0x100000000;
}

function compareIds(left: GalaxyModel, right: GalaxyModel): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

/** A continuous centre-to-edge fade within a single domain hue. */
function radialStarStyle(distance: number, domainColor: string): { color: string; opacity: number } {
  const t = Math.min(1, Math.max(0, (distance - 0.12) / 0.82));
  const falloff = t * t * (3 - 2 * t);
  const coreLight = 0.24 * (1 - falloff);
  const domain = Number.parseInt(domainColor.slice(1), 16);
  const color = '#' + [16, 8, 0].map(shift => {
    const channel = (domain >>> shift) & 255;
    return Math.round(channel + (236 - channel) * coreLight).toString(16).padStart(2, '0');
  }).join('');
  return { color, opacity: 1 - falloff * 0.7 };
}

/**
 * Build one stable 3D layout. Unknown API domain labels or duplicate IDs are
 * rejected explicitly. Every centre remains fixed when filtering the catalogue.
 */
export function buildGalaxy(models: readonly GalaxyModel[]): GalaxyLayout {
  const groups = new Map<string, GalaxyModel[]>();
  const ids = new Set<string>();
  for (const model of models) {
    if (!model.id || ids.has(model.id)) {
      throw new Error(`Galaxy model IDs must be nonempty and unique: ${model.id}`);
    }
    if (!DOMAIN_NAMES.has(model.domain)) {
      throw new Error(`Unknown galaxy domain: ${model.domain}`);
    }
    ids.add(model.id);
    const group = groups.get(model.domain);
    if (group) group.push(model);
    else groups.set(model.domain, [model]);
  }

  const stars: GalaxyStar[] = [];
  const clusters: GalaxyCluster[] = [];
  let extent = 0;
  for (const anchor of DOMAIN_ANCHORS) {
    const group = groups.get(anchor.name);
    if (!group) continue;
    const radius = Math.min(190, Math.max(95, Math.sqrt(group.length) * 5.1));
    extent = Math.max(extent, Math.hypot(anchor.x, anchor.y, anchor.z) + radius);
    const cx = Math.cos(anchor.tiltX), sx = Math.sin(anchor.tiltX);
    const cy = Math.cos(anchor.tiltY), sy = Math.sin(anchor.tiltY);
    const cr = Math.cos(anchor.rotation), sr = Math.sin(anchor.rotation);
    // The disc normal follows exactly the same Rx, Ry, Rz transform as its stars.
    const rotationAxis = { x: sy * cx * cr + sx * sr, y: sy * cx * sr - sx * cr, z: cx * cy };
    clusters.push({ name: anchor.name, x: anchor.x, y: anchor.y, z: anchor.z, color: anchor.color, radius, count: group.length, rotationAxis });

    for (const model of group.sort(compareIds)) {
      const arm = Math.floor(unitRandom(model.id, 1) * anchor.arms);
      const alongArm = Math.pow(unitRandom(model.id, 2), 0.68);
      const radialJitter = (unitRandom(model.id, 3) - 0.5) * 0.055;
      let radial = Math.min(0.935, Math.max(0.025, 0.035 + alongArm * 0.87 + radialJitter));
      const angularJitter = (unitRandom(model.id, 4) - 0.5) * (0.32 + alongArm * 0.48);
      let angle = arm * TAU / anchor.arms + alongArm * 4.25 + angularJitter;
      // Bounded disc thickness, decreasing towards the edge. Disc positions are
      // rotated rigidly below, preserving their enclosing sphere.
      let depth = (unitRandom(model.id, 10) + unitRandom(model.id, 11) + unitRandom(model.id, 12) - 1.5)
        * anchor.thickness * (1 - alongArm * 0.4);
      const region = unitRandom(model.id, 7);
      if (region < 0.16) {
        // A volumetric central bulge uses existing model points, never decoration.
        const sphereRadius = 0.24 * Math.cbrt(unitRandom(model.id, 8));
        const latitude = unitRandom(model.id, 13) * 2 - 1;
        radial = sphereRadius * Math.sqrt(1 - latitude * latitude);
        depth = sphereRadius * latitude;
        angle = unitRandom(model.id, 9) * TAU;
      } else if (region < 0.3) {
        // A diffuse oblate halo surrounds the tilted disc using real models too.
        const sphereRadius = 0.15 + 0.77 * Math.cbrt(unitRandom(model.id, 8));
        const latitude = unitRandom(model.id, 13) * 2 - 1;
        radial = sphereRadius * Math.sqrt(1 - latitude * latitude);
        depth = sphereRadius * latitude * 0.52;
        angle = unitRandom(model.id, 9) * TAU;
      }
      const localX = Math.cos(angle) * radial * radius;
      const localY = Math.sin(angle) * radial * radius;
      const localZ = depth * radius;
      const rotatedY = localY * cx - localZ * sx;
      const rotatedZ = localY * sx + localZ * cx;
      const tiltedX = localX * cy + rotatedZ * sy;
      const tiltedZ = -localX * sy + rotatedZ * cy;
      stars.push({
        ...model,
        x: anchor.x + tiltedX * cr - rotatedY * sr,
        y: anchor.y + tiltedX * sr + rotatedY * cr,
        z: anchor.z + tiltedZ,
        radius: 1 + unitRandom(model.id, 5) * 0.7,
        ...radialStarStyle(Math.hypot(radial, depth), anchor.color),
        phase: unitRandom(model.id, 6) * TAU,
      });
    }
  }
  return { stars, clusters, extent: Math.ceil(extent) };
}
