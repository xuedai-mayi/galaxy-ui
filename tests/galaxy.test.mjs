import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { DOMAIN_ANCHORS, FUNCTION_ANCHORS, DOMAIN_NAMES } from '../src/galaxy-config.ts';
import { parseModels } from '../src/data/models.ts';
import { buildGalaxy, buildFunctionGalaxy, galaxyGroup } from '../src/galaxy-layout.ts';
import { GalaxyMotion } from '../src/galaxy-motion.ts';
import { GalaxyMorph } from '../src/galaxy-morph.ts';

const models = parseModels(JSON.parse(readFileSync(new URL('../public/models.json', import.meta.url), 'utf8')));
const galaxies = buildGalaxy(models);
const rings = buildFunctionGalaxy(models);

test('extracted configuration preserves every coordinate and visual attribute', () => {
  // Keep six decimals so platform-specific trigonometric rounding does not fail CI.
  const digest = value => createHash('sha256').update(JSON.stringify(value,
    (_, item) => typeof item === 'number' ? Number(item.toFixed(6)) : item)).digest('hex');
  assert.equal(digest(galaxies), '962a74c96710b46d0574dac8605353e62bbe770f5607bcb4539f3866951bd6ba');
  assert.equal(digest(rings), '6e394d1e903d0075fd302aad4790a5f319b49d70f77e0903d7239b130aec8236');
});

test('classification and validation share one configuration without ambiguous labels', () => {
  assert.equal(DOMAIN_NAMES.size, DOMAIN_ANCHORS.length);
  assert.equal(new Set(FUNCTION_ANCHORS.map(group => group.name)).size, FUNCTION_ANCHORS.length);
  const tasks = FUNCTION_ANCHORS.flatMap(group => group.tasks);
  assert.equal(new Set(tasks).size, tasks.length);
  assert.equal(FUNCTION_ANCHORS.filter(group => !group.tasks.length).length, 1);
  for (const group of DOMAIN_ANCHORS) {
    assert.equal(parseModels([{ ...models[0], domain: group.name }])[0].domain, group.name);
  }
  for (const group of FUNCTION_ANCHORS) {
    for (const task of group.tasks) assert.equal(galaxyGroup({ ...models[0], task }, 'function'), group.name);
  }
});

test('both layouts preserve each record exactly once, with finite coordinates', () => {
  for (const layout of [galaxies, rings]) {
    assert.equal(layout.stars.length, models.length);
    assert.equal(new Set(layout.stars.map(star => star.id)).size, models.length);
    assert.equal(layout.clusters.reduce((sum, cluster) => sum + cluster.count, 0), models.length);
    for (const star of layout.stars) {
      assert.ok([star.x, star.y, star.z, star.radius].every(Number.isFinite));
      assert.ok(Math.hypot(star.x, star.y, star.z) <= layout.extent);
    }
  }
  assert.equal(galaxies.clusters.length, 15);
  assert.equal(rings.clusters.length, 7);
});

test('input ordering does not change either layout', () => {
  assert.deepEqual(buildGalaxy([...models].reverse()), galaxies);
  assert.deepEqual(buildFunctionGalaxy([...models].reverse()), rings);
});

test('galaxy-to-ring and ring-to-galaxy transitions end at the target coordinates', () => {
  for (const [from, to] of [[galaxies, rings], [rings, galaxies]]) {
    const morph = new GalaxyMorph(new Map(from.stars.map(star => [star.id, star])), to.stars);
    const first = from.stars[0];
    assert.equal(morph.sample(first.id).x, first.x);
    morph.advance(840);
    for (const star of to.stars) assert.ok(Number.isFinite(morph.sample(star.id).z));
    morph.advance(840);
    assert.equal(morph.finished, true);
    for (const star of to.stars) {
      const point = morph.sample(star.id);
      assert.ok(Math.hypot(point.x - star.x, point.y - star.y, point.z - star.z) < 1e-8);
      assert.equal(point.color, star.color);
    }
  }
});

test('pause and hover hold orbit time while other groups keep moving', () => {
  for (const [layout, taxonomy] of [[galaxies, 'domain'], [rings, 'function']]) {
    const motion = new GalaxyMotion(layout, star => galaxyGroup(star, taxonomy));
    const group = layout.clusters[0].name;
    motion.advance(1, true, null);
    assert.equal(motion.phase(group), 0);
    motion.advance(1, false, group);
    assert.equal(motion.phase(group), 0);
    assert.notEqual(motion.phase(layout.clusters[1].name), 0);
    motion.advance(1, false, null);
    assert.notEqual(motion.phase(group), 0);
  }
});

test('malformed, empty and duplicate records fail at the JSON boundary', () => {
  assert.throws(() => parseModels([]));
  assert.throws(() => parseModels([{ ...models[0], domain: 'invalid' }]));
  assert.throws(() => parseModels([models[0], models[0]]));
  assert.throws(() => parseModels([{ ...models[0], id: '' }]));
  assert.throws(() => parseModels([{ ...models[0], year: '2026' }]));
  assert.throws(() => parseModels([{ ...models[0], interface_count: -1 }]));
  assert.throws(() => buildGalaxy([models[0], models[0]]));
});
