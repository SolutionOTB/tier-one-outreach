// Tests the Center of influence changes in the built index.html (kit/kit-overrides.js):
// one click opens a contact, checkboxes pick a group, Select all follows the search,
// unsubscribed or email less contacts cannot be picked, and the pick is capped at 20.
// Run with: npm test  (from app/)
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.resolve(__dirname, '..', '..', 'index.html'), 'utf8');
const kit = html.match(/<script id="kit">([\s\S]*?)<\/script>/)[1];
const start = kit.indexOf(' /* ---------- center of influence: one click opens a contact');
const end = kit.indexOf(' window.BulkSel=');
if (start < 0 || end < 0) throw new Error('center of influence markers not found in the built file');
const endLine = kit.indexOf('\n', kit.indexOf('clear:clearSel};', end)) + 1;
const block = kit.slice(start, endLine);

function check(label, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra ? '  ' + extra : ''));
  if (!cond) process.exitCode = 1;
}

function makeContacts(n) {
  const list = [];
  for (let i = 0; i < n; i++) list.push({ id: 'c' + i, first: 'Person' + i, last: 'Test', email: 'p' + i + '@example.com', phone: '', rel: i % 2 ? 'Neighbor' : 'Friend', social: [] });
  return list;
}

function run(contacts, suppressedEmails) {
  const dom = new JSDOM('<!doctype html><html><head></head><body>' +
    '<div class="wrap scr on" id="st4"><div><p class="lead">Double click anyone to send them approved outreach by email, text or post.</p></div><div class="hr"></div><div class="coi" id="coi"></div></div>' +
    '</body></html>', { pretendToBeVisual: true });
  const win = dom.window, doc = win.document;
  const opened = [];
  const st = { contacts };
  // the studio's renderCOI, reduced to the markup the override touches
  function renderCOI() {
    const el = doc.getElementById('coi'); el.innerHTML = '';
    st.contacts.forEach(function (c, i) {
      const d = doc.createElement('div'); d.className = 'pcard';
      d.ondblclick = function () { opened.push('dbl ' + i); };
      d.innerHTML = '<div class="h"><div class="a">AB</div><div><div class="nm">' + c.first + ' ' + c.last + '</div><div class="rel">' + (c.rel || 'Contact') + '</div></div></div><div class="ic"></div><div class="help" style="margin-top:10px">Double click to send</div>';
      el.appendChild(d);
    });
  }
  win.renderCOI = renderCOI;
  const supp = new Set((suppressedEmails || []).map(e => e.toLowerCase()));
  win.Suppression = { blocked: c => supp.has(String(c.email || '').trim().toLowerCase()), pending: () => false, check: () => Promise.resolve() };
  const sandbox = {
    window: win, document: doc, st,
    $: id => doc.getElementById(id),
    esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    openDrawer: i => opened.push('open ' + i),
    CustomEvent: win.CustomEvent
  };
  const names = Object.keys(sandbox);
  new Function(...names, '"use strict";' + block)(...names.map(n => sandbox[n]));
  win.renderCOI();
  const card = i => doc.querySelectorAll('#coi .pcard')[i];
  const box = i => card(i).querySelector('.coick input');
  const click = el => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  return { win, doc, opened, st, card, box, click };
}

// single click and checkbox isolation
let t = run(makeContacts(3));
t.click(t.card(1));
check('one click on a card opens that contact', t.opened.join(',') === 'open 1', t.opened.join(','));
t.card(1).dispatchEvent(new t.win.MouseEvent('dblclick', { bubbles: true }));
check('the old double click handler is gone', !t.opened.some(o => o.indexOf('dbl') === 0));
t.opened.length = 0;
t.click(t.box(0));
check('clicking a checkbox checks it', t.box(0).checked === true);
check('clicking a checkbox does not open the drawer', t.opened.length === 0, t.opened.join(','));
check('the count shows what is selected', t.doc.getElementById('coicount').textContent === '1 selected');
check('the card shows it is picked', t.card(0).classList.contains('picked'));
check('the card help and the lead no longer say double click',
  t.card(0).querySelector('.help').textContent === 'Click or tap to send' && !/double click/i.test(t.doc.querySelector('#st4 .lead').textContent));
check('Enter on a focused card opens it', (t.card(2).dispatchEvent(new t.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })), t.opened.join(',') === 'open 2'), t.opened.join(','));

