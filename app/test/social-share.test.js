// Tests the social send path in the built index.html: saving to Photos, the three step handoff to
// Instagram and Facebook, the share sheet, the caption fallback, and that nothing ever navigates
// the window to the bare image.
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

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
let saveResult = 'photos';
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
    saveImage: (img, name) => { shared.push({ kind: 'save', img, name }); return Promise.resolve(saveResult); }
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
  const firstCard = [...t.d.querySelectorAll('.chpane[data-ch="Social"] .card2')][0];
  const one = [...firstCard.querySelectorAll('button')].map(b => b.textContent.trim());
  check('a Facebook card offers Facebook, not Instagram', one[0] === 'Post to Facebook' && one.indexOf('Post to Instagram') < 0, one.join(','));
  const cards = [...t.d.querySelectorAll('.chpane[data-ch="Social"] .card2')];
  const apps = cards.map(c => [...c.querySelectorAll('button')].map(b => b.textContent.trim()).filter(x => /^Post to /.test(x)).join('|'));
  check('each card offers only its own network, in kit order', apps.join(',') === 'Post to Facebook,Post to Instagram,Post to Facebook,Post to Instagram', apps.join(','));
  check('the share sheet is offered last, and there is no Download image', one[one.length - 1] === 'Share another way' && labels.indexOf('Download image') < 0, one.join(','));

  // Post to Instagram on a phone: save the image, copy the caption, then open the app
  const m = boot(IPHONE);
  await tick(400);
  try { m.d.getElementById('hp_ok').click(); } catch (e) {}
  m.w.eval('showCh("Social", document.querySelectorAll("#chtab button")[2])');
  await tick(200);
  m.w.sh('Social', 'ig', 1);
  await tick(250);
  check('Post to Instagram saves the image to Photos first', m.shared.length === 1 && m.shared[0].kind === 'save' && /instagram-post\.png$/.test(m.shared[0].img), JSON.stringify(m.shared[0] || {}).slice(0, 120));
  check('then copies the approved caption', m.copied.length === 1 && (m.copied[0].indexOf(m.w.KIT.captions.general.instagram.lines[0]) >= 0 || m.copied[0].indexOf(m.w.KIT.captions.cancer.instagram.lines[0]) >= 0 || m.copied[0].indexOf(m.w.KIT.captions.general.facebook.lines[0]) >= 0 || m.copied[0].indexOf(m.w.KIT.captions.cancer.facebook.lines[0]) >= 0));
  check('and tells you the image is in Photos and what to do in the app', /Image saved and caption copied/.test(m.d.getElementById('toast').textContent), m.d.getElementById('toast').textContent);
  check('it never navigates this window to the image', m.navigated.length === 0, m.navigated.join(','));

  // when the phone cannot save, say so rather than promising a saved image
  saveResult = 'none';
  const t3 = boot(IPHONE);
  await tick(400);
  try { t3.d.getElementById('hp_ok').click(); } catch (e) {}
  t3.w.eval('showCh("Social", document.querySelectorAll("#chtab button")[2])');
  await tick(200);
  t3.w.sh('Social', 'fb', 0);
  await tick(250);
  check('if it cannot reach Photos it says to save the image first', /Save the image first/.test(t3.d.getElementById('toast').textContent), t3.d.getElementById('toast').textContent);
  saveResult = 'photos';

  t.w.sh('Social', 'share', 0);
  await tick(120);
  const post = t.shared.filter(x => x.kind === 'post')[0];
  check('Share another way still hands the image and caption to the share sheet', !!post && /\.png$/.test(post.img) && post.caption.length > 40, JSON.stringify(post || {}).slice(0, 120));

  t.w.sh('Social', 'img', 0);
  await tick(150);
  check('Save image says it went to Photos', /Saved to your photos/.test(t.d.getElementById('toast').textContent), t.d.getElementById('toast').textContent);

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
