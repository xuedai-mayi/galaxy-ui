import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAMERA_NEAR,
  cameraBasis,
  clampDistance,
  fitCameraToPoints,
  homeCamera,
  panCamera,
  projectPoint,
  zoomCameraAt,
} from '../src/galaxy-camera.ts';

const origin = { x: 0, y: 0, z: 0 };
const camera = { target: origin, yaw: 0, pitch: 0, distance: 1000 };
const viewport = [1000, 800];
function close(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} differs from ${expected}`);
}
function projection(point, view = camera) {
  const result = projectPoint(point, view, ...viewport);
  assert.ok(result);
  return result;
}
function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

test('target projects to the viewport center at every orientation', () => {
  const target = { x: 43, y: -26, z: 97 };
  const projected = projection(target, { ...camera, target, yaw: 0.72, pitch: -0.63 });
  close(projected.x, 500);
  close(projected.y, 400);
  close(projected.depth, camera.distance);
});

test('perspective enlarges nearby models and world up maps to screen up', () => {
  const near = projection({ x: 100, y: 100, z: 400 });
  const far = projection({ x: 100, y: 100, z: -400 });
  assert.ok(near.scale > far.scale);
  assert.ok(near.x > far.x);
  assert.ok(near.y < far.y);
  assert.ok(far.y < 400);
  close(near.scale / far.scale, 1400 / 600);
});

test('positive yaw brings positive x closer and turns positive z left', () => {
  const rotated = { ...camera, yaw: Math.PI / 2 };
  close(projection({ x: 100, y: 0, z: 0 }, rotated).depth, 900);
  assert.ok(projection({ x: 0, y: 0, z: 100 }, rotated).x < 500);
});

test('positive pitch brings positive y closer and turns positive z down', () => {
  const rotated = { ...camera, pitch: Math.PI / 2 };
  close(projection({ x: 0, y: 100, z: 0 }, rotated).depth, 900);
  assert.ok(projection({ x: 0, y: 0, z: 100 }, rotated).y > 400);
});

test('full rotations preserve projection', () => {
  const point = { x: 70, y: -55, z: 32 };
  const initial = { ...camera, yaw: 1.24, pitch: -0.36 };
  const expected = projection(point, initial);
  const actual = projection(point, { ...initial, yaw: initial.yaw + 2 * Math.PI, pitch: initial.pitch + 2 * Math.PI });
  close(actual.x, expected.x);
  close(actual.y, expected.y);
  close(actual.depth, expected.depth);
});

test('near plane includes its boundary and clips points behind it', () => {
  close(projection({ x: 0, y: 0, z: camera.distance - CAMERA_NEAR }).depth, CAMERA_NEAR);
  assert.equal(projectPoint({ x: 0, y: 0, z: 991 }, camera, ...viewport), null);
  assert.equal(projectPoint({ x: 0, y: 0, z: 1100 }, camera, ...viewport), null);
});

test('camera basis is orthonormal and follows the projected screen axes', () => {
  const rotated = { ...camera, yaw: 1.1, pitch: 0.7 };
  const basis = cameraBasis(rotated);
  for (const axis of Object.values(basis)) close(dot(axis, axis), 1);
  close(dot(basis.right, basis.up), 0);
  close(dot(basis.right, basis.forward), 0);
  close(dot(basis.up, basis.forward), 0);
  const right = projection(basis.right, rotated);
  const up = projection(basis.up, rotated);
  const forward = projection(basis.forward, rotated);
  assert.ok(right.x > 500);
  close(right.y, 400);
  close(up.x, 500);
  assert.ok(up.y < 400);
  close(forward.depth, 999);
});

test('panning follows a pixel drag on the target plane without mutating the camera', () => {
  const initial = { ...camera, target: { x: 60, y: 20, z: -50 }, yaw: 0.83, pitch: -0.41 };
  const saved = structuredClone(initial);
  const panned = panCamera(initial, 84, -39, ...viewport);
  const moved = projection(initial.target, panned);
  close(moved.x, 584);
  close(moved.y, 361);
  close(moved.depth, initial.distance);
  assert.deepEqual(initial, saved);
  const restored = panCamera(panned, -84, 39, ...viewport);
  close(restored.target.x, initial.target.x);
  close(restored.target.y, initial.target.y);
  close(restored.target.z, initial.target.z);
});

test('home camera and zoom bounds scale with extent and remain positive', () => {
  assert.deepEqual(homeCamera(500), { target: origin, yaw: 0.12, pitch: 0.12, distance: 1550 });
  close(clampDistance(-100, 500), 50);
  close(clampDistance(10000, 500), 3000);
  close(clampDistance(777, 500), 777);
  for (const extent of [1, 100, 1000]) assert.ok(clampDistance(0, extent) > 0);
});

for (const [name, distance] of [
  ['zoom in', 400],
  ['zoom out', 2200],
  ['minimum clamped distance', clampDistance(-100, 500)],
  ['maximum clamped distance', clampDistance(10000, 500)],
]) {
  test(`anchored ${name} holds a target-plane point fixed under an edge anchor`, () => {
    const initial = { ...camera, target: { x: 137, y: -82, z: 215 }, yaw: 0.87, pitch: -0.62 };
    const saved = structuredClone(initial);
    const anchor = { x: 930, y: 75 };
    const basis = cameraBasis(initial);
    const scale = projection(initial.target, initial).scale;
    const horizontal = (anchor.x - viewport[0] / 2) / scale;
    const vertical = -(anchor.y - viewport[1] / 2) / scale;
    const anchoredPoint = {
      x: initial.target.x + basis.right.x * horizontal + basis.up.x * vertical,
      y: initial.target.y + basis.right.y * horizontal + basis.up.y * vertical,
      z: initial.target.z + basis.right.z * horizontal + basis.up.z * vertical,
    };
    const before = projection(anchoredPoint, initial);
    close(before.x, anchor.x);
    close(before.y, anchor.y);
    const zoomed = zoomCameraAt(initial, distance, anchor.x, anchor.y, ...viewport);
    const after = projection(anchoredPoint, zoomed);
    close(after.x, anchor.x);
    close(after.y, anchor.y);
    close(after.depth, distance);
    close(zoomed.distance, distance);
    close(zoomed.yaw, initial.yaw);
    close(zoomed.pitch, initial.pitch);
    assert.deepEqual(initial, saved);
    const restored = zoomCameraAt(zoomed, initial.distance, anchor.x, anchor.y, ...viewport);
    close(restored.target.x, initial.target.x);
    close(restored.target.y, initial.target.y);
    close(restored.target.z, initial.target.z);
  });
}

test('invalid extents, distances, and viewport dimensions are rejected', () => {
  for (const extent of [0, -1, NaN, Infinity]) {
    assert.throws(() => homeCamera(extent), RangeError);
    assert.throws(() => clampDistance(100, extent), RangeError);
  }
  assert.throws(() => clampDistance(NaN, 100), RangeError);
  assert.throws(() => projectPoint(origin, camera, 0, 800), RangeError);
  assert.throws(() => panCamera(camera, 0, 0, 1000, Infinity), RangeError);
});

const spatialPoints = [
  { x: -280, y: 130, z: 150 },
  { x: 240, y: -160, z: -220 },
  { x: 90, y: 230, z: -80 },
  { x: -110, y: -90, z: 210 },
  { x: 340, y: 85, z: 15 },
];

for (const [name, width, height, yaw, pitch] of [
  ['landscape', 1200, 720, 0.83, -0.48],
  ['portrait', 390, 740, -2.3, 1.2],
  ['compact portrait', 280, 360, 0.1, -1.4],
]) {
  test(`group fit contains noncoplanar points with padding in ${name}`, () => {
    const initial = { ...camera, target: { x: 65, y: 30, z: -91 }, yaw, pitch };
    const savedCamera = structuredClone(initial);
    const savedPoints = structuredClone(spatialPoints);
    const fitted = fitCameraToPoints(spatialPoints, initial, width, height, 500);
    assert.deepEqual(fitted.target, { x: 30, y: 35, z: -5 });
    close(fitted.yaw, yaw);
    close(fitted.pitch, pitch);
    assert.ok(fitted.distance >= 140 && fitted.distance <= 3000);
    const horizontalPadding = Math.min(44, width * 0.1);
    const topPadding = Math.min(80, height * 0.2);
    const bottomPadding = Math.min(90, height * 0.22);
    for (const point of spatialPoints) {
      const projected = projectPoint(point, fitted, width, height);
      assert.ok(projected);
      assert.ok(projected.x >= horizontalPadding - 1e-9);
      assert.ok(projected.x <= width - horizontalPadding + 1e-9);
      assert.ok(projected.y >= topPadding - 1e-9);
      assert.ok(projected.y <= height - bottomPadding + 1e-9);
    }
    assert.deepEqual(initial, savedCamera);
    assert.deepEqual(spatialPoints, savedPoints);
  });
}

test('single-point fit centers the point with a useful minimum viewing distance', () => {
  const point = { x: 190, y: -70, z: 430 };
  const initial = { ...camera, yaw: 0.9, pitch: -0.8 };
  const fitted = fitCameraToPoints([point], initial, ...viewport, 500);
  assert.deepEqual(fitted.target, point);
  assert.notEqual(fitted.target, point);
  close(fitted.distance, 140);
  const projected = projection(point, fitted);
  close(projected.x, 500);
  close(projected.y, 400);
});

test('empty group fit returns an independent clone of the current camera', () => {
  const initial = { ...camera, target: { x: 20, y: -15, z: 42 } };
  const fitted = fitCameraToPoints([], initial, ...viewport, 500);
  assert.deepEqual(fitted, initial);
  assert.notEqual(fitted, initial);
  assert.notEqual(fitted.target, initial.target);
});

test('uncontainable group fit terminates at the maximum permitted distance', () => {
  const points = [{ x: -10000, y: 0, z: 0 }, { x: 10000, y: 0, z: 0 }];
  const fitted = fitCameraToPoints(points, camera, ...viewport, 100);
  close(fitted.distance, 600);
  assert.deepEqual(fitted.target, origin);
  const first = projection(points[0], fitted);
  assert.ok(first.x < 0);
});
