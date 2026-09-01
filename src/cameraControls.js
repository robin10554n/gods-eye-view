import * as Cesium from 'cesium';

const LEFT_BUTTON = 1;
const RIGHT_BUTTON = 2;

/**
 * Globe pointer scheme that never requires a middle-button (scroll-wheel click).
 *
 * Scroll zooms. Left drag orbits. Right drag tilts. Left+right drag looks in
 * place. Pinch stays on zoom and tilt for trackpads and touch.
 *
 * @param {typeof Cesium} [CesiumNS=Cesium]
 * @returns {{
 *   zoomEventTypes: unknown,
 *   rotateEventTypes: unknown,
 *   tiltEventTypes: unknown,
 *   lookEventTypes: unknown,
 * }}
 */
export function globePointerCameraEvents(CesiumNS = Cesium) {
  return {
    zoomEventTypes: [
      CesiumNS.CameraEventType.WHEEL,
      CesiumNS.CameraEventType.PINCH,
    ],
    rotateEventTypes: CesiumNS.CameraEventType.LEFT_DRAG,
    tiltEventTypes: [
      CesiumNS.CameraEventType.RIGHT_DRAG,
      CesiumNS.CameraEventType.PINCH,
    ],
    lookEventTypes: {
      eventType: CesiumNS.CameraEventType.LEFT_DRAG,
      modifier: CesiumNS.KeyboardEventModifier.SHIFT,
    },
  };
}

/**
 * @param {number} buttons `MouseEvent.buttons` bitfield.
 * @returns {boolean}
 */
export function isLeftRightChord(buttons) {
  return (buttons & LEFT_BUTTON) !== 0 && (buttons & RIGHT_BUTTON) !== 0;
}

/**
 * While both mouse buttons are held, Cesium would otherwise rotate and tilt
 * at once. Switch that chord to look-in-place on the left drag instead.
 *
 * @param {Cesium.ScreenSpaceCameraController} controller
 * @param {boolean} bothDown
 * @param {typeof Cesium} [CesiumNS=Cesium]
 */
export function applyChordLookMode(controller, bothDown, CesiumNS = Cesium) {
  if (bothDown) {
    controller.enableRotate = false;
    controller.enableTilt = false;
    controller.enableLook = true;
    controller.lookEventTypes = CesiumNS.CameraEventType.LEFT_DRAG;
    return;
  }
  controller.enableRotate = true;
  controller.enableTilt = true;
  controller.lookEventTypes = globePointerCameraEvents(CesiumNS).lookEventTypes;
}

/**
 * Install the no-middle-button globe pointer scheme on a live viewer.
 *
 * @param {Cesium.Viewer} viewer
 * @param {typeof Cesium} [CesiumNS=Cesium]
 * @returns {() => void} Disposer.
 */
export function applyPointerCameraControls(viewer, CesiumNS = Cesium) {
  const controller = viewer?.scene?.screenSpaceCameraController;
  const canvas = viewer?.scene?.canvas;
  if (!controller || !canvas) return () => {};

  const events = globePointerCameraEvents(CesiumNS);
  controller.zoomEventTypes = events.zoomEventTypes;
  controller.rotateEventTypes = events.rotateEventTypes;
  controller.tiltEventTypes = events.tiltEventTypes;
  controller.lookEventTypes = events.lookEventTypes;

  let chordActive = false;
  const syncButtons = (buttons) => {
    const next = isLeftRightChord(buttons);
    if (next === chordActive) return;
    chordActive = next;
    applyChordLookMode(controller, chordActive, CesiumNS);
  };

  const onPointer = (event) => {
    if (event.pointerType === 'touch') return;
    syncButtons(event.buttons);
  };
  const onLost = () => syncButtons(0);
  const onContextMenu = (event) => event.preventDefault();
  const onMouseDown = (event) => {
    if (event.button === 1) event.preventDefault();
  };

  canvas.addEventListener('pointerdown', onPointer);
  canvas.addEventListener('pointerup', onPointer);
  canvas.addEventListener('pointermove', onPointer);
  canvas.addEventListener('pointercancel', onLost);
  canvas.addEventListener('lostpointercapture', onLost);
  canvas.addEventListener('contextmenu', onContextMenu);
  canvas.addEventListener('mousedown', onMouseDown);

  return () => {
    canvas.removeEventListener('pointerdown', onPointer);
    canvas.removeEventListener('pointerup', onPointer);
    canvas.removeEventListener('pointermove', onPointer);
    canvas.removeEventListener('pointercancel', onLost);
    canvas.removeEventListener('lostpointercapture', onLost);
    canvas.removeEventListener('contextmenu', onContextMenu);
    canvas.removeEventListener('mousedown', onMouseDown);
    applyChordLookMode(controller, false, CesiumNS);
  };
}
