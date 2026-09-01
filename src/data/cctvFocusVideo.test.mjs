import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  officialTflVideoUrl,
  registeredFocusFeedType,
  registeredFocusMediaUrl,
} from '../../vite.config.js';
import { projectionFeedType, isHybridFocusClip } from './cctv.js';

const TFL_ORIGIN = 'https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/';
const TFL_MP4 = `${TFL_ORIGIN}JamCams/00001.0123.mp4`;
const TFL_JPG = `${TFL_ORIGIN}JamCams/00001.0123.jpg`;

test('official TfL video URLs must be https MP4s on the JamCam bucket', () => {
  assert.equal(officialTflVideoUrl(TFL_MP4), TFL_MP4);
  assert.equal(officialTflVideoUrl(TFL_JPG), '');
  assert.equal(officialTflVideoUrl(`${TFL_JPG}?x=.mp4`), '');
  assert.equal(officialTflVideoUrl('https://example.com/cam.mp4'), '');
  assert.equal(officialTflVideoUrl('http://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/x.mp4'), '');
  assert.equal(officialTflVideoUrl(''), '');
});

test('focused media proxy uses the registered video URL, not a client URL', () => {
  assert.equal(registeredFocusMediaUrl({
    feedType: 'image',
    url: TFL_JPG,
    videoUrl: TFL_MP4,
    videoFeedType: 'mp4',
  }), TFL_MP4);
  assert.equal(registeredFocusMediaUrl({
    feedType: 'image',
    url: TFL_JPG,
  }), '');
  assert.equal(registeredFocusMediaUrl({
    feedType: 'mp4',
    url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  }), 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4');
});

test('focused feed type keeps ambient stills while playing a focus clip', () => {
  assert.equal(registeredFocusFeedType({
    feedType: 'image',
    videoFeedType: 'mp4',
  }), 'mp4');
  assert.equal(registeredFocusFeedType({
    feedType: 'image',
  }), 'image');
  assert.equal(registeredFocusFeedType({
    feedType: 'mp4',
  }), 'mp4');
});

test('monitor-plane feed type follows videoFeedType without changing catalog stills', () => {
  assert.equal(projectionFeedType({ feedType: 'image', videoFeedType: 'mp4' }), 'mp4');
  assert.equal(projectionFeedType({ feedType: 'image' }), 'image');
  assert.equal(projectionFeedType({ feedType: 'webm' }), 'webm');
});

test('TfL catalog keeps stills for cards and pins official MP4s for the focused plane', () => {
  const viteSrc = fs.readFileSync(new URL('../../vite.config.js', import.meta.url), 'utf8');
  const cctvSrc = fs.readFileSync(fileURLToPath(new URL('./cctv.js', import.meta.url)), 'utf8');

  assert.match(viteSrc, /feedType: 'image', \/\/ ambient cards stay stills/);
  assert.match(viteSrc, /videoUrl: officialTflVideoUrl\(props\.videoUrl\)|const videoUrl = officialTflVideoUrl\(props\.videoUrl\)/);
  assert.match(viteSrc, /videoFeedType: videoUrl \? 'mp4' : ''/);
  assert.match(viteSrc, /videoFeedType: isVideoFeedType\(normalizeFeedType\(source\.videoFeedType\)\)/);
  assert.match(viteSrc, /fovDeg: 72/);
  assert.doesNotMatch(
    viteSrc.slice(viteSrc.indexOf("if (url.pathname === '/sources')"), viteSrc.indexOf("if (url.pathname === '/health')")),
    /videoUrl: source/,
  );

  assert.match(cctvSrc, /const feedType = projectionFeedType\(record\.camera\)/);
  assert.match(cctvSrc, /isVideo: isVideoFeedType\(normalizeFeedType\(record\.camera\.feedType\)\)/);
  assert.match(cctvSrc, /video\.loop = !hybridClip/);
  assert.match(cctvSrc, /void snapActiveCameraToRoad\(record\)/);
  assert.match(cctvSrc, /clamp\(safeNumber\(source\.rangeM, seed\?\.rangeM \?\? 700\), 120, 2200\)/);
});

test('TfL stills-plus-clip cameras are hybrid focus feeds, demo mp4 catalogs are not', () => {
  assert.equal(isHybridFocusClip({ feedType: 'image', videoFeedType: 'mp4' }), true);
  assert.equal(isHybridFocusClip({ feedType: 'mp4' }), false);
  assert.equal(isHybridFocusClip({ feedType: 'image' }), false);
});
