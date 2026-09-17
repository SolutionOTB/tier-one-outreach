// Builds app/www from the repo root web app. No bundler: the HTML is copied as is.
//
// Source of truth for the web app is the OneDrive folder Brand Assets/agent/kit/.
// Run inject.py there, copy the resulting Brand Assets/index.html to this repo root,
// then run this script. It copies:
//   ../index.html        -> www/index.html  (plus the manifest and icon tags in <head>)
//   ../kit/*.png         -> www/kit/        (the four approved post images)
//   resources/manifest.webmanifest, icon-192.png, icon-512.png -> www/

const fs = require('fs');
const path = require('path');

const appDir = __dirname;
const repoRoot = path.resolve(appDir, '..');
const wwwDir = path.join(appDir, 'www');
const resDir = path.join(appDir, 'resources');

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  return fs.statSync(to).size;
}

// The head tags the native shell and the installable web app need. The repo root
// index.html stays exactly as inject.py wrote it; these are added to the copy only.
const HEAD_TAGS = [
  '<link rel="manifest" href="manifest.webmanifest">',
  '<meta name="theme-color" content="#00A7E1">',
  '<link rel="apple-touch-icon" href="icon-192.png">',
  '<link rel="icon" type="image/png" sizes="512x512" href="icon-512.png">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="Tier One Outreach">'
].join('\n');

const MARKER = '<!-- app shell head -->';

function addHeadTags(html) {
  if (html.includes(MARKER)) return html; // already built from a copy that had them
  const at = html.indexOf('</head>');
  if (at === -1) throw new Error('index.html has no </head>, cannot add the manifest tags');
  return html.slice(0, at) + MARKER + '\n' + HEAD_TAGS + '\n' + html.slice(at);
}

const srcIndex = path.join(repoRoot, 'index.html');
if (!fs.existsSync(srcIndex)) {
  throw new Error('No index.html at the repo root: ' + srcIndex);
}

rmrf(wwwDir);
fs.mkdirSync(wwwDir, { recursive: true });

const html = addHeadTags(fs.readFileSync(srcIndex, 'utf8'));
fs.writeFileSync(path.join(wwwDir, 'index.html'), html);
console.log('www/index.html', Buffer.byteLength(html), 'bytes');

for (const f of ['manifest.webmanifest', 'icon-192.png', 'icon-512.png']) {
  const size = copy(path.join(resDir, f), path.join(wwwDir, f));
  console.log('www/' + f, size, 'bytes');
}

const kitSrc = path.join(repoRoot, 'kit');
let images = 0;
if (fs.existsSync(kitSrc)) {
  for (const f of fs.readdirSync(kitSrc)) {
    if (!/\.(png|jpg|jpeg|gif|webp)$/i.test(f)) continue;
    copy(path.join(kitSrc, f), path.join(wwwDir, 'kit', f));
    images++;
  }
}
console.log('www/kit', images, 'images');

if (images === 0) {
  console.warn('Warning: no post images found in ' + kitSrc + '. The Posts tab will show broken images.');
}
