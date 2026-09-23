// Tests the Library tab in the built index.html (kit/library.js) by running the whole page in jsdom:
// what it lists, the filters, the previews, the placeholder toggle, and the handoff to the send panel.
// Run with: npm test  (from app/)
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.resolve(__dirname, '..', '..', 'index.html'), 'utf8');

function check(label, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra ? '  ' + extra : ''));
  if (!cond) process.exitCode = 1;
}

function boot() {
  const copied = [];
  const dom = new JSDOM(html, { url: 'https://outreach.benefitsotb.com/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => null; w.open = () => null; } });
  const w = dom.window;
  w.__copy = (t) => copied.push(t);
  w.localStorage.setItem('kit_seen_sendhelp', '1');
  w.eval('loadSample(); login(); document.getElementById("tabnav").style.display="flex"; showTab("lib");');
  return { w, d: w.document, copied };
}
const tick = (ms) => new Promise(r => setTimeout(r, ms || 60));
const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

(async () => {
  const t = boot();
  await tick(300);

  // the tab and what it lists
  const tabs = [...t.d.querySelectorAll('#tabnav .tb')].map(b => b.textContent);
  check('Library is the first tab and all five fit', tabs.join(',') === 'Library,Outreach,Share,Numbers,Account', tabs.join(','));
  check('choosing it shows the library', t.d.getElementById('tabLib').style.display === 'block');
  const cards = [...t.d.querySelectorAll('#tabLib .lcard')];
  check('every piece in the kit is listed', cards.length === 13, cards.length + ' cards');
  const badges = cards.map(c => c.querySelector('.lbadge').textContent);
  check('eleven approved, two waiting on a number', badges.filter(b => b === 'Approved').length === 11 && badges.filter(b => /Awaiting/.test(b)).length === 2, badges.join(','));
  check('the strip counts them and gives the date', txt(t.d.querySelector('#tabLib .lstrip')).indexOf('11 approved pieces, expire Sep 27') === 0, txt(t.d.querySelector('#tabLib .lstrip')));
  check('approved cards carry the Z number and the expiry', /Z2600718, expires Sep 27/.test(txt(cards[0])));
  check('a pending card carries neither', !/Z26/.test(txt(cards.find(c => /Awaiting/.test(c.textContent)))));

  // filters
  t.w.libFilter('ch', 'social');
  await tick();
  let shown = [...t.d.querySelectorAll('#tabLib .lcard')];
  check('the Posts filter narrows the list to the four captions', shown.length === 4 && shown.every(c => /Facebook|Instagram/.test(c.textContent)), shown.length + '');
  t.w.libFilter('kit', 'cancer');
  await tick();
  check('the two filters combine', t.d.querySelectorAll('#tabLib .lcard').length === 2);
  check('filters are remembered on the device', t.w.localStorage.getItem('lib_f_ch') === 'social' && t.w.localStorage.getItem('lib_f_kit') === 'cancer');

  // social preview
  t.d.querySelector('#tabLib .lcard').click();
  await tick(200);
  const prev = t.d.getElementById('libprev');
  check('the preview opens', prev.classList.contains('on'));
  check('a post preview shows the stamped image and the caption below it', !!prev.querySelector('.fimg') && /cancer insurance coverage/.test(txt(prev.querySelector('.fcap'))));
  check('it says what gets filled in', /The contact first name, your name, your business mailing address, and your unique link/.test(txt(prev.querySelector('.facts'))));
  const acts = [...prev.querySelectorAll('.acts button')].map(b => b.textContent);
  check('a post offers send, copy, its own network, save and the share sheet', acts.join(',') === 'Send to a contact,Copy,Post to Facebook,Save image,Share another way', acts.join(','));
  t.w.libClose();
  check('Back closes the preview', !prev.classList.contains('on'));

  // email preview and the placeholder toggle
  t.w.libFilter('kit', 'all'); t.w.libFilter('ch', 'email');
  await tick();
  t.d.querySelector('#tabLib .lcard').click();
  await tick(250);
  check('an email preview renders the real email, not raw text', !!t.d.querySelector('#libprev .emlprev table'));
  check('the subject line sits above it', /Subject: Some news/.test(txt(t.d.querySelector('#libprev .fcap'))));
  check('the disclosure is intact in the preview', /This is a solicitation of insurance/.test(txt(t.d.querySelector('#libprev .emlprev'))));
  check('the sample is filled in by default', /Hi Sam,/.test(txt(t.d.querySelector('#libprev .emlprev'))) && t.d.getElementById('lp_toggle').textContent === 'Showing a filled in sample');
  t.w.libToggle();
  await tick(200);
  check('the toggle shows the placeholders instead', /Hi \[First name\],/.test(txt(t.d.querySelector('#libprev .emlprev'))) && t.d.getElementById('lp_toggle').textContent === 'Showing placeholders');
  t.w.libToggle();
  await tick(200);
  t.w.libCopy();
  check('Copy takes the piece as shown', t.copied.length === 1 && /Hi Sam,/.test(t.copied[0]) && /Z2600718/.test(t.copied[0]));

  // a pending piece cannot be sent
  t.w.libFilter('kit', 'general'); t.w.libFilter('ch', 'social');
  await tick();
  t.d.querySelector('#tabLib .lcard').click();
  await tick(200);
  check('a pending piece previews but cannot be sent', t.d.querySelectorAll('#libprev .acts button').length === 0 && /waiting on its Compliance number/.test(txt(t.d.querySelector('#libprev .why'))));

  // piece first, then a person, into the same send panel
  t.w.libClose();
  t.w.libFilter('kit', 'all'); t.w.libFilter('ch', 'email');
  await tick();
  t.d.querySelector('#tabLib .lcard').click();
  await tick(200);
  t.w.libSend();
  await tick(150);
  const names = [...t.d.querySelectorAll('#libpick .pk b')].map(b => b.textContent.trim());
  check('Send to a contact lists the contacts', names.length === t.w.st.contacts.length && names[0] === 'Jane Doe', names.join(','));
  t.w.libPicked(0);
  await tick(900);
  check('picking one opens the existing send panel for that person', t.d.getElementById('drawer').classList.contains('on') && t.d.getElementById('d_name').textContent === 'Jane Doe');
  check('on the channel the piece belongs to', /^Email/.test((t.d.querySelector('#chtab button.on') || {}).textContent || ''));
  check('with the other email pieces already unfolded', t.d.getElementById('more_Email').hidden === false
    && t.d.getElementById('morebtn_Email').textContent === 'Show fewer'
    && t.d.getElementById('more_Text').hidden === true);
  check('and the library closed behind it', !t.d.getElementById('libprev').classList.contains('on') && !t.d.getElementById('libpick').classList.contains('on'));

  // copy rules for everything the library writes
  t.w.eval('closeDrawer(); showTab("lib")');
  await tick(150);
  const visible = txt(t.d.getElementById('tabLib'));
  check('no exclamation points or hyphens between words in the library copy', visible.indexOf('!') < 0 && !/[A-Za-z]-[A-Za-z]/.test(visible.replace(/Z\d+[A-Z]?/g, '').replace(/Cancer\/Specified-Disease/g, '')), visible.slice(0, 80));
  process.exit(process.exitCode || 0);
})();
