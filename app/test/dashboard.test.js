// Tests the dashboard in the built index.html (kit/cloud.js): the associate's own numbers and the
// admin table, both against a fake Supabase client. Run with: npm test  (from app/)
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.resolve(__dirname, '..', '..', 'index.html'), 'utf8');
const kit = html.match(/<script id="kit">([\s\S]*?)<\/script>/)[1];
const start = kit.indexOf(' /* ---------- dashboard ---------- */');
const end = kit.indexOf(' /* ---------- version gate ---------- */');
if (start < 0 || end < 0) throw new Error('dashboard markers not found in the built file');
const block = kit.slice(start, end);

function check(label, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra ? '  ' + extra : ''));
  if (!cond) process.exitCode = 1;
}

const day = (n) => new Date(Date.now() - n * 86400000).toISOString();
const SENDS = [
  { channel: 'Email', action: 'gmail', piece: 'Some news', sent_at: day(0) },
  { channel: 'Email bulk', action: 'mail', piece: 'Some news', sent_at: day(0) },
  { channel: 'Email bulk', action: 'mail', piece: 'Some news', sent_at: day(1) },
  { channel: 'Text', action: 'sms', piece: 'Quick one', sent_at: day(2) },
  { channel: 'Social', action: 'fb', piece: 'Facebook post', sent_at: day(40) }
];
const SCANS = [{ marker: 'QR-chris-link', scanned_at: day(1) }, { marker: 'QR-chris-flier', scanned_at: day(3) }];
const ADMIN = [
  { agent_id: 'a1', name: 'Chris Heinsen', email: 'chris@solutionotb.com', slug: 'chris', contacts: 5, pieces: 22, email_pieces: 19, text_pieces: 2, social_pieces: 1, scans: 2, unsubscribed: 1, last_activity: day(0) },
  { agent_id: 'a2', name: 'Pat Associate', email: 'pat@example.com', slug: 'pat', contacts: 12, pieces: 3, email_pieces: 3, text_pieces: 0, social_pieces: 0, scans: 0, unsubscribed: 0, last_activity: day(6) }
];

function run(opts) {
  opts = opts || {};
  const dom = new JSDOM('<!doctype html><html><head></head><body>' +
    '<div class="tabs" id="tabnav"><button class="tb on" data-t="outreach">Outreach</button><button class="tb" data-t="share">Share</button><button class="tb" data-t="account">Account</button></div>' +
    '<div class="wrap" id="tabShare" style="display:none"></div><div class="wrap" id="tabAccount" style="display:none"></div>' +
    '</body></html>', { pretendToBeVisual: true });
  const win = dom.window, doc = win.document;
  const calls = [];
  const q = (table) => ({
    select() { return this; }, eq() { return this; }, order() { return this; },
    limit() { calls.push(table); return Promise.resolve({ data: table === 'to_sends' ? SENDS : SCANS, error: null }); }
  });
  const sb = {
    from: (t) => q(t),
    rpc: (name) => { calls.push('rpc:' + name); return Promise.resolve(opts.admin ? { data: ADMIN, error: null } : { data: [], error: { message: 'not admin' } }); }
  };
  const st = { contacts: [{ email: 'a@x.com' }, { email: 'b@x.com', unsubscribed_at: day(2) }, { email: 'c@x.com' }] };
  const sandbox = {
    window: win, document: doc, st, sb,
    user: opts.signedIn === false ? null : { id: 'a1' },
    $: (id) => doc.getElementById(id),
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    toast: () => {}
  };
  win.showTab = (t) => { calls.push('showTab:' + t); };
  const names = Object.keys(sandbox);
  new Function(...names, '"use strict";' + block)(...names.map(n => sandbox[n]));
  return { win, doc, calls };
}
const tick = (ms) => new Promise(r => setTimeout(r, ms || 60));

(async () => {
  // the tab itself
  let t = run({});
  t.win.showTab('dash');
  await tick(120);
  const tab = t.doc.querySelector('#tabnav [data-t="dash"]');
  check('a Dashboard tab is added before Account', !!tab && tab.textContent === 'Dashboard' && tab.nextElementSibling.getAttribute('data-t') === 'account');
  check('choosing it shows the dashboard and marks the tab', t.doc.getElementById('tabDash').style.display === 'block' && tab.className.indexOf('on') >= 0);
  check('other tabs are hidden', t.doc.getElementById('tabAccount').style.display === 'none');

  const txt = t.doc.getElementById('tabDash').textContent;
  const tiles = [...t.doc.querySelectorAll('#tabDash .dtile')].map(d => d.querySelector('.v').textContent + ' ' + d.querySelector('.k').textContent);
  check('the four tiles count contacts, pieces, scans and unsubscribes', tiles.join(' | ') === '3 Contacts | 5 Pieces started | 2 QR scans | 1 Unsubscribed', tiles.join(' | '));
  check('it asks the database for this agent only', t.calls.indexOf('to_sends') >= 0 && t.calls.indexOf('to_scans') >= 0);
  check('group email is named in plain words', /Group email/.test(txt) && !/Email bulk/.test(txt));
  check('channels are broken out', /By channel/.test(txt) && /Text/.test(txt) && /Social/.test(txt));
  check('pieces are broken out by name', /By piece/.test(txt) && /Some news/.test(txt));
  const bars = [...t.doc.querySelectorAll('#tabDash .brow')].map(b => b.querySelector('.lbl').textContent + '=' + b.querySelector('.n').textContent);
  check('the counts per channel are right', bars.indexOf('Group email=2') >= 0 && bars.indexOf('Email=1') >= 0 && bars.indexOf('Text=1') >= 0, bars.join(','));
  check('the thirty day chart has a bar per day', t.doc.querySelectorAll('#tabDash .days')[0].children.length === 30);
  check('it says plainly that a piece is not a confirmed send', /cannot see whether you pressed send/.test(txt));
  check('no exclamation points or hyphens between words', txt.indexOf('!') < 0 && !/[A-Za-z]-[A-Za-z]/.test(txt.replace(/Z\d+[A-Z0-9-]*/g, '')));

  // a normal associate gets no admin section
  check('an associate sees no admin table', !/All associates/.test(txt), 'leaked');

  // an admin does
  t = run({ admin: true });
  t.win.showTab('dash');
  await tick(150);
  const atxt = t.doc.getElementById('tabDash').textContent;
  check('an admin also sees every associate', /All associates/.test(atxt) && /Pat Associate/.test(atxt));
  const rows = [...t.doc.querySelectorAll('#dash_admin tbody tr')];
  check('one row per associate', rows.length === 2);
  check('with their counts', rows[0].textContent.indexOf('22') >= 0 && rows[1].textContent.indexOf('12') >= 0);
  const adminTiles = [...t.doc.querySelectorAll('#dash_admin .dtile')].map(d => d.querySelector('.v').textContent);
  check('and totals across everyone', adminTiles.join(',') === '2,17,25,2', adminTiles.join(','));
  check('the admin table can scroll sideways rather than overflow', !!t.doc.querySelector('#dash_admin .tw'));

  // signed out
  t = run({ signedIn: false });
  t.win.showTab('dash');
  await tick(80);
  check('signed out it asks you to sign in', /Sign in to see your numbers/.test(t.doc.getElementById('tabDash').textContent));
  process.exit(process.exitCode || 0);
})();
