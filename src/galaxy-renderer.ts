import { homeCamera, overviewCamera, panCamera, zoomCameraAt, fitCameraToPoints, clampDistance, cameraBasis, CAMERA_FOV, CAMERA_NEAR, type OrbitCamera, type Point3, type ProjectedPoint } from './galaxy-camera';
import type { GalaxyLayout, GalaxyStar, GalaxyCluster } from './galaxy-layout';
import { GALAXY_THEME as theme } from './galaxy-theme';
import { GalaxyMotion } from './galaxy-motion';
import { galaxyGroup, type GalaxyTaxonomy } from './galaxy-layout';
import { GalaxyMorph, type MorphPoint } from './galaxy-morph';

export interface ViewportInsets {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Appearance {
  paused: boolean;
  labels: boolean;
  domain: string;
  matchIds: ReadonlySet<string>;
  searching: boolean;
  selectedId: string;
  recommendations: ReadonlyMap<string, number>;
}
interface Callbacks {
  selectStar: (star: GalaxyStar) => void;
  selectCluster: (name: string) => void;
  zoomChanged: (zoom: number) => void;
  reset: () => void;
}
interface ScreenStar extends ProjectedPoint { star: GalaxyStar; radius: number; color: string; opacity: number }
interface ScreenCluster extends ProjectedPoint { cluster: GalaxyCluster; radius: number }
interface ScreenRing { cluster: GalaxyCluster; points: ProjectedPoint[] }
interface LabelBox { x: number; y: number; width: number; height: number; name: string }
interface Pointer { x: number; y: number; startX: number; startY: number; pan: boolean }
const TAU = Math.PI * 2;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const cloneCamera = (camera: OrbitCamera): OrbitCamera => ({ ...camera, target: { ...camera.target } });

/** One spatial scene, projected back-to-front. Picking uses the same projected stars. */
export class GalaxyRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly events = new AbortController();
  private readonly resizeObserver: ResizeObserver;
  private readonly intersectionObserver: IntersectionObserver;
  private readonly pointers = new Map<number, Pointer>();
  private motion: GalaxyMotion;
  private starsById: ReadonlyMap<string, GalaxyStar>;
  private taxonomy: GalaxyTaxonomy = 'domain';
  private morph: GalaxyMorph | null = null;
  private departingClusters: readonly GalaxyCluster[] = [];
  private appearance: Appearance = { paused: false, labels: true, domain: '', matchIds: new Set(), searching: false, selectedId: '', recommendations: new Map() };
  private home: OrbitCamera;
  private camera: OrbitCamera;
  private destination: OrbitCamera;
  private projectionBasis: ReturnType<typeof cameraBasis>;
  private projectionFocal = 0;
  private width = 0;
  private height = 0;
  private insets: ViewportInsets = { left: 0, top: 0, right: 0, bottom: 0 };
  private view = { x: 0, y: 0, width: 0, height: 0 };
  private ratio = 1;
  private frame = 0;
  private previousTime = 0;
  private dirty = true;
  private visible = true;
  private disposed = false;
  private dragged = false;
  private hovered: ScreenStar | null = null;
  private hoverPosition: { x: number; y: number } | null = null;
  private hoveredDomain: string | null = null;
  private focusedStar: GalaxyStar | null = null;
  private screenStars: ScreenStar[] = [];
  private screenClusters: ScreenCluster[] = [];
  private screenRings: ScreenRing[] = [];
  private labelBoxes: LabelBox[] = [];
  private lastZoom = 100;
  private framedGroup: readonly Point3[] | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly host: HTMLElement,
    private layout: GalaxyLayout,
    private readonly callbacks: Callbacks,
  ) {
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('当前浏览器无法创建星图画布。');
    this.context = context;
    this.motion = new GalaxyMotion(layout);
    this.starsById = new Map(layout.stars.map(star => [star.id, star]));
    this.home = homeCamera(layout.extent);
    this.camera = cloneCamera(this.home);
    this.projectionBasis = cameraBasis(this.camera);
    this.destination = cloneCamera(this.home);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.intersectionObserver = new IntersectionObserver(entries => {
      this.visible = entries.some(entry => entry.isIntersecting);
      if (this.visible) this.invalidate();
      else this.cancelFrame();
    });
    this.resizeObserver.observe(host);
    this.intersectionObserver.observe(host);
    const options = { signal: this.events.signal };
    canvas.addEventListener('pointerdown', this.pointerDown, options);
    canvas.addEventListener('pointermove', this.pointerMove, options);
    canvas.addEventListener('pointerup', this.pointerUp, options);
    canvas.addEventListener('pointercancel', this.pointerCancel, options);
    canvas.addEventListener('lostpointercapture', this.pointerCancel, options);
    canvas.addEventListener('pointerleave', this.pointerLeave, options);
    canvas.addEventListener('wheel', this.wheel, { ...options, passive: false });
    canvas.addEventListener('keydown', this.keyDown, options);
    canvas.addEventListener('contextmenu', event => event.preventDefault(), options);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.cancelFrame();
      else this.invalidate();
    }, options);
    this.resize();
  }

  setAppearance(appearance: Appearance): void {
    if (appearance.paused !== this.appearance.paused) this.previousTime = 0;
    if (this.focusedStar && appearance.selectedId !== this.focusedStar.id) this.focusedStar = null;
    this.appearance = appearance;
    if (appearance.paused) this.morph = null;
    this.hovered = null;
    this.invalidate();
  }

  /** Capture the actual rendered positions, including an interrupted flight. */
  setLayout(layout: GalaxyLayout, taxonomy: GalaxyTaxonomy): void {
    if (layout === this.layout) return;
    const origins = new Map(this.layout.stars.map(star => [star.id, this.visualPoint(star)]));
    const flight = new GalaxyMorph(origins, layout.stars);
    this.departingClusters = this.layout.clusters;
    this.layout = layout;
    this.taxonomy = taxonomy;
    this.motion = new GalaxyMotion(layout, star => this.groupOf(star));
    this.starsById = new Map(layout.stars.map(star => [star.id, star]));
    this.morph = this.appearance.paused ? null : flight;
    this.focusedStar = null;
    this.framedGroup = null;
    this.hovered = null;
    this.hoveredDomain = null;
    this.labelBoxes = [];
    this.home = this.overview();
    // Ease toward a fitted overview, including the portrait orientation.
    this.destination = cloneCamera(this.home);
    this.invalidate();
  }

  private groupOf(star: GalaxyStar): string { return galaxyGroup(star, this.taxonomy); }

  private overview(): OrbitCamera {
    const { width, height } = this.view;
    if (this.taxonomy === 'domain') return overviewCamera(this.layout.stars, width, height, this.layout.extent);
    return fitCameraToPoints(this.layout.stars,
      { ...homeCamera(this.layout.extent), yaw: 0, pitch: 0.18 }, width, height, this.layout.extent);
  }

  private visualPoint(star: GalaxyStar): MorphPoint {
    return this.morph?.sample(star.id) ?? { ...this.motion.position(star), color: star.color, opacity: star.opacity };
  }

  /** Keep framing clear of overlays while drawing into the entire canvas. */
  setInsets(insets: ViewportInsets): void {
    if (Object.values(insets).some(value => !Number.isFinite(value) || value < 0)) {
      throw new RangeError('Viewport insets must be finite and nonnegative.');
    }
    if (insets.left === this.insets.left && insets.top === this.insets.top
      && insets.right === this.insets.right && insets.bottom === this.insets.bottom) return;
    this.insets = { ...insets };
    this.resize(true);
  }

  focus(point: Point3, zoom: number): void {
    this.framedGroup = null;
    this.focusedStar = this.modelPoint(point);
    this.destination.target = this.currentPoint(point);
    this.destination.distance = clampDistance(this.home.distance / zoom, this.layout.extent);
    this.hovered = null;
    this.invalidate();
  }

  focusGroup(points: readonly Point3[]): void {
    this.focusedStar = null;
    this.framedGroup = points;
    this.frameCurrentGroup();
    this.hovered = null;
    this.invalidate();
  }

  reset(): void {
    this.focusedStar = null;
    this.framedGroup = null;
    this.destination = cloneCamera(this.home);
    this.hovered = null;
    this.invalidate();
  }

  zoomBy(factor: number): void {
    this.focusedStar = null;
    this.framedGroup = null;
    this.destination.distance = clampDistance(this.destination.distance / factor, this.layout.extent);
    this.hovered = null;
    this.invalidate();
  }

  dispose(): void {
    this.disposed = true;
    this.cancelFrame();
    this.events.abort();
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.pointers.clear();
  }

  private resize(force = false): void {
    const { width, height } = this.host.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    if (!force && width === this.width && height === this.height && pixelRatio === this.ratio) return;
    const first = this.width === 0;
    const wasHome = Math.abs(this.destination.distance - this.home.distance) < 0.1
      && Math.abs(this.destination.yaw - this.home.yaw) < 0.001
      && Math.abs(this.destination.pitch - this.home.pitch) < 0.001
      && Math.hypot(this.destination.target.x - this.home.target.x, this.destination.target.y - this.home.target.y, this.destination.target.z - this.home.target.z) < 0.1;
    const previousDistance = this.home.distance;
    this.width = width;
    this.height = height;
    this.ratio = pixelRatio;
    this.view = {
      x: this.insets.left,
      y: this.insets.top,
      width: Math.max(1, width - this.insets.left - this.insets.right),
      height: Math.max(1, height - this.insets.top - this.insets.bottom),
    };
    const pixelWidth = Math.round(width * this.ratio);
    const pixelHeight = Math.round(height * this.ratio);
    if (this.canvas.width !== pixelWidth) this.canvas.width = pixelWidth;
    if (this.canvas.height !== pixelHeight) this.canvas.height = pixelHeight;
    this.home = this.overview();
    if (this.framedGroup?.length) {
      this.frameCurrentGroup();
      this.camera = cloneCamera(this.destination);
    } else if (first || wasHome) {
      this.camera = cloneCamera(this.home);
      this.destination = cloneCamera(this.home);
    } else {
      const ratio = this.home.distance / previousDistance;
      this.camera.distance = clampDistance(this.camera.distance * ratio, this.layout.extent);
      this.destination.distance = clampDistance(this.destination.distance * ratio, this.layout.extent);
    }
    this.hovered = null;
    this.invalidate();
  }

  private project(point: Point3): ProjectedPoint | null {
    // Camera trigonometry is shared by every particle in this rendered frame.
    const { right, up, forward } = this.projectionBasis;
    const dx = point.x - this.camera.target.x, dy = point.y - this.camera.target.y, dz = point.z - this.camera.target.z;
    const depth = this.camera.distance - (dx * forward.x + dy * forward.y + dz * forward.z);
    if (!Number.isFinite(depth) || depth < CAMERA_NEAR) return null;
    const scale = this.projectionFocal / depth;
    return { x: this.view.x + this.view.width / 2 + (dx * right.x + dy * right.y + dz * right.z) * scale,
      y: this.view.y + this.view.height / 2 - (dx * up.x + dy * up.y + dz * up.z) * scale, depth, scale };
  }

  private modelPoint(point: Point3): GalaxyStar | null {
    return 'id' in point && typeof point.id === 'string' ? this.starsById.get(point.id) ?? null : null;
  }

  private currentPoint(point: Point3): Point3 {
    const star = this.modelPoint(point);
    return star ? this.visualPoint(star) : { x: point.x, y: point.y, z: point.z };
  }

  private frameCurrentGroup(): void {
    if (!this.framedGroup?.length || !this.view.width || !this.view.height) return;
    this.destination = fitCameraToPoints(this.framedGroup.map(point => this.currentPoint(point)), this.destination,
      this.view.width, this.view.height, this.layout.extent);
  }

  private pan(dx: number, dy: number): void {
    this.destination = panCamera(this.destination, dx, dy, this.view.width, this.view.height);
  }

  private zoomAt(distance: number, x: number, y: number): void {
    this.destination = zoomCameraAt(this.destination, distance, x - this.view.x, y - this.view.y, this.view.width, this.view.height);
  }

  private cancelFrame(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.previousTime = 0;
  }

  private invalidate(): void {
    this.dirty = true;
    if (!this.frame && this.visible && !document.hidden && !this.disposed) this.frame = requestAnimationFrame(this.tick);
  }

  private tick = (time: number): void => {
    this.frame = 0;
    if (this.disposed || !this.visible || document.hidden || !this.width || !this.height) return;
    const elapsed = this.previousTime ? time - this.previousTime : 0;
    if (this.previousTime && elapsed < (this.morph ? 14 : 30)) {
      this.frame = requestAnimationFrame(this.tick);
      return;
    }
    this.previousTime = time;
    this.updateHoveredDomain();
    const morphing = !!this.morph;
    if (this.morph) {
      this.morph.advance(Math.min(elapsed, 80));
      if (this.morph.finished) this.morph = null;
    } else this.motion.advance(Math.min(elapsed, 80) / 1000, this.appearance.paused, this.hoveredDomain);
    if (this.framedGroup?.length) this.frameCurrentGroup();
    else if (this.focusedStar) this.destination.target = this.currentPoint(this.focusedStar);
    const moving = this.moveCamera(Math.min(elapsed, 80));
    if (this.dirty || moving || morphing || !this.appearance.paused) {
      this.draw(time);
      this.updateHoveredDomain();
      this.dirty = false;
    }
    if (moving || this.morph || !this.appearance.paused) this.frame = requestAnimationFrame(this.tick);
  };

  private moveCamera(elapsed: number): boolean {
    const target = this.destination;
    const current = this.camera;
    const yawDelta = ((target.yaw - current.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
    const delta = Math.abs(yawDelta) + Math.abs(target.pitch - current.pitch)
      + Math.abs(target.distance - current.distance) / this.layout.extent
      + Math.hypot(target.target.x - current.target.x, target.target.y - current.target.y, target.target.z - current.target.z) / this.layout.extent;
    const moving = delta > 0.0001;
    if (!moving || this.appearance.paused) this.camera = cloneCamera(target);
    else {
      const amount = 1 - Math.exp(-elapsed / (this.morph ? 330 : 95));
      current.yaw += yawDelta * amount;
      current.pitch += (target.pitch - current.pitch) * amount;
      current.distance += (target.distance - current.distance) * amount;
      current.target.x += (target.target.x - current.target.x) * amount;
      current.target.y += (target.target.y - current.target.y) * amount;
      current.target.z += (target.target.z - current.target.z) * amount;
    }
    const percent = Math.round(this.home.distance / this.camera.distance * 100);
    if (percent !== this.lastZoom) {
      this.lastZoom = percent;
      this.callbacks.zoomChanged(percent / 100);
    }
    return moving;
  }

  private draw(time: number): void {
    const ctx = this.context;
    const { width, height, appearance } = this;
    this.projectionBasis = cameraBasis(this.camera);
    this.projectionFocal = Math.min(this.view.width, this.view.height) / (2 * Math.tan(CAMERA_FOV / 2));
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, width, height);
    this.screenClusters = [];
    const progress = this.morph?.progress ?? 1;
    const labelOpacity = this.morph ? (progress < 0.22 ? 1 - progress / 0.22 : clamp((progress - 0.58) / 0.42, 0, 1)) : 1;
    const clusters = this.morph && progress < 0.22 ? this.departingClusters : this.layout.clusters;
    for (const cluster of clusters) {
      const point = this.project(cluster);
      if (point) this.screenClusters.push({ ...point, cluster, radius: cluster.radius * point.scale });
    }
    this.screenClusters.sort((a, b) => b.depth - a.depth);
    for (const point of this.screenClusters) {
      if (point.cluster.ring) continue;
      const radius = Math.min(point.radius * 1.8, Math.max(width, height));
      const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
      gradient.addColorStop(0, point.cluster.color + '08');
      gradient.addColorStop(0.35, point.cluster.color + '03');
      gradient.addColorStop(1, point.cluster.color + '00');
      ctx.globalAlpha = (appearance.domain && appearance.domain !== point.cluster.name ? 0.3 : 1) * labelOpacity;
      ctx.fillStyle = gradient;
      ctx.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
    }
    this.drawRingStructure(labelOpacity);
    this.screenStars = [];
    for (const star of this.layout.stars) {
      const visual = this.visualPoint(star);
      const point = this.project(visual);
      if (!point || point.x < -20 || point.x > width + 20 || point.y < -20 || point.y > height + 20) continue;
      this.screenStars.push({ ...point, star, color: visual.color, opacity: visual.opacity, radius: clamp(star.radius * (0.36 + point.scale * 0.85) * 1.16, 0.65, 4) });
    }
    this.screenStars.sort((a, b) => b.depth - a.depth);
    for (const point of this.screenStars) {
      const { star, x, y, radius, depth, color } = point;
      const selected = star.id === appearance.selectedId;
      const recommended = appearance.recommendations.has(star.id);
      const match = appearance.searching && appearance.matchIds.has(star.id);
      const active = !appearance.domain || this.groupOf(star) === appearance.domain;
      const fade = recommended || selected || match ? 1 : appearance.recommendations.size && appearance.selectedId ? 0.14 : appearance.searching ? 0.12 : active ? 1 : 0.17;
      const depthLight = clamp(this.home.distance / depth, 0.42, 1.35);
      const twinkle = appearance.paused ? 0.96 : 0.92 + Math.sin(time * 0.0006 + star.phase) * 0.05;
      const radialOpacity = selected || match || recommended ? 1 : point.opacity;
      ctx.globalAlpha = clamp(fade * depthLight * twinkle, 0.04, 1) * radialOpacity;
      if (this.morph && star.phase < 0.8) {
        const tail = this.project(this.morph.sample(star.id, this.morph.elapsed - 42));
        if (tail && Math.hypot(x - tail.x, y - tail.y) > 0.8) {
          ctx.strokeStyle = color + '65';
          ctx.lineWidth = Math.min(1.4, radius * 0.75);
          ctx.beginPath();
          ctx.moveTo(tail.x, tail.y);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
      }
      if (selected || match || (active && radius > 1.8)) {
        ctx.fillStyle = color + '0c';
        ctx.beginPath();
        ctx.arc(x, y, radius * 2.8, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = selected || match || recommended ? theme.highlight : color;
      ctx.beginPath();
      ctx.arc(x, y, selected ? radius + 1 : radius, 0, TAU);
      ctx.fill();
      if (this.taxonomy === 'function' && !this.morph && active && star.phase < 0.022) {
        ctx.strokeStyle = '#fff0c6';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(x - radius * 3, y); ctx.lineTo(x + radius * 3, y);
        ctx.moveTo(x, y - radius * 3); ctx.lineTo(x, y + radius * 3);
        ctx.stroke();
      }
      if (star.reviewed && active && point.scale > 0.65) {
        ctx.strokeStyle = color + '65';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.arc(x, y, radius + 2.5, 0, TAU);
        ctx.stroke();
      }
      if (selected) this.drawReticle(point);
    }
    ctx.globalAlpha = 1;
    this.drawLabels(labelOpacity);
    if (this.morph) this.labelBoxes = [];
    // Recommendation markers are an explicit foreground layer, matching picking below.
    for (const point of this.screenStars) {
      const rank = appearance.recommendations.get(point.star.id);
      if (rank !== undefined) this.drawRecommendation(point, rank);
    }
    this.drawOrientation();
    if (this.hoverPosition && this.pointers.size === 0) {
      this.hovered = this.pick(this.hoverPosition.x, this.hoverPosition.y);
      this.canvas.style.cursor = this.hovered ? 'pointer' : 'grab';
    }
    if (this.hovered && this.pointers.size === 0) {
      const current = this.screenStars.find(point => point.star.id === this.hovered?.star.id);
      if (current) this.drawTooltip(current);
    }
  }

  private drawReticle(point: ScreenStar): void {
    const ctx = this.context;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = theme.highlight;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(point.x, point.y, point.radius + 7, 0, TAU);
    ctx.stroke();
  }

  /** Decorative orbit light is separate from the one-model-per-particle layer. */
  private drawRingStructure(opacity: number): void {
    this.screenRings = [];
    const ctx = this.context;
    const center = this.project({ x: 0, y: 0, z: 0 });
    if (!center || !this.screenClusters.some(point => point.cluster.ring)) return;
    const haloRadius = clamp(245 * center.scale, 24, 360);
    const glow = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, haloRadius);
    glow.addColorStop(0, '#ffe4a039');
    glow.addColorStop(0.22, '#e7b75a1c');
    glow.addColorStop(0.58, '#d39a350b');
    glow.addColorStop(1, '#d39a3500');
    ctx.globalAlpha = opacity;
    ctx.fillStyle = glow;
    ctx.fillRect(center.x - haloRadius, center.y - haloRadius, haloRadius * 2, haloRadius * 2);
    for (const { cluster } of this.screenClusters) {
      const ring = cluster.ring;
      if (!ring) continue;
      const points: ProjectedPoint[] = [];
      for (let i = 0; i <= 160; i++) {
        const angle = i / 160 * TAU;
        const point = this.project({ x: Math.cos(angle) * ring.radius, y: Math.sin(angle) * ring.radius, z: 0 });
        if (point) points.push(point);
      }
      this.screenRings.push({ cluster, points });
      ctx.globalAlpha = opacity * (this.appearance.domain && this.appearance.domain !== cluster.name ? 0.15 : 1);
      for (const [width, alpha] of [[ring.halfWidth * center.scale * 3, '06'], [4, '12'], [0.65, '55']] as const) {
        ctx.strokeStyle = cluster.color + alpha;
        ctx.lineWidth = width;
        ctx.beginPath();
        points.forEach((point, i) => { if (i === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y); });
        ctx.stroke();
      }
      // Short highlights follow the same accumulated, pausable orbit as the stars.
      const phase = this.motion.phase(cluster.name) + ring.labelAngle;
      for (let arc = 0; arc < 3; arc++) {
        ctx.strokeStyle = cluster.color + '80';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        for (let i = 0; i <= 12; i++) {
          const angle = phase + arc * TAU / 3 + i * 0.008;
          const point = this.project({ x: Math.cos(angle) * ring.radius, y: Math.sin(angle) * ring.radius, z: 0 });
          if (point) { if (i === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y); }
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = opacity;
    if (this.appearance.labels && !this.appearance.domain && this.home.distance / this.camera.distance < 1.8) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#91a6a6';
      ctx.font = '10px "Noto Sans SC", "Microsoft YaHei", sans-serif';
      ctx.fillText('模型功能', center.x, center.y - 14);
      const compact = this.view.width < 760;
      ctx.font = `300 ${compact ? 20 : 26}px "Bahnschrift", sans-serif`;
      ctx.letterSpacing = compact ? '0.3px' : '0.7px';
      ctx.fillStyle = '#c3cbc5';
      ctx.fillText(this.layout.stars.length.toLocaleString(), center.x, center.y + 9);
      ctx.letterSpacing = '0px';
    }
    ctx.globalAlpha = 1;
  }

  private drawRingLabels(opacity: number): void {
    const ctx = this.context;
    const center = this.project({ x: 0, y: 0, z: 0 });
    if (!center) return;
    const compact = this.view.width < 760;
    const outer = Math.max(...this.screenRings.flatMap(ring => ring.points.map(p => Math.abs(p.x - center.x))), 0);
    for (const { cluster } of this.screenRings) {
      const ring = cluster.ring;
      if (!ring || (this.appearance.domain && this.appearance.domain !== cluster.name)) continue;
      if (compact && !this.appearance.domain) continue;
      const anchor = this.project({ x: Math.cos(ring.labelAngle) * ring.radius, y: Math.sin(ring.labelAngle) * ring.radius, z: 0 });
      if (!anchor) continue;
      const right = Math.cos(ring.labelAngle) > 0;
      const width = 128, height = 44;
      const x = clamp(right ? center.x + outer + 34 : center.x - outer - width - 34,
        this.view.x + 12, this.view.x + this.view.width - width - 12);
      let y = clamp(anchor.y - 16, this.view.y + 74, this.view.y + this.view.height - height - 50);
      for (const other of this.labelBoxes) {
        if (Math.abs(other.x - x) < width && Math.abs(other.y - y) < 54) y = other.y + 58;
      }
      if (y + height > this.view.y + this.view.height - 35) continue;
      ctx.globalAlpha = opacity;
      const endX = right ? x : x + width;
      const direction = right ? 1 : -1;
      const lineEnd = endX - direction * 12;
      const emphasized = this.hoveredDomain === cluster.name || this.appearance.domain === cluster.name;
      // The middle of the leader recedes through the orbital bands; only its ends carry emphasis.
      const gradient = ctx.createLinearGradient(anchor.x, anchor.y, lineEnd, y + 13);
      gradient.addColorStop(0, cluster.color + (emphasized ? 'a0' : '55'));
      gradient.addColorStop(0.15, cluster.color + (emphasized ? '48' : '12'));
      gradient.addColorStop(0.65, cluster.color + (emphasized ? '48' : '12'));
      gradient.addColorStop(1, cluster.color + (emphasized ? 'a0' : '55'));
      ctx.strokeStyle = gradient; ctx.lineWidth = emphasized ? 0.95 : 0.7;
      const length = lineEnd - anchor.x;
      const bend = Math.min(24, Math.abs(length) * 0.12) * (anchor.y < center.y ? -1 : 1);
      ctx.beginPath(); ctx.moveTo(anchor.x + direction * 4, anchor.y);
      ctx.bezierCurveTo(anchor.x + length * 0.35, anchor.y + bend,
        lineEnd - direction * 28, y + 13, lineEnd, y + 13);
      ctx.stroke();
      ctx.fillStyle = cluster.color + (emphasized ? 'ff' : 'a0');
      ctx.beginPath(); ctx.arc(anchor.x, anchor.y, emphasized ? 2 : 1.5, 0, TAU); ctx.fill();
      ctx.textAlign = right ? 'left' : 'right'; ctx.textBaseline = 'top';
      ctx.fillStyle = cluster.color;
      ctx.font = '500 15px "Noto Sans SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(cluster.name, endX, y);
      ctx.fillStyle = theme.muted; ctx.font = '11px "DM Sans", sans-serif';
      ctx.fillText(cluster.count.toLocaleString() + ' MODELS', endX, y + 25);
      this.labelBoxes.push({ x, y, width, height, name: cluster.name });
    }
    ctx.globalAlpha = 1;
  }

  private pickRing(x: number, y: number): string | null {
    let nearest = Infinity;
    let name: string | null = null;
    for (const { cluster, points } of this.screenRings) {
      const ring = cluster.ring;
      if (!ring) continue;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / Math.max(0.001, dx * dx + dy * dy), 0, 1);
        const distance = Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
        if (distance < Math.max(6, ring.halfWidth * a.scale + 3) && distance < nearest) {
          nearest = distance; name = cluster.name;
        }
      }
    }
    return name;
  }

  private drawRecommendation(point: ScreenStar, rank: number): void {
    const ctx = this.context;
    ctx.globalAlpha = 1;
    ctx.fillStyle = theme.background;
    ctx.strokeStyle = theme.highlight;
    ctx.lineWidth = point.star.id === this.appearance.selectedId ? 1.5 : 1;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 7, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = theme.highlight;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 2.5, 0, TAU);
    ctx.fill();
    ctx.font = '10px "DM Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(String(rank).padStart(2, '0'), point.x + 11, point.y - 7);
  }

  private drawLabels(opacity = 1): void {
    this.labelBoxes = [];
    if (!this.appearance.labels || opacity <= 0) return;
    if (this.screenRings.length) { this.drawRingLabels(opacity); return; }
    const ctx = this.context;
    ctx.textBaseline = 'top';
    ctx.font = '11px "Noto Sans SC", "Microsoft YaHei", sans-serif';
    const compact = this.view.width < 600;
    const clusters = [...this.screenClusters].sort((a, b) => {
      if (a.cluster.name === this.appearance.domain) return -1;
      if (b.cluster.name === this.appearance.domain) return 1;
      if (compact) return b.cluster.count - a.cluster.count;
      return a.depth - b.depth;
    });
    for (const point of clusters) {
      if (this.appearance.domain && this.appearance.domain !== point.cluster.name) continue;
      if (compact && this.labelBoxes.length >= 5) break;
      const title = point.cluster.name;
      const count = point.cluster.count.toLocaleString() + ' MODELS';
      const titleWidth = ctx.measureText(title).width;
      ctx.font = '9px "DM Sans", sans-serif';
      const countWidth = compact ? 0 : ctx.measureText(count).width;
      ctx.font = '11px "Noto Sans SC", "Microsoft YaHei", sans-serif';
      const width = Math.max(titleWidth, countWidth) + 12;
      const height = compact ? 17 : 32;
      const offset = Math.min(point.radius, 200) + 12;
      const positions = [
        { x: point.x - width / 2, y: point.y + offset },
        { x: point.x + offset, y: point.y - height / 2 },
        { x: point.x - width - offset, y: point.y - height / 2 },
        { x: point.x - width / 2, y: point.y - offset - height },
      ];
      const position = positions.find(({ x, y }) => x >= this.view.x + 8 && x + width <= this.view.x + this.view.width - 8
        && y >= this.view.y + 74 && y + height <= this.view.y + this.view.height - 80
        && !this.labelBoxes.some(other => x < other.x + other.width + 10 && x + width + 10 > other.x && y < other.y + other.height + 8 && y + height + 8 > other.y)
        && !this.screenClusters.some(other => other.cluster.name !== point.cluster.name
          && (!this.appearance.domain || other.cluster.name === this.appearance.domain)
          && Math.hypot(other.x - clamp(other.x, x, x + width), other.y - clamp(other.y, y, y + height)) < other.radius * 0.8));
      if (!position) continue;
      const { x, y } = position;
      const box = { x, y, width, height, name: title };
      this.labelBoxes.push(box);
      ctx.globalAlpha = clamp(this.home.distance / point.depth, 0.5, 1) * opacity;
      const endX = clamp(point.x, x, x + width);
      const endY = clamp(point.y, y, y + height);
      const dx = endX - point.x, dy = endY - point.y;
      const length = Math.hypot(dx, dy);
      if (length > 15) {
        const start = Math.min(point.radius * 0.7, length - 6) / length;
        ctx.strokeStyle = theme.muted + '55';
        ctx.lineWidth = 0.65;
        ctx.beginPath();
        ctx.moveTo(point.x + dx * start, point.y + dy * start);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      }
      ctx.fillStyle = theme.ink;
      ctx.textAlign = 'center';
      ctx.fillText(title, x + width / 2, y);
      if (!compact) {
        ctx.font = '9px "DM Sans", sans-serif';
        ctx.fillStyle = theme.muted;
        ctx.fillText(count, x + width / 2, y + 17);
        ctx.font = '11px "Noto Sans SC", "Microsoft YaHei", sans-serif';
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawOrientation(): void {
    const ctx = this.context;
    const basis = cameraBasis(this.camera);
    const cx = this.width - 39, cy = this.height - 38;
    const axes = [
      { x: basis.right.x, y: basis.up.x, label: 'X' },
      { x: basis.right.y, y: basis.up.y, label: 'Y' },
      { x: basis.right.z, y: basis.up.z, label: 'Z' },
    ];
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = theme.muted + '90';
    ctx.fillStyle = theme.muted;
    ctx.font = '8px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const axis of axes) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + axis.x * 18, cy - axis.y * 18);
      ctx.stroke();
      ctx.fillText(axis.label, cx + axis.x * 27, cy - axis.y * 27);
    }
  }

  private drawTooltip(point: ScreenStar): void {
    const ctx = this.context;
    this.drawReticle(point);
    ctx.font = '11px "Noto Sans SC", "Microsoft YaHei", sans-serif';
    const maxWidth = Math.min(280, this.view.width - 40);
    let title = point.star.name;
    while (title.length > 1 && ctx.measureText(title).width > maxWidth - 24) title = title.slice(0, -2) + '…';
    const width = Math.max(140, ctx.measureText(title).width + 24);
    const x = clamp(point.x + 14, this.view.x + 12, this.view.x + this.view.width - width - 12);
    const y = clamp(point.y - 58, this.view.y + 80, this.view.y + this.view.height - 116);
    ctx.fillStyle = theme.tooltipBackground;
    ctx.strokeStyle = theme.tooltipBorder;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.roundRect(x, y, width, 48, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = theme.ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(title, x + 12, y + 10);
    ctx.fillStyle = theme.muted;
    ctx.font = '9px "Noto Sans SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(this.appearance.recommendations.has(point.star.id) ? '点击查看推荐理由与详情' : '点击查看详情 · ' + this.groupOf(point.star), x + 12, y + 29);
  }

  private pick(x: number, y: number): ScreenStar | null {
    let best: ScreenStar | null = null;
    let nearest = Number.POSITIVE_INFINITY;
    for (let index = this.screenStars.length - 1; index >= 0; index -= 1) {
      const point = this.screenStars[index];
      if (!point || !this.appearance.recommendations.has(point.star.id)) continue;
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance <= 7) return point;
      if (distance <= 11 && distance < nearest) { best = point; nearest = distance; }
    }
    if (best) return best;
    // Foreground first resolves equal-distance overlaps in the rendered order.
    for (let index = this.screenStars.length - 1; index >= 0; index -= 1) {
      const point = this.screenStars[index];
      if (!point || (this.appearance.domain && this.groupOf(point.star) !== this.appearance.domain)) continue;
      if (this.appearance.searching && !this.appearance.matchIds.has(point.star.id)) continue;
      const distance = Math.hypot(point.x - x, point.y - y);
      const visibleRadius = point.radius + (point.star.id === this.appearance.selectedId ? 1 : 0);
      if (distance <= visibleRadius) return point;
      if (distance < Math.max(5, point.radius + 3) && distance < nearest) {
        nearest = distance;
        best = point;
      }
    }
    return best;
  }

  private position(event: PointerEvent): { x: number; y: number } {
    const bounds = this.canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  /** Pause the nearest visible galaxy, with a small exit margin to prevent flicker. */
  private updateHoveredDomain(): void {
    if (!this.hoverPosition) { this.hoveredDomain = null; return; }
    const { x, y } = this.hoverPosition;
    let nearest = 28 * 28;
    let domain: string | null = null;
    let stillNearby = false;
    for (let index = this.screenStars.length - 1; index >= 0; index -= 1) {
      const point = this.screenStars[index];
      if (!point) continue;
      const distance = (point.x - x) ** 2 + (point.y - y) ** 2;
      if (this.groupOf(point.star) === this.hoveredDomain && distance <= 40 * 40) stillNearby = true;
      if (distance < nearest) { nearest = distance; domain = this.groupOf(point.star); }
    }
    const label = this.labelBoxes.find(box => x >= box.x - 6 && x <= box.x + box.width + 6
      && y >= box.y - 6 && y <= box.y + box.height + 6);
    this.hoveredDomain = domain ?? label?.name ?? (stillNearby ? this.hoveredDomain : null);
  }

  private pointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 && event.button !== 2) return;
    event.preventDefault();
    this.canvas.focus({ preventScroll: true });
    this.canvas.setPointerCapture(event.pointerId);
    const { x, y } = this.position(event);
    this.hoverPosition = { x, y };
    this.updateHoveredDomain();
    if (this.pointers.size === 0) this.dragged = false;
    else this.dragged = true;
    this.pointers.set(event.pointerId, { x, y, startX: x, startY: y, pan: event.shiftKey || event.button === 2 });
    this.hovered = null;
    this.canvas.style.cursor = 'grabbing';
    this.invalidate();
  };

  private pointerMove = (event: PointerEvent): void => {
    const { x, y } = this.position(event);
    const pointer = this.pointers.get(event.pointerId);
    if (event.pointerType !== 'touch' || pointer) {
      this.hoverPosition = { x, y };
      this.updateHoveredDomain();
    }
    if (!pointer) {
      const next = this.pick(x, y);
      if (next?.star.id !== this.hovered?.star.id) {
        this.hovered = next;
        this.canvas.style.cursor = next ? 'pointer' : 'grab';
        this.invalidate();
      }
      return;
    }
    const dx = x - pointer.x, dy = y - pointer.y;
    if (dx || dy) { this.framedGroup = null; this.focusedStar = null; }
    if (Math.hypot(x - pointer.startX, y - pointer.startY) > 4) this.dragged = true;
    if (this.pointers.size > 1) {
      const other = [...this.pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
      if (other) {
        const previous = Math.hypot(pointer.x - other.x, pointer.y - other.y);
        const next = Math.hypot(x - other.x, y - other.y);
        if (previous > 3 && next > 3) {
          const distance = clampDistance(this.destination.distance * previous / next, this.layout.extent);
          this.zoomAt(distance, (pointer.x + other.x) / 2, (pointer.y + other.y) / 2);
        }
        this.pan(dx / 2, dy / 2);
      }
    } else if (pointer.pan || event.shiftKey) {
      this.pan(dx, dy);
    } else {
      this.destination.yaw -= dx * 0.005;
      this.destination.pitch = clamp(this.destination.pitch + dy * 0.005, -1.46, 1.46);
    }
    pointer.x = x;
    pointer.y = y;
    this.invalidate();
  };

  private pointerUp = (event: PointerEvent): void => {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    const { x, y } = this.position(event);
    this.hoverPosition = event.pointerType === 'touch' || x < 0 || y < 0 || x > this.width || y > this.height ? null : { x, y };
    this.updateHoveredDomain();
    this.pointers.delete(event.pointerId);
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    this.canvas.style.cursor = 'grab';
    if (!this.dragged && event.button === 0 && this.pointers.size === 0) {
      const star = this.pick(x, y);
      if (star) this.callbacks.selectStar(star.star);
      else if (!this.morph) {
        const label = this.labelBoxes.find(box => x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height);
        const cluster = [...this.screenClusters].reverse().find(point => !point.cluster.ring && Math.hypot(x - point.x, y - point.y) < point.radius);
        const name = label?.name ?? this.pickRing(x, y) ?? cluster?.cluster.name;
        if (name) this.callbacks.selectCluster(name);
      }
    }
    this.invalidate();
  };

  private pointerCancel = (event: PointerEvent): void => {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.delete(event.pointerId);
    this.hoverPosition = null;
    this.hoveredDomain = null;
    this.dragged = true;
    this.canvas.style.cursor = 'grab';
    this.invalidate();
  };

  private pointerLeave = (): void => {
    this.hovered = null;
    this.hoverPosition = null;
    this.hoveredDomain = null;
    this.invalidate();
  };

  private wheel = (event: WheelEvent): void => {
    this.focusedStar = null;
    this.framedGroup = null;
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1);
    const bounds = this.canvas.getBoundingClientRect();
    const distance = clampDistance(this.destination.distance / Math.exp(clamp(-delta * 0.0015, -1, 1)), this.layout.extent);
    this.zoomAt(distance, event.clientX - bounds.left, event.clientY - bounds.top);
    this.hovered = null;
    this.invalidate();
  };

  private keyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Home') {
      event.preventDefault();
      this.callbacks.reset();
    } else if (event.key === '+' || event.key === '=' || event.key === '-') {
      event.preventDefault();
      this.zoomBy(event.key === '-' ? 1 / 1.25 : 1.25);
    } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      this.focusedStar = null;
      this.framedGroup = null;
      event.preventDefault();
      const dx = event.key === 'ArrowLeft' ? -30 : event.key === 'ArrowRight' ? 30 : 0;
      const dy = event.key === 'ArrowUp' ? -30 : event.key === 'ArrowDown' ? 30 : 0;
      if (event.shiftKey) this.pan(dx, dy);
      else {
        this.destination.yaw -= dx * 0.005;
        this.destination.pitch = clamp(this.destination.pitch + dy * 0.005, -1.46, 1.46);
      }
      this.hovered = null;
      this.invalidate();
    }
  };
}
