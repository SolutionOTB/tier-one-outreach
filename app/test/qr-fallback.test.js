// Tests the QR scanner in the built index.html: when BarcodeDetector rejects, the scanner
// switches to jsQR instead of sitting there doing nothing.
// Run with: npm test  (from app/)
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const INDEX = path.resolve(__dirname, '..', '..', 'index.html');
const html = fs.readFileSync(INDEX, 'utf8');
const kit = html.match(/<script id="kit">([\s\S]*?)<\/script>/)[1];

const start = kit.indexOf(' var scan={stream:null,timer:null};');
const end = kit.indexOf(' function addrBox()');
if (start < 0 || end < 0) throw new Error('scanner markers not found in the built file');
const block = kit.slice(start, end);

function check(label, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra ? '  ' + extra : ''));
  if (!cond) process.exitCode = 1;
}

// detectMode: 'reject' makes BarcodeDetector.detect fail, 'missing' removes it entirely
function run(detectMode, opts) {
  opts = opts || {};
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { pretendToBeVisual: true });
  const win = dom.window;
  const log = [];

  const track = { stop: () => log.push('track stopped') };
  win.navigator.mediaDevices = { getUserMedia: () => Promise.resolve({ getTracks: () => [track] }) };

  if (detectMode !== 'missing') {
    win.BarcodeDetector = function () {
      this.detect = () => detectMode === 'reject'
        ? Promise.reject(new Error('NotSupportedError'))
        : Promise.resolve([{ rawValue: 'https://buy.aflac.com/?externalReferenceId=CH123' }]);
    };
  }

  // stub the canvas work jsQR needs
  win.HTMLCanvasElement.prototype.getContext = () => ({
    drawImage: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })
  });
  win.jsQR = () => { log.push('jsQR ran'); return opts.jsqrFinds ? { data: 'https://buy.aflac.com/?externalReferenceId=CH123' } : null; };

  const sandbox = {
    window: win, document: win.document, navigator: win.navigator,
    $: (id) => {
      if (id === 'kitvid') { // a video element jsdom will not play
        let v = win.document.getElementById('kitvid');
        if (v) { Object.defineProperty(v, 'readyState', { value: 4, configurable: true }); v.play = () => Promise.resolve(); }
        return v;
      }
      return win.document.getElementById(id);
    },
    kitSetLink: (u) => log.push('link saved ' + u),
    esc: (s) => String(s == null ? '' : s)
  };
  const names = Object.keys(sandbox);
  const fn = new Function(...names, '"use strict";' + block + '; return {kitScan: window.kitScan, kitScanStop: window.kitScanStop, scan: scan};');
  const api = fn(...names.map(n => sandbox[n]));
  return { win, api, log, msg: () => (win.document.getElementById('kitscanmsg') || {}).textContent };
}

const wait = (ms) => new Promise(res => setTimeout(res, ms));

(async () => {
  // BarcodeDetector rejects: the scanner has to fall back to jsQR
  let r = run('reject', { jsqrFinds: true });
  r.api.kitScan();
  await wait(1200);
  check('jsQR takes over when BarcodeDetector rejects', r.log.some(l => l === 'jsQR ran'), r.log.join(' | '));
  check('the link found by jsQR is saved', r.log.some(l => l.indexOf('link saved https://buy.aflac.com/') === 0));
  check('the camera is released once a code is found', r.log.some(l => l === 'track stopped'));
  r.api.kitScanStop();

  // no BarcodeDetector at all, which is iOS
  r = run('missing', { jsqrFinds: true });
  r.api.kitScan();
  await wait(1200);
  check('with no BarcodeDetector the scanner goes straight to jsQR', r.log.some(l => l === 'jsQR ran'));
  r.api.kitScanStop();

  // BarcodeDetector works: jsQR is never loaded
  r = run('ok');
  r.api.kitScan();
  await wait(1200);
  check('when BarcodeDetector works jsQR is never used', !r.log.some(l => l === 'jsQR ran') && r.log.some(l => l.indexOf('link saved') === 0), r.log.join(' | '));
  r.api.kitScanStop();

  // cancelling before the rejection lands must not start a second loop
  r = run('reject', { jsqrFinds: false });
  r.api.kitScan();
  await wait(400);
  r.api.kitScanStop();
  await wait(800);
  check('cancelling stops everything, no fallback loop is left running', r.api.scan.timer === null && r.api.scan.stream === null);

  // the scanners run on setInterval, so close the last one out and let node exit
  r.api.kitScanStop();
  process.exit(process.exitCode || 0);
})();
