// Tests the contacts bridge that kit/cloud.js injects into the repo root index.html.
// Run with: npm test  (from app/)
// It reads the built index.html, pulls out the bridge, and runs it in jsdom against a fake
// native Capacitor runtime. It does not need a phone, an emulator or a network.
// Runs the real block from the built index.html inside jsdom with a fake native Capacitor runtime.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const path = require('path');
const INDEX = path.resolve(__dirname, '..', '..', 'index.html');
const html = fs.readFileSync(INDEX, 'utf8');
const kit = html.match(/<script id="kit">([\s\S]*?)<\/script>/)[1];

// Cut the contacts bridge out of the kit block so the harness runs it with stubs
// instead of the whole cloud layer (which needs Supabase).
const start = kit.indexOf(' /* ---------- contacts bridge: one interface, three ways in ---------- */');
const end = kit.indexOf(' /* ---------- account tab ---------- */');
if (start < 0 || end < 0) throw new Error('bridge markers not found in the built file');
const block = kit.slice(start, end);

const CONTACTS = [
  { contactId: '1', name: { display: 'Dana Reyes', given: 'Dana', family: 'Reyes' },
    emails: [{ type: 'work', address: 'dana.work@example.com' }, { type: 'home', address: 'dana@example.com', isPrimary: true }],
    phones: [{ type: 'home', number: '515-555-0100' }, { type: 'mobile', number: '(515) 555-0111' }] },
  { contactId: '2', name: { display: 'Sam Patel', given: 'Sam', family: 'Patel' },
    emails: [], phones: [{ type: 'mobile', number: '515-555-0122' }] },
  { contactId: '3', name: { display: 'No Reach', given: 'No', family: 'Reach' }, emails: [], phones: [] },
  { contactId: '4', name: { display: 'Jordan Lee Smith' }, emails: [{ type: 'other', address: 'JORDAN@EXAMPLE.COM' }], phones: [] },
  { contactId: '5', name: { display: 'Dupe Phone', given: 'Dupe', family: 'Phone' },
    emails: [], phones: [{ type: 'mobile', number: '5155550111' }] }
];

function run(nativeMode) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><input id="file"><button id="pickBtn"></button><div id="toast"></div></body></html>', { pretendToBeVisual: true });
  const win = dom.window;
  const calls = [];

  if (nativeMode === 'headers') {
    win.Capacitor = {
      isNativePlatform: () => true,
      PluginHeaders: [{ name: 'Contacts', methods: [
        { name: 'checkPermissions', rtype: 'promise' },
        { name: 'requestPermissions', rtype: 'promise' },
        { name: 'getContacts', rtype: 'promise' }
      ] }],
      nativePromise: (plugin, method, opts) => {
        calls.push([plugin, method, JSON.stringify(opts)]);
        if (method === 'checkPermissions') return Promise.resolve({ contacts: 'prompt' });
        if (method === 'requestPermissions') return Promise.resolve({ contacts: 'granted' });
        if (method === 'getContacts') return Promise.resolve({ contacts: CONTACTS });
        return Promise.reject(new Error('unknown method ' + method));
      }
    };
  } else if (nativeMode === 'plugins') {
    win.Capacitor = {
      isNativePlatform: () => true,
      Plugins: { Contacts: {
        checkPermissions: () => Promise.resolve({ contacts: 'limited' }),
        getContacts: (o) => { calls.push(['Plugins', 'getContacts', JSON.stringify(o)]); return Promise.resolve({ contacts: CONTACTS }); }
      } }
    };
  } // else: plain web, no Capacitor

  const state = { contacts: [] };
  const toasts = [];
  const sandbox = {
    window: win, document: win.document, navigator: win.navigator,
    st: state,
    toast: (t) => toasts.push(t),
    renderContacts: () => { state.rendered = (state.rendered || 0) + 1; },
    pickContacts: () => { state.webPickerCalled = true; },
    $: (id) => win.document.getElementById(id),
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  };
  const names = Object.keys(sandbox);
  const fn = new Function(...names, '"use strict";' + block + '; return {Contacts: window.Contacts, wireBridge: wireBridge, ctAdd: window.ctAdd, ctSel: null, state: state, toasts: toasts};'
    .replace('state: state', 'state: st').replace('toasts: toasts', 'toasts: []'));
  const api = fn(...names.map(n => sandbox[n]));
  return { win, api, state, toasts, calls };
}

