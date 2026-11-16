export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface OrbitCamera {
  target: Point3;
  yaw: number;
  pitch: number;
  distance: number;
}

export interface ProjectedPoint {
  x: number;
  y: number;
  depth: number;
  scale: number;
}

export interface CameraBasis {
  right: Point3;
  up: Point3;
  /** Depth axis pointing from the target toward the camera. */
  forward: Point3;
}

export const CAMERA_FOV = 42 * Math.PI / 180;
export const CAMERA_NEAR = 10;

function focalLength(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError('Camera viewport dimensions must be finite and positive.');
  }
  return Math.min(width, height) / (2 * Math.tan(CAMERA_FOV / 2));
}

function validateExtent(extent: number): void {
  if (!Number.isFinite(extent) || extent <= 0) {
    throw new RangeError('Galaxy extent must be finite and positive.');
  }
}

export function cameraBasis(camera: OrbitCamera): CameraBasis {
  const sinYaw = Math.sin(camera.yaw);
  const cosYaw = Math.cos(camera.yaw);
  const sinPitch = Math.sin(camera.pitch);
  const cosPitch = Math.cos(camera.pitch);
  return {
    right: { x: cosYaw, y: 0, z: -sinYaw },
    up: { x: -sinPitch * sinYaw, y: cosPitch, z: -sinPitch * cosYaw },
    forward: { x: cosPitch * sinYaw, y: sinPitch, z: cosPitch * cosYaw },
  };
}

export function projectPoint(
  point: Point3,
  camera: OrbitCamera,
  width: number,
  height: number,
): ProjectedPoint | null {
  const focal = focalLength(width, height);
  const basis = cameraBasis(camera);
  const dx = point.x - camera.target.x;
  const dy = point.y - camera.target.y;
  const dz = point.z - camera.target.z;
  const depth = camera.distance - (dx * basis.forward.x + dy * basis.forward.y + dz * basis.forward.z);
  if (!Number.isFinite(depth) || depth < CAMERA_NEAR) return null;
  const scale = focal / depth;
  return {
    x: width / 2 + (dx * basis.right.x + dy * basis.right.y + dz * basis.right.z) * scale,
    y: height / 2 - (dx * basis.up.x + dy * basis.up.y + dz * basis.up.z) * scale,
    depth,
    scale,
  };
}

/** Drag offsets are screen pixels; the target plane follows the pointer exactly. */
export function panCamera(
  camera: OrbitCamera,
  dxPixels: number,
  dyPixels: number,
  width: number,
  height: number,
): OrbitCamera {
  const worldPerPixel = camera.distance / focalLength(width, height);
  const basis = cameraBasis(camera);
  const horizontal = dxPixels * worldPerPixel;
  const vertical = dyPixels * worldPerPixel;
  return {
    ...camera,
    target: {
      x: camera.target.x - basis.right.x * horizontal + basis.up.x * vertical,
      y: camera.target.y - basis.right.y * horizontal + basis.up.y * vertical,
      z: camera.target.z - basis.right.z * horizontal + basis.up.z * vertical,
    },
  };
}

/** Keep the target-plane world point under an anchor fixed; distance is already clamped. */
export function zoomCameraAt(
  camera: OrbitCamera,
  newDistance: number,
  anchorX: number,
  anchorY: number,
  width: number,
  height: number,
): OrbitCamera {
  const offsetFactor = 1 - camera.distance / newDistance;
  return panCamera(
    { ...camera, distance: newDistance },
    (anchorX - width / 2) * offsetFactor,
    (anchorY - height / 2) * offsetFactor,
    width,
    height,
  );
}

