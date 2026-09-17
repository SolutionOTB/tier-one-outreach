// Tests the app shell behaviour that kit/cloud.js adds to the repo root index.html:
// web links open in the in app browser, mail and messaging links are left to the phone,
// and the sign in screen is code first inside the app.
// Run with: npm test  (from app/)
// It runs the real code in jsdom against a fake native Capacitor runtime. No phone needed.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const INDEX = path.resolve(__dirname, '..', '..', 'index.html');
const html = fs.readFileSync(INDEX, 'utf8');
const kit = html.match(/<script id="kit">([\s\S]*?)<\/script>/)[1];

const linksStart = kit.indexOf(' /* ---------- links inside the app shell ---------- */');
const linksEnd = kit.indexOf(' /* ---------- account tab ---------- */');
const bridgeStart = kit.indexOf(' /* ---------- contacts bridge: one interface, three ways in ---------- */');
if (linksStart < 0 || linksEnd < 0 || bridgeStart < 0) throw new Error('markers not found in the built file');
// capPlugin lives in the contacts bridge, so the links block needs it too
const block = kit.slice(bridgeStart, linksEnd);

function run(native) {
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body><input id="file"><button id="pickBtn"></button><div id="toast"></div>' +
    '<a id="cta" href="https://buy.aflac.com/xyz">Apply</a>' +
    '<a id="unsub" href="https://pytbtuzeeguqgrhszmpr.functions.supabase.co/unsub?t=abc">Unsubscribe</a>' +
    '<a id="mail" href="mailto:someone@example.com?subject=hi">Email</a>' +
    '<a id="sms" href="sms:+15155550111?&body=hi">Text</a>' +
    '<a id="tel" href="tel:+15155550111">Call</a>' +
    '</body></html>', { pretendToBeVisual: true });
  const win = dom.window;
  const opened = [];
  const windowOpened = [];
  win.open = (u) => { windowOpened.push(u); };

  if (native) {
    win.Capacitor = {
      isNativePlatform: () => true,
      PluginHeaders: [{ name: 'Browser', methods: [{ name: 'open', rtype: 'promise' }, { name: 'close', rtype: 'promise' }] }],
      nativePromise: (plugin, method, opts) => { opened.push(plugin + '.' + method + ' ' + opts.url); return Promise.resolve(); }
    };
  }

  const sandbox = {
    window: win, document: win.document, navigator: win.navigator,
    st: { contacts: [] },
    toast: () => {},
    renderContacts: () => {},
    pickContacts: () => {},
    $: (id) => win.document.getElementById(id),
    esc: (s) => String(s == null ? '' : s)
  };
  const names = Object.keys(sandbox);
  const fn = new Function(...names, '"use strict";' + block + '; wireLinks(); return {openL: window.openL};');
  const api = fn(...names.map(n => sandbox[n]));
  return { win, opened, windowOpened, api };
}

function click(win, id) {
  const el = win.document.getElementById(id);
  const ev = new win.MouseEvent('click', { bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev.defaultPrevented;
}

function check(label, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra ? '  ' + extra : ''));
  if (!cond) process.exitCode = 1;
}

// native shell
let r = run(true);
check('buy.aflac.com opens in the in app browser', click(r.win, 'cta') && r.opened.some(o => o.indexOf('Browser.open https://buy.aflac.com/xyz') === 0), r.opened.join(' | '));
check('the Unsubscribe confirmation opens in the in app browser', click(r.win, 'unsub') && r.opened.some(o => o.indexOf('unsub?t=abc') > 0));
check('a mailto link is left to the phone', click(r.win, 'mail') === false && r.opened.length === 2);
check('an sms link is left to the phone', click(r.win, 'sms') === false && r.opened.length === 2);
check('a tel link is left to the phone', click(r.win, 'tel') === false && r.opened.length === 2);
r.api.openL('https://buy.aflac.com/from-openL');
check('openL routes through the in app browser', r.opened.some(o => o.indexOf('from-openL') > 0) && r.windowOpened.length === 0);

// plain web
r = run(false);
check('on the web a link is not intercepted', click(r.win, 'cta') === false && r.opened.length === 0);
r.api.openL('https://buy.aflac.com/web');
check('on the web openL still opens a tab', r.windowOpened.length === 1, r.windowOpened.join(','));

// sign in copy and input, read straight out of the built file
const cloud = kit.slice(kit.indexOf('/* Cloud layer'), bridgeStart);
check('the code field asks for a numeric keyboard', /id="cl_code"[^>]*inputmode="numeric"/.test(cloud) && /id="cl_code"[^>]*pattern="\[0-9\]\*"/.test(cloud));
check('the code field is focused after the code is sent', /show\("cl_step2"\);[\s\S]{0,160}c\.focus\(\)/.test(cloud));
check('six digits submit on their own, once per code', /v\.length===6&&v!==lastAuto/.test(cloud));
check('the magic link points at the website when running in the app', /emailRedirectTo:isApp\(\)\?SITE_URL/.test(cloud));
check('the app tells the associate to use the code', /isApp\(\)\?'Enter the 6 digit code from your email\. '/.test(cloud));
