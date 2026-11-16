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

interface DomainAnchor {
  name: string;
  x: number;
  y: number;
  z: number;
  color: string;
  tiltX: number;
  tiltY: number;
  rotation: number;
  arms: number;
  thickness: number;
}

// Fixed irregular centres, composed by seeded Poisson separation (seed 31033).
// The current catalogue's projected envelopes are disjoint when viewed along Z.
// Depth and independent disc orientations give rotation a genuine volume view.
const ANCHORS: readonly DomainAnchor[] = [
  { name: '生态/植被', x: -527, y: -43, z: 288, color: '#93c4b4', tiltX: 0.50, tiltY: -0.24, rotation: 0.63, arms: 3, thickness: 0.055 },
  { name: '水文/洪水', x: 152, y: 164, z: -308, color: '#93bdd2', tiltX: -0.31, tiltY: 0.69, rotation: 2.13, arms: 4, thickness: 0.045 },
  { name: '未标注', x: -204, y: 480, z: -366, color: '#a1b0b8', tiltX: 0.76, tiltY: 0.18, rotation: -1.07, arms: 2, thickness: 0.070 },
  { name: '气候/气象', x: 639, y: 302, z: -176, color: '#b1b6d5', tiltX: -0.59, tiltY: -0.36, rotation: 1.08, arms: 3, thickness: 0.050 },
  { name: '遥感/影像', x: 88, y: -387, z: 176, color: '#99bac8', tiltX: 0.24, tiltY: 0.44, rotation: -0.43, arms: 4, thickness: 0.060 },
  { name: '地形/地貌', x: -597, y: 345, z: -122, color: '#c9c2a5', tiltX: 0.93, tiltY: -0.22, rotation: 2.84, arms: 2, thickness: 0.055 },
  { name: '农业', x: 746, y: 33, z: -329, color: '#adbf9a', tiltX: -0.39, tiltY: 0.48, rotation: -2.32, arms: 3, thickness: 0.060 },
  { name: '土壤/侵蚀', x: 701, y: -333, z: -232, color: '#c8b5a0', tiltX: 0.70, tiltY: -0.47, rotation: 0.34, arms: 2, thickness: 0.045 },
  { name: '海洋/海岸', x: 501, y: -119, z: 67, color: '#89c5c7', tiltX: -0.80, tiltY: 0.21, rotation: 1.73, arms: 4, thickness: 0.055 },
  { name: '社会经济', x: -39, y: -173, z: -164, color: '#b3aec4', tiltX: 0.28, tiltY: -0.65, rotation: -1.68, arms: 2, thickness: 0.075 },
  { name: '其他', x: 331, y: 427, z: 292, color: '#a4b9ba', tiltX: 0.58, tiltY: 0.36, rotation: 2.37, arms: 3, thickness: 0.065 },
  { name: '空气质量', x: -227, y: -420, z: 139, color: '#b7c1a8', tiltX: -0.48, tiltY: -0.27, rotation: -0.88, arms: 4, thickness: 0.050 },
  { name: '城市', x: 390, y: -412, z: -261, color: '#a4bed5', tiltX: 0.88, tiltY: 0.32, rotation: 0.96, arms: 2, thickness: 0.060 },
  { name: '土地利用', x: 261, y: -146, z: -294, color: '#9cbaab', tiltX: -0.26, tiltY: 0.57, rotation: -2.64, arms: 3, thickness: 0.055 },
  { name: '地下水', x: -606, y: -365, z: -189, color: '#8dafc9', tiltX: -0.68, tiltY: -0.41, rotation: 1.43, arms: 4, thickness: 0.070 },
];
const DOMAIN_NAMES = new Set(ANCHORS.map(anchor => anchor.name));
const TAU = 2 * Math.PI;

export type GalaxyTaxonomy = 'domain' | 'function';

/** Existing catalogue task labels remain the source of functional membership. */
export function galaxyGroup(model: GalaxyModel, taxonomy: GalaxyTaxonomy): string {
  if (taxonomy === 'domain') return model.domain;
  switch (model.task) {
    case '模拟': return '过程模拟';
    case '计算': return '数值计算';
    case '预测': return '预测预报';
    case '评估': return '评价评估';
    case '分类': case '制图': return '分析制图';
    case '优化': return '优化决策';
    default: return '待标注';
  }
}

const FUNCTION_ANCHORS = [
  { name: '过程模拟', radius: 405, halfWidth: 13, color: '#f2ce87', speed: 0.025, labelAngle: 0.32 },
  { name: '数值计算', radius: 345, halfWidth: 11, color: '#c0dbe4', speed: -0.021, labelAngle: -0.25 },
  { name: '预测预报', radius: 285, halfWidth: 8, color: '#cebef0', speed: 0.030, labelAngle: 0.90 },
  { name: '评价评估', radius: 225, halfWidth: 9, color: '#efbb8b', speed: -0.026, labelAngle: 2.25 },
  { name: '分析制图', radius: 165, halfWidth: 7, color: '#a7d6bf', speed: 0.037, labelAngle: 3.70 },
  { name: '优化决策', radius: 105, halfWidth: 6, color: '#ffedb1', speed: -0.041, labelAngle: 2.55 },
  { name: '待标注', radius: 475, halfWidth: 15, color: '#94a4b7', speed: 0.016, labelAngle: 3.55 },
] as const;

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
        opacity: (anchor.name === '待标注' ? 0.32 : 0.55) + unitRandom(model.id, 23) * 0.4,
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
  for (const anchor of ANCHORS) {
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