function check(label, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra ? '  ' + extra : ''));
  if (!cond) process.exitCode = 1;
}

(async () => {
  // 1. no Capacitor at all
  let r = run('web');
  check('web page with no picker reports file', r.api.Contacts.available() === 'file', r.api.Contacts.available());

  // 2. native via PluginHeaders and nativePromise (no bundler, no @capacitor/core)
  r = run('headers');
  check('PluginHeaders path reports native', r.api.Contacts.available() === 'native', r.api.Contacts.available());
  r.api.Contacts.pick();
  await new Promise(res => setTimeout(res, 50));
  check('permission is checked then requested', r.calls.map(c => c[1]).join(',').startsWith('checkPermissions,requestPermissions'), r.calls.map(c => c[1]).join(','));
  check('projection asks for name, emails and phones', r.calls.some(c => c[1] === 'getContacts' && /"name":true/.test(c[2]) && /"emails":true/.test(c[2]) && /"phones":true/.test(c[2])));
  const sheet = r.win.document.getElementById('ct');
  check('picker sheet is open', !!sheet && sheet.className.indexOf('on') >= 0);
  const boxes = sheet.querySelectorAll('#ct_list input[type=checkbox]');
  check('only reachable contacts are listed', boxes.length === 4, boxes.length + ' rows');
  const rowText = sheet.querySelector('#ct_list').textContent;
  check('mobile number wins over home', rowText.indexOf('(515) 555-0111') >= 0);
  check('primary email wins over work', rowText.indexOf('dana@example.com') >= 0 && rowText.indexOf('dana.work@example.com') < 0);
  check('search box and add button exist', !!sheet.querySelector('#ct_q') && !!sheet.querySelector('#ct_add'));
  check('add button starts disabled', sheet.querySelector('#ct_add').disabled === true);

  // select everyone and add
  boxes.forEach(b => { b.checked = true; b.dispatchEvent(new r.win.Event('change')); });
  check('add button enables and counts', sheet.querySelector('#ct_add').textContent === 'Add selected (4)', sheet.querySelector('#ct_add').textContent);
  r.win.ctAdd();
  const added = r.state.contacts;
  check('four picked, three added, one duplicate phone skipped', added.length === 3, JSON.stringify(added.map(c => c.first + ' ' + c.last)));
  check('shape matches the app', added.every(c => 'first' in c && 'last' in c && 'email' in c && 'phone' in c && c.rel === '' && Array.isArray(c.social) && c.notes === ''));
  check('display only name splits into first and last', added.some(c => c.first === 'Jordan' && c.last === 'Lee Smith'));
  check('renderContacts ran so the cloud sync fires', r.state.rendered >= 1);
  check('sheet closed after adding', sheet.className.indexOf('on') < 0);

  // 3. duplicate by email against an existing contact
  r = run('plugins');
  check('Capacitor.Plugins path reports native', r.api.Contacts.available() === 'native');
  r.state.contacts.push({ first: 'Jordan', last: 'Lee Smith', email: 'jordan@example.com', phone: '', rel: '', social: [], notes: '' });
  r.api.Contacts.pick();
  await new Promise(res => setTimeout(res, 50));
  const sheet2 = r.win.document.getElementById('ct');
  check('limited access is treated as granted', !!sheet2 && sheet2.className.indexOf('on') >= 0);
  sheet2.querySelectorAll('#ct_list input[type=checkbox]').forEach(b => { b.checked = true; b.dispatchEvent(new r.win.Event('change')); });
  r.win.ctAdd();
  check('email duplicate skipped case insensitively, phone duplicate skipped within the batch', r.state.contacts.length === 3, JSON.stringify(r.state.contacts.map(c => c.email || c.phone)));

  // 4. search filters
  r = run('headers');
  r.api.Contacts.pick();
  await new Promise(res => setTimeout(res, 50));
  const q = r.win.document.getElementById('ct_q');
  q.value = 'patel';
  q.dispatchEvent(new r.win.Event('input'));
  check('search filters the list', r.win.document.querySelectorAll('#ct_list input[type=checkbox]').length === 1);
})();
