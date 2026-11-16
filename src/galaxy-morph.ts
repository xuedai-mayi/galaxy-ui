import type { Point3 } from './galaxy-camera';

export interface MorphPoint extends Point3 { color: string; opacity: number }
interface Flight { from: MorphPoint; to: MorphPoint; bend: Point3; delay: number; startColor: number; endColor: number }
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const smooth = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

/** A finite flight with zero endpoint acceleration and stable per-model staggering. */
export class GalaxyMorph {
  readonly duration = 1680;
  elapsed = 0;
  private readonly flights = new Map<string, Flight>();

  constructor(from: ReadonlyMap<string, MorphPoint>, to: readonly (MorphPoint & { id: string; phase: number })[]) {
    if (from.size !== to.length) throw new Error('A taxonomy switch must preserve the model set.');
    for (const target of to) {
      const origin = from.get(target.id);
      if (!origin || this.flights.has(target.id)) throw new Error(`Missing or duplicate morph model: ${target.id}`);
      const dx = target.x - origin.x, dy = target.y - origin.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const bend = Math.min(170, length * 0.22);
      const direction = Math.sin(target.phase) >= 0 ? 1 : -1;
      this.flights.set(target.id, { from: origin, to: target,
        startColor: Number.parseInt(origin.color.slice(1), 16), endColor: Number.parseInt(target.color.slice(1), 16),
        bend: { x: -dy / length * bend * direction, y: dx / length * bend * direction, z: bend * 0.7 * Math.cos(target.phase) },
        delay: (target.phase / (Math.PI * 2)) * 180,
      });
    }
  }

  get progress(): number { return clamp01(this.elapsed / this.duration); }
  get finished(): boolean { return this.elapsed >= this.duration; }

  advance(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new RangeError('Morph time must be finite and nonnegative.');
    this.elapsed = Math.min(this.duration, this.elapsed + milliseconds);
  }

  sample(id: string, milliseconds = this.elapsed): MorphPoint {
    const flight = this.flights.get(id);
    if (!flight) throw new Error(`Unknown morph model: ${id}`);
    const t = smooth(clamp01((milliseconds - flight.delay) / 1500));
    const arc = Math.sin(Math.PI * t) ** 2;
    const { from, to, bend, startColor: start, endColor: end } = flight;
    const red = Math.round((start >>> 16) + ((end >>> 16) - (start >>> 16)) * t);
    const green = Math.round(((start >>> 8) & 255) + (((end >>> 8) & 255) - ((start >>> 8) & 255)) * t);
    const blue = Math.round((start & 255) + ((end & 255) - (start & 255)) * t);
    const color = '#' + ((red << 16) | (green << 8) | blue).toString(16).padStart(6, '0');
    return {
      x: from.x + (to.x - from.x) * t + bend.x * arc,
      y: from.y + (to.y - from.y) * t + bend.y * arc,
      z: from.z + (to.z - from.z) * t + bend.z * arc,
      color, opacity: from.opacity + (to.opacity - from.opacity) * t,
    };
  }
}