/** Fit a world-space group at the current orientation, up to the global zoom limit. */
export function fitCameraToPoints(
  points: readonly Point3[],
  camera: OrbitCamera,
  width: number,
  height: number,
  extent: number,
): OrbitCamera {
  const first = points[0];
  if (!first) return { ...camera, target: { ...camera.target } };
  const focal = focalLength(width, height);
  validateExtent(extent);
  let minX = first.x, maxX = first.x;
  let minY = first.y, maxY = first.y;
  let minZ = first.z, maxZ = first.z;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  const target = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 };
  const basis = cameraBasis(camera);
  const horizontalRoom = width / 2 - Math.min(44, width * 0.1);
  const topRoom = height / 2 - Math.min(80, height * 0.2);
  const bottomRoom = height / 2 - Math.min(90, height * 0.22);
  let distance = Math.max(extent * 0.28, CAMERA_NEAR);
  for (const point of points) {
    const dx = point.x - target.x, dy = point.y - target.y, dz = point.z - target.z;
    const right = dx * basis.right.x + dy * basis.right.y + dz * basis.right.z;
    const up = dx * basis.up.x + dy * basis.up.y + dz * basis.up.z;
    const forward = dx * basis.forward.x + dy * basis.forward.y + dz * basis.forward.z;
    const depth = Math.max(
      CAMERA_NEAR,
      Math.abs(right) * focal / horizontalRoom,
      Math.abs(up) * focal / (up >= 0 ? topRoom : bottomRoom),
    );
    distance = Math.max(distance, forward + depth);
  }
  return { ...camera, target, distance: clampDistance(distance, extent) };
}

export function homeCamera(extent: number): OrbitCamera {
  validateExtent(extent);
  return { target: { x: 0, y: 0, z: 0 }, yaw: 0.12, pitch: 0.12, distance: extent * 3.1 };
}

/** Fit the whole catalogue to its perspective bounds, without moving any model. */
export function overviewCamera(
  points: readonly Point3[],
  width: number,
  height: number,
  extent: number,
): OrbitCamera {
  const focal = focalLength(width, height);
  const base = homeCamera(extent);
  if (!points.length) return base;
  // A steeper view uses portrait space while preserving the same spatial scene.
  const portrait = width / height < 0.8;
  const camera = { ...base, yaw: portrait ? 1.65 : 0.35, pitch: portrait ? 0.9 : 0.12 };
  const basis = cameraBasis(camera);
  const horizontal = (width / 2 - Math.min(24, width * 0.06)) / focal;
  const top = (height / 2 - Math.min(70, height * 0.18)) / focal;
  const bottom = (height / 2 - Math.min(78, height * 0.18)) / focal;
  let near = -Infinity, far = Infinity;
  let rightLower = -Infinity, rightUpper = Infinity;
  let upLower = -Infinity, upUpper = Infinity;
  for (const point of points) {
    const right = point.x * basis.right.x + point.y * basis.right.y + point.z * basis.right.z;
    const up = point.x * basis.up.x + point.y * basis.up.y + point.z * basis.up.z;
    const forward = point.x * basis.forward.x + point.y * basis.forward.y + point.z * basis.forward.z;
    near = Math.max(near, forward);
    far = Math.min(far, forward);
    rightLower = Math.max(rightLower, right + horizontal * forward);
    rightUpper = Math.min(rightUpper, right - horizontal * forward);
    upLower = Math.max(upLower, up + top * forward);
    upUpper = Math.min(upUpper, up - bottom * forward);
  }
  const targetDepth = (near + far) / 2;
  // Intersect each point's frustum constraints. This is the nearest eye depth
  // for which both horizontal and vertical target intervals are nonempty.
  const minimumEyeDepth = Math.max(
    (rightLower - rightUpper) / (2 * horizontal),
    (upLower - upUpper) / (top + bottom),
    near + CAMERA_NEAR,
  );
  const distance = clampDistance(minimumEyeDepth - targetDepth, extent);
  const eyeDepth = targetDepth + distance;
  const targetRight = (rightLower + rightUpper) / 2;
  const targetUp = (upLower - top * eyeDepth + upUpper + bottom * eyeDepth) / 2;
  return {
    ...camera,
    distance,
    target: {
      x: basis.right.x * targetRight + basis.up.x * targetUp + basis.forward.x * targetDepth,
      y: basis.right.y * targetRight + basis.up.y * targetUp + basis.forward.y * targetDepth,
      z: basis.right.z * targetRight + basis.up.z * targetUp + basis.forward.z * targetDepth,
    },
  };
}

export function clampDistance(distance: number, extent: number): number {
  validateExtent(extent);
  if (!Number.isFinite(distance)) {
    throw new RangeError('Camera distance must be finite.');
  }
  return Math.max(extent * 0.1, Math.min(extent * 6, distance));
}