// blocked contacts
const mixed = makeContacts(4);
mixed[1].unsubscribed_at = '2026-09-18T12:00:00Z';
mixed[2].email = '';
t = run(mixed, ['P3@Example.com']);
check('a per contact unsubscribe cannot be checked', t.box(1).disabled === true && /Unsubscribed from email/.test(t.card(1).textContent));
check('a contact with no email cannot be checked', t.box(2).disabled === true && /No email address/.test(t.card(2).textContent));
check('a generic unsubscribe cannot be checked', t.box(3).disabled === true);
t.click(t.doc.getElementById('coiall'));
check('Select all skips every blocked contact', t.box(0).checked && !t.box(1).checked && !t.box(2).checked && !t.box(3).checked && t.doc.getElementById('coicount').textContent === '1 selected');
t.click(t.card(1));
check('a blocked contact still opens with one click', t.opened.join(',') === 'open 1');

// Select all follows the search
t = run(makeContacts(6));
const q = t.doc.getElementById('coiq');
q.value = 'neighbor'; q.dispatchEvent(new t.win.Event('input'));
const shown = Array.from(t.doc.querySelectorAll('#coi .pcard')).filter(d => d.style.display !== 'none').length;
check('search hides the cards that do not match', shown === 3, shown + ' shown');
t.click(t.doc.getElementById('coiall'));
check('Select all picks only the matching contacts', t.doc.getElementById('coicount').textContent === '3 selected' && t.box(1).checked && !t.box(0).checked);
q.value = ''; q.dispatchEvent(new t.win.Event('input'));
check('clearing the search keeps the picks', t.doc.getElementById('coicount').textContent === '3 selected');
check('Select all shows a partial state when only some visible cards are picked', t.doc.getElementById('coiall').indeterminate === true);
q.value = 'zzz'; q.dispatchEvent(new t.win.Event('input'));
check('a search with no match says so', t.doc.getElementById('coinone').textContent === 'No contact matches that search.');

// the cap
t = run(makeContacts(25));
t.click(t.doc.getElementById('coiall'));
check('Select all stops at 20', t.doc.getElementById('coicount').textContent === '20 selected');
check('it says how many were left out', t.doc.getElementById('coimsg').textContent === 'You can select up to 20 contacts at a time. 5 more were not selected.', t.doc.getElementById('coimsg').textContent);
t.click(t.box(22));
check('a 21st check is refused', t.box(22).checked === false && t.doc.getElementById('coicount').textContent === '20 selected');
check('with a plain message by Select all', t.doc.getElementById('coimsg').textContent === 'You can select up to 20 contacts at a time. Uncheck one to add another.');
t.click(t.box(0));
check('unchecking one clears the message', t.doc.getElementById('coicount').textContent === '19 selected' && t.doc.getElementById('coimsg').textContent === '');
t.click(t.box(22));
check('and a new check is accepted again', t.box(22).checked === true && t.doc.getElementById('coicount').textContent === '20 selected');
t.click(t.doc.getElementById('coiclear'));
check('Clear empties the selection', t.doc.getElementById('coicount').textContent === '' && !t.box(22).checked);

// a re-render keeps the picks
t = run(makeContacts(3));
t.click(t.box(2));
t.win.renderCOI();
check('picks survive a re-render of the cards', t.box(2).checked === true && t.doc.querySelectorAll('#coisel').length === 1);

// what Step 2 reads
check('BulkSel hands back the picked contacts', t.win.BulkSel.contacts().map(c => c.id).join(',') === 'c2' && t.win.BulkSel.cap === 20);

// copy rules: every sentence this block can put on screen
const uiCopy = ['Search your contacts', 'Select all', 'selected', 'Clear', 'No email address', 'Unsubscribed from email',
  'No contact matches that search.', 'Click or tap to send', 'You can select up to ', ' contacts at a time. Uncheck one to add another.',
  ' more ', ' not selected.', 'Click or tap anyone to send them approved outreach by email, text or post. Check the box next to a name to pick people for a group email.'];
check('every UI string is in the block and none has an exclamation point or a hyphen',
  uiCopy.every(u => block.indexOf(u) >= 0) && uiCopy.every(u => u.indexOf('!') < 0 && !/\w-\w/.test(u)));
