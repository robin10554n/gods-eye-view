import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as Cesium from 'cesium';
import {
  applyChordLookMode,
  applyPointerCameraControls,
  globePointerCameraEvents,
  isLeftRightChord,
} from './cameraControls.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const main = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');

function mockController(overrides = {}) {
  return {
    enableRotate: true,
    enableTilt: true,
    enableLook: true,
    zoomEventTypes: [Cesium.CameraEventType.RIGHT_DRAG, Cesium.CameraEventType.WHEEL],
    rotateEventTypes: Cesium.CameraEventType.LEFT_DRAG,
    tiltEventTypes: [Cesium.CameraEventType.MIDDLE_DRAG],
    lookEventTypes: undefined,
    ...overrides,
  };
}

test('wheel zooms; left orbits; right tilts; middle is unused', () => {
  const events = globePointerCameraEvents(Cesium);
  assert.deepEqual(events.zoomEventTypes, [
    Cesium.CameraEventType.WHEEL,
    Cesium.CameraEventType.PINCH,
  ]);
  assert.equal(events.rotateEventTypes, Cesium.CameraEventType.LEFT_DRAG);
  assert.deepEqual(events.tiltEventTypes, [
    Cesium.CameraEventType.RIGHT_DRAG,
    Cesium.CameraEventType.PINCH,
  ]);
  assert.ok(
    ![].concat(events.zoomEventTypes, events.rotateEventTypes, events.tiltEventTypes)
      .includes(Cesium.CameraEventType.MIDDLE_DRAG),
    'middle-drag must not remain a camera binding',
  );
  assert.ok(
    !events.zoomEventTypes.includes(Cesium.CameraEventType.RIGHT_DRAG),
    'right-drag must not zoom',
  );
});

test('left+right button chord is detected from the buttons bitfield', () => {
  assert.equal(isLeftRightChord(0), false);
  assert.equal(isLeftRightChord(1), false);
  assert.equal(isLeftRightChord(2), false);
  assert.equal(isLeftRightChord(4), false);
  assert.equal(isLeftRightChord(3), true);
  assert.equal(isLeftRightChord(1 | 2 | 4), true);
});

test('a left+right chord looks in place instead of rotating and tilting together', () => {
  const controller = mockController();
  applyChordLookMode(controller, true, Cesium);
  assert.equal(controller.enableRotate, false);
  assert.equal(controller.enableTilt, false);
  assert.equal(controller.enableLook, true);
  assert.equal(controller.lookEventTypes, Cesium.CameraEventType.LEFT_DRAG);

  applyChordLookMode(controller, false, Cesium);
  assert.equal(controller.enableRotate, true);
  assert.equal(controller.enableTilt, true);
  assert.deepEqual(
    controller.lookEventTypes,
    globePointerCameraEvents(Cesium).lookEventTypes,
  );
});

test('installing the scheme writes event types onto the live controller', () => {
  const controller = mockController();
  const listeners = [];
  const canvas = {
    addEventListener(type, handler) { listeners.push([type, handler]); },
    removeEventListener() {},
  };
  const dispose = applyPointerCameraControls({
    scene: { screenSpaceCameraController: controller, canvas },
  }, Cesium);
  assert.deepEqual(controller.zoomEventTypes, globePointerCameraEvents(Cesium).zoomEventTypes);
  assert.equal(controller.rotateEventTypes, Cesium.CameraEventType.LEFT_DRAG);
  assert.deepEqual(controller.tiltEventTypes, globePointerCameraEvents(Cesium).tiltEventTypes);
  assert.ok(listeners.some(([type]) => type === 'pointerdown'));
  assert.ok(listeners.some(([type]) => type === 'contextmenu'));

  const pointer = listeners.find(([type]) => type === 'pointerdown')[1];
  pointer({ pointerType: 'mouse', buttons: 3 });
  assert.equal(controller.lookEventTypes, Cesium.CameraEventType.LEFT_DRAG);
  pointer({ pointerType: 'mouse', buttons: 1 });
  assert.equal(controller.enableRotate, true);

  dispose();
});

test('bootstrap installs pointer camera controls after the Cesium viewer exists', () => {
  const viewer = main.indexOf("new Cesium.Viewer('cesiumContainer'");
  const install = main.indexOf('applyPointerCameraControls(viewer)');
  assert.ok(viewer >= 0, 'viewer construction is missing');
  assert.ok(install >= 0, 'applyPointerCameraControls(viewer) is missing');
  assert.ok(install > viewer, 'controls must be installed on the created viewer');
});
