// Tests the phone layout fixes and the one time explainer in the built index.html.
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

function boot() {
  const dom = new JSDOM(html, { url: 'https://outreach.benefitsotb.com/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => null; w.open = () => null; } });
  const w = dom.window;
  w.eval('loadSample(); login();');
  return { w, d: w.document };
}
const tick = (ms) => new Promise(r => setTimeout(r, ms || 40));

(async () => {
  const t = boot();

  // contacts stack into cards on a phone
  t.w.eval('goStep(2)');
  await tick();
  const cells = Array.from(t.d.querySelectorAll('#ctbody tr:first-child td')).map(td => td.getAttribute('data-l'));
  check('contact cells are labelled so they can stack on a phone', cells.slice(0, 5).join(',') === 'Name,Relationship,Email,Phone,Social', cells.join(','));
  const css = Array.from(t.d.querySelectorAll('style')).map(s => s.textContent).join('\n');
  check('the phone rule turns the contacts table into cards', /@media\(max-width:700px\)\{#ctbl thead\{display:none\}/.test(css));
  check('and prints the label in front of each line', /#ctbl td\[data-l\]:not\(:first-child\):before\{content:attr\(data-l\)/.test(css));

  // the email preview is scaled, not scrolled
  check('the preview no longer scrolls sideways', /\.emlprev\{background:#F5FAFD;padding:10px;overflow:hidden\}/.test(css));
  check('the preview is rendered in a scalable box', kit.indexOf('\'<div class="emlprev">\'+emailHTMLKit(e,c)+\'</div>\'') >= 0);
  check('the fit runs after the pieces render and on resize', /setTimeout\(emlFit,30\)/.test(kit) && /addEventListener\("resize",function\(\)\{clearTimeout\(window\.__emlT\)/.test(kit));

  // the explainer, once per device
  t.w.eval('goStep(4); openDrawer(0)');
  await tick(400);
  const help = t.d.getElementById('sendhelp');
  check('the explainer shows the first time the drawer opens', !!help && help.hidden === false);
  const text = help.textContent;
  check('it covers all four ways to send', /Copy Formatted/.test(text) && /Open in Mail/.test(text) && /Open in Gmail and Open in Outlook/.test(text) && /Send as text/.test(text));
  check('no exclamation points or hyphens between words in it', text.indexOf('!') < 0 && !/[A-Za-z]-[A-Za-z]/.test(text));
  t.d.getElementById('hp_ok').dispatchEvent(new t.w.MouseEvent('click', { bubbles: true }));
  check('Got it closes it and remembers', help.hidden === true && t.w.localStorage.getItem('kit_seen_sendhelp') === '1');
  t.w.eval('closeDrawer(); openDrawer(1)');
  await tick(400);
  check('it does not come back on the next contact', t.d.getElementById('sendhelp').hidden === true);
  t.w.eval('sendHelp()');
  check('it can be opened again on purpose', t.d.getElementById('sendhelp').hidden === false);
  process.exit(process.exitCode || 0);
})();
