// Tests the generic unsubscribe list:
//  * the Suppression module in the built index.html (kit/cloud.js) against a fake Supabase client
//  * the drawer's email branch checks it before rendering an email piece
//  * unsubscribe.html at the repo root posts the address and shows the confirmation
// Run with: npm test  (from app/)
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const kit = html.match(/<script id="kit">([\s\S]*?)<\/script>/)[1];

function check(label, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra ? '  ' + extra : ''));
  if (!cond) process.exitCode = 1;
}

const start = kit.indexOf(' /* ---------- generic unsubscribe list ---------- */');
const end = kit.indexOf(' /* ---------- send log ---------- */');
if (start < 0 || end < 0) throw new Error('suppression markers not found in the built file');
const block = kit.slice(start, end);

function run(rpcImpl, cached) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://outreach.benefitsotb.com/' });
  const win = dom.window;
  const calls = [];
  if (cached) win.localStorage.setItem('cl_supp_u1', JSON.stringify(cached));
  const sb = { rpc: (name, args) => { calls.push([name, args]); return rpcImpl(args); } };
  const fn = new Function('window', 'localStorage', 'sb', 'user', '"use strict";' + block +
    '; return {S: window.Suppression, load: suppLoadCache};');
  const api = fn(win, win.localStorage, sb, { id: 'u1' });
  return { api, calls, win };
}

(async () => {
  // online: the server says one of two contacts is suppressed
  let r = run(({ emails }) => Promise.resolve({ data: emails.filter(e => e === 'gone@example.com'), error: null }));
  const gone = { first: 'Gone', email: '  Gone@Example.com ' };
  const here = { first: 'Here', email: 'here@example.com' };
  const noEmail = { first: 'Phone only', email: '' };
  check('a contact not yet checked is pending', r.api.S.pending(gone) === true);
  check('a contact with no email is never pending', r.api.S.pending(noEmail) === false);
  await r.api.S.check([gone, here, noEmail]);
  check('one call for the whole list, emails trimmed and lowercased', r.calls.length === 1 && JSON.stringify(r.calls[0]) === JSON.stringify(['to_suppressed_among', { emails: ['gone@example.com', 'here@example.com'] }]), JSON.stringify(r.calls));
  check('the suppressed contact is blocked, whatever the case of the address', r.api.S.blocked(gone) === true);
  check('the other contact is not blocked', r.api.S.blocked(here) === false);
  check('nothing is pending right after a check', r.api.S.pending(gone) === false && r.api.S.pending(here) === false);
  check('the answer is cached for offline use', JSON.parse(r.win.localStorage.getItem('cl_supp_u1')).indexOf('gone@example.com') >= 0);

  // offline: the call fails, the cached answer still blocks
  r = run(() => Promise.reject(new Error('fetch failed')), ['gone@example.com']);
  r.api.load();
  await r.api.S.check([gone]);
  check('offline, a cached suppression still blocks', r.api.S.blocked(gone) === true);
  check('offline, the drawer does not wait forever', r.api.S.pending(gone) === false);

  // un-suppressed server side: a fresh check clears the cached flag
  r = run(() => Promise.resolve({ data: [], error: null }), ['gone@example.com']);
  r.api.load();
  await r.api.S.check([gone]);
  check('a fresh check clears a stale cached flag', r.api.S.blocked(gone) === false);

  // the drawer's email branch consults the list before it renders
  check('email pieces show the unsubscribe notice for a suppressed address',
    /if\(ch==="Email"\)\{var SP=window\.Suppression;if\(c&&\(c\.unsubscribed_at\|\|\(SP&&SP\.blocked\(c\)\)\)\)\{return out\+'<div class="card2" style="padding:16px"><b>'\+esc\(c\.first\|\|"This contact"\)\+' unsubscribed from email\.<\/b> Text and social pieces are still available\.<\/div><\/div>'\}/.test(kit));
  check('email pieces wait for the check when it has not run yet',
    /if\(c&&SP&&SP\.pending\(c\)\)\{SP\.check\(\[c\]\)\.then\(/.test(kit) && /Checking this address/.test(kit));

  // unsubscribe.html
  const page = fs.readFileSync(path.join(ROOT, 'unsubscribe.html'), 'utf8');
  const posted = [];
  const dom = new JSDOM(page, {
    url: 'https://outreach.benefitsotb.com/unsubscribe.html?e=Someone%40Example.com',
    runScripts: 'dangerously',
    beforeParse(w) {
      w.fetch = (url, opts) => { posted.push([url, opts.method, opts.body]); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }); };
    }
  });
  const w = dom.window, d = w.document;
  check('the page prefills the address from ?e=', d.getElementById('e').value === 'Someone@Example.com');
  check('the address is taken out of the address bar', w.location.search === '');
  d.getElementById('f').dispatchEvent(new w.Event('submit', { cancelable: true }));
  await new Promise(res => setTimeout(res, 50));
  check('confirm posts the lowercased address to unsub-email', posted.length === 1 && /unsub-email$/.test(posted[0][0]) && posted[0][1] === 'POST' && posted[0][2] === JSON.stringify({ email: 'someone@example.com' }), JSON.stringify(posted));
  check('the confirmation replaces the form', d.getElementById('ask').hidden === true && d.getElementById('done').hidden === false && d.getElementById('d').textContent === 'someone@example.com');

  // no ?e=, as in a bulk email: the person types the address
  const dom2 = new JSDOM(page, { url: 'https://outreach.benefitsotb.com/unsubscribe.html', runScripts: 'dangerously',
    beforeParse(w2) { w2.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }); } });
  const d2 = dom2.window.document;
  check('without ?e= the field starts empty', d2.getElementById('e').value === '');
  d2.getElementById('f').dispatchEvent(new dom2.window.Event('submit', { cancelable: true }));
  check('an empty address is refused with a plain message', d2.getElementById('m').textContent === 'Enter a valid email address.');

  const vb = new JSDOM(page).window.document.body; vb.querySelectorAll('script').forEach(x => x.remove());
  const visible = vb.textContent;
  const scriptStrings = (page.match(/<script>([\s\S]*?)<\/script>/)[1].match(/"[^"]*"/g) || []).join(' ');
  check('no exclamation points in any text the page can show', visible.indexOf('!') < 0 && scriptStrings.indexOf('!') < 0);
})();
