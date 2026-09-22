// Tests the social send path in the built index.html: the share sheet, the caption fallback,
// and that nothing ever navigates the window to the bare image.
// Run with: npm test  (from app/)
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.resolve(__dirname, '..', '..', 'index.html'), 'utf8');
const kit = html.match(/<script id="kit">([\s\S]*?)<\/script>/)[1];

function check(label, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra ? '  ' + extra : ''));
  if (!cond) process.exitCode = 1;
}

function boot(ua) {
  const shared = [], copied = [], opened = [], navigated = [];
  const dom = new JSDOM(html, { url: 'https://outreach.benefitsotb.com/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      if (ua) Object.defineProperty(w.navigator, 'userAgent', { value: ua, configurable: true });
      w.HTMLCanvasElement.prototype.getContext = () => null;
      w.open = (u) => { opened.push(u); return null; };
      w.HTMLAnchorElement.prototype.click = function () { navigated.push(this.href + (this.download ? ' download=' + this.download : '')); };
    } });
  const w = dom.window;
  w.SocialShare = {
    can: () => true,
    post: (img, caption, name) => { shared.push({ kind: 'post', img, caption, name }); return Promise.resolve('shared'); },
    saveImage: (img, name) => { shared.push({ kind: 'save', img, name }); return Promise.resolve('shared'); }
  };
  w.__copy = (t) => copied.push(t);
  w.eval('loadSample(); login(); goStep(4); openDrawer(0);');
  return { w, d: w.document, shared, copied, opened, navigated };
}
const tick = (ms) => new Promise(r => setTimeout(r, ms || 60));

(async () => {
  const t = boot();
  await tick(400);
  try { t.d.getElementById('hp_ok').click(); } catch (e) {}
  // the Social pane
  t.w.eval('showCh("Social", document.querySelectorAll("#chtab button")[2])');
  await tick(200);
  const labels = [...t.d.querySelectorAll('.chpane[data-ch="Social"] button')].map(b => b.textContent.trim());
  check('Share post leads the social buttons', labels[0] === 'Share post', labels.join(','));
  check('Save image replaces Download image', labels.indexOf('Save image') > 0 && labels.indexOf('Download image') < 0, labels.join(','));

  t.w.sh('Social', 'share', 0);
  await tick(120);
  check('Share post hands the image and the caption to the share sheet', t.shared.length === 1 && t.shared[0].kind === 'post' && /\.png$/.test(t.shared[0].img) && t.shared[0].caption.length > 40, JSON.stringify(t.shared[0] || {}).slice(0, 120));
  check('and the caption it shares is the approved caption', t.shared[0].caption.indexOf(t.w.KIT.captions.general.facebook.lines[0]) >= 0 || t.shared[0].caption.indexOf(t.w.KIT.captions.cancer.facebook.lines[0]) >= 0);

  t.w.sh('Social', 'img', 0);
  await tick(120);
  check('Save image goes through the share sheet too', t.shared.length === 2 && t.shared[1].kind === 'save');
  check('nothing navigates this window to the image', t.navigated.length === 0, t.navigated.join(','));

  t.w.sh('Social', 'ig', 0);
  await tick(80);
  check('Instagram copies the caption first', t.copied.length === 1 && t.copied[0].length > 40);

  // with no share support at all, it falls back to copy and say so
  const t2 = boot();
  await tick(400);
  t2.w.SocialShare = null;
  t2.w.eval('showCh("Social", document.querySelectorAll("#chtab button")[2])');
  await tick(150);
  t2.w.sh('Social', 'share', 0);
  await tick(100);
  check('with no share sheet it copies the caption instead', t2.copied.length === 1 && t2.navigated.length === 0);
  process.exit(process.exitCode || 0);
})();
