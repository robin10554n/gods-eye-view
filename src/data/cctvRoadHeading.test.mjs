import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCctvRoadHeadingQuery,
  chooseClearerHeading,
  fetchNearbyRoadElements,
  headingDeltaDeg,
  nearestRoadHeadingDeg,
  segmentBearingDeg,
  shouldSnapRoadHeading,
} from './cctvRoadHeading.js';

test('segment bearing is north-clockwise', () => {
  assert.equal(Math.round(segmentBearingDeg({ lat: 51.5, lon: -0.12 }, { lat: 51.6, lon: -0.12 })), 0);
  assert.equal(Math.round(segmentBearingDeg({ lat: 51.5, lon: -0.12 }, { lat: 51.5, lon: -0.11 })), 90);
});

test('nearest road heading snaps to the closest carriageway segment', () => {
  const heading = nearestRoadHeadingDeg(51.50005, -0.12, [
    {
      geometry: [
        { lat: 51.4990, lon: -0.12 },
        { lat: 51.5010, lon: -0.12 },
      ],
    },
    {
      geometry: [
        { lat: 51.5000, lon: -0.118 },
        { lat: 51.5000, lon: -0.116 },
      ],
    },
  ]);
  assert.ok(headingDeltaDeg(heading, 0) < 2, `got ${heading}, expected ~0 (north-south road)`);
});

test('nearest road heading stays NaN when every way is too far', () => {
  assert.ok(Number.isNaN(nearestRoadHeadingDeg(51.5, -0.12, [
    { geometry: [{ lat: 51.52, lon: -0.10 }, { lat: 51.53, lon: -0.10 }] },
  ])));
});

test('clearer heading prefers the unobstructed street over a nearby facade', () => {
  assert.equal(chooseClearerHeading(10, 190, 14, Infinity, 12), 190);
  assert.equal(chooseClearerHeading(10, 190, 80, 18, 12), 10);
});

test('equal clearance keeps the heading closer to the current prior', () => {
  assert.equal(chooseClearerHeading(20, 200, 40, 41, 15), 20);
  assert.equal(chooseClearerHeading(20, 200, Infinity, Infinity, 15), 20);
});

test('road snap is only for guessed, unsaved poses', () => {
  assert.equal(shouldSnapRoadHeading({ headingConfidence: 'low' }), true);
  assert.equal(shouldSnapRoadHeading({ headingConfidence: 'high' }), false);
  assert.equal(shouldSnapRoadHeading({ headingConfidence: 'low', calSource: 'manual' }), false);
  assert.equal(shouldSnapRoadHeading({ headingConfidence: 'low', poseSource: 'curated' }), false);
  assert.equal(shouldSnapRoadHeading({ headingConfidence: 'low', roadHeadingSnapped: true }), false);
});

test('Overpass query stays a tight around-filter on drivable highways', () => {
  const query = buildCctvRoadHeadingQuery(51.5074, -0.1278);
  assert.match(query, /way\(around:80,51\.5074,-0\.1278\)/);
  assert.match(query, /motorway\|trunk\|primary/);
  assert.doesNotMatch(query, /footway|path|cycleway/);
});

test('road element fetch posts to the Overpass proxy and returns elements', async () => {
  let body = '';
  const elements = await fetchNearbyRoadElements(51.5, -0.12, {
    fetchImpl: async (_url, options) => {
      body = String(options.body || '');
      return {
        ok: true,
        json: async () => ({ elements: [{ id: 1, geometry: [] }] }),
      };
    },
  });
  assert.equal(elements.length, 1);
  assert.match(body, /data=/);
});
