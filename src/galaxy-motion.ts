import type { Point3 } from './galaxy-camera';
import type { GalaxyLayout, GalaxyStar } from './galaxy-layout';

interface Orbit {
  center: Point3;
  axis: Point3;
  speed: number;
  angle: number;
  sine: number;
  cosine: number;
}

const TAU = Math.PI * 2;

/** Independent visual rotations of the catalogue discs, not a physical simulation. */
export class GalaxyMotion {
  private readonly orbits = new Map<string, Orbit>();
  private readonly groupOf: (star: GalaxyStar) => string;

  constructor(layout: GalaxyLayout, groupOf: (star: GalaxyStar) => string = star => star.domain) {
    this.groupOf = groupOf;
    for (const cluster of layout.clusters) {
      let seed = 0;
      for (const character of cluster.name) seed = (Math.imul(seed, 31) + character.charCodeAt(0)) >>> 0;
      this.orbits.set(cluster.name, {
        center: { x: cluster.x, y: cluster.y, z: cluster.z },
        axis: { ...cluster.rotationAxis },
        speed: cluster.ring?.speed ?? 0.035 + (seed % 1001) / 1000 * 0.02,
        angle: 0,
        sine: 0,
        cosine: 1,
      });
    }
  }

  advance(elapsedSeconds: number, paused: boolean, hoveredDomain: string | null): void {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
      throw new RangeError('Orbit elapsed time must be finite and nonnegative.');
    }
    if (paused || elapsedSeconds === 0) return;
    for (const [domain, orbit] of this.orbits) {
      if (domain === hoveredDomain) continue;
      orbit.angle = (orbit.angle + elapsedSeconds * orbit.speed) % TAU;
      orbit.sine = Math.sin(orbit.angle);
      orbit.cosine = Math.cos(orbit.angle);
    }
  }

  phase(group: string): number { return this.orbits.get(group)?.angle ?? 0; }

  position(star: GalaxyStar): Point3 {
    const orbit = this.orbits.get(this.groupOf(star));
    if (!orbit) throw new Error(`Unknown orbit domain: ${star.domain}`);
    if (orbit.angle === 0) return { x: star.x, y: star.y, z: star.z };
    const { center, axis, sine, cosine } = orbit;
    const x = star.x - center.x, y = star.y - center.y, z = star.z - center.z;
    const alongAxis = (axis.x * x + axis.y * y + axis.z * z) * (1 - cosine);
    // Rodrigues rotation preserves each star's radius and height above the disc.
    return {
      x: center.x + x * cosine + (axis.y * z - axis.z * y) * sine + axis.x * alongAxis,
      y: center.y + y * cosine + (axis.z * x - axis.x * z) * sine + axis.y * alongAxis,
      z: center.z + z * cosine + (axis.x * y - axis.y * x) * sine + axis.z * alongAxis,
    };
  }
}
