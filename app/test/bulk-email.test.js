// Tests the group email bar by running the whole built index.html in jsdom, the way a person uses it:
// load the sample contacts, go to the Center of influence screen, check people, use the bar.
// Also covers the per contact Unsubscribe link now pointing at unsubscribe.html?t=.
// Run with: npm test  (from app/)
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.resolve(__dirname, '..', '..', 'index.html'), 'utf8');

function check(label, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra ? '  ' + extra : ''));
  if (!cond) process.exitCode = 1;
}

function boot(ua) {
  const opened = [], clip = [], logged = [];
  const dom = new JSDOM(html, {
    url: 'https://outreach.benefitsotb.com/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      if (ua) Object.defineProperty(w.navigator, 'userAgent', { value: ua, configurable: true });
      w.open = (u) => { opened.push(u); return null; };
      w.ClipboardItem = function (items) { this.items = items; };
      Object.defineProperty(w.navigator, 'clipboard', { value: {
        write: (list) => { const it = list[0].items; return Promise.all([it['text/html'].text(), it['text/plain'].text()]).then(([h, t]) => { clip.push({ html: h, text: t }); }); },
        writeText: (t) => { clip.push({ text: t }); return Promise.resolve(); }
      } });
      w.HTMLCanvasElement.prototype.getContext = () => null;
    }
  });
  const w = dom.window;
  w.cloudAgentEmail = () => 'associate@example.com';
  w.logBulkSend = (list, act, piece, z) => logged.push({ n: list.length, ids: list.map(c => c.email), act, piece, z });
  w.eval('loadSample(); login(); goStep(4);');
  return { w, d: w.document, opened, clip, logged };
}
const tick = (ms) => new Promise(r => setTimeout(r, ms || 30));
const box = (t, i) => t.d.querySelectorAll('#coi .pcard .coick input')[i];
const click = (t, el) => el.dispatchEvent(new t.w.MouseEvent('click', { bubbles: true, cancelable: true }));
const eligible = (t) => Array.from(t.d.querySelectorAll('#coi .pcard')).map((d, i) => ({ d, i, c: t.w.st.contacts[i] })).filter(x => x.c.email);

(async () => {
  let t = boot();
  const bar = () => t.d.getElementById('bulkbar');
  check('the Center of influence screen renders the sample contacts', t.d.querySelectorAll('#coi .pcard').length === t.w.st.contacts.length && t.w.st.contacts.length >= 3);
  check('no bar while nothing is checked', !bar() || bar().hidden === true);

  const el = eligible(t);
  click(t, box(t, el[0].i));
  check('checking one person shows the bar', bar() && bar().hidden === false && t.d.getElementById('bb_n').textContent === '1 person selected');
  click(t, box(t, el[1].i));
  check('checking a second person updates the count', t.d.getElementById('bb_n').textContent === '2 people selected');
  check('Bcc is the default', t.d.querySelector('#bulkbar input[value=bcc]').checked === true);
  const pieces = Array.from(t.d.querySelectorAll('#bb_piece option')).map(o => o.value);
  check('the picker offers the three approved emails', pieces.join(',') === 'intro,life_moment,nudge', pieces.join(','));
  check('the Outlook line is under the buttons', /Outlook fills in the addresses only for an Outlook or Microsoft 365 mailbox/.test(bar().textContent));
  check('the Cc warning only shows when Cc is picked', t.d.getElementById('bb_ccnote').hidden === true);

  // Open in Gmail with two people: copy first, then compose
  click(t, t.d.getElementById('bb_gmail'));
  await tick();
  const two = [el[0].c.email, el[1].c.email];
  const g = new URL(t.opened[0]);
  check('Gmail opens a compose window', g.origin === 'https://mail.google.com' && g.searchParams.get('view') === 'cm', t.opened[0]);
  check('addressed to the associate', g.searchParams.get('to') === 'associate@example.com');
  check('the checked contacts go in Bcc', g.searchParams.get('bcc') === two.join(',') && !g.searchParams.has('cc'));
  check('the subject is the approved subject', g.searchParams.get('su') === t.w.KIT.emails.intro.subject);
  check('the formatted email was copied before the tab opened', t.clip.length === 1 && /<html/i.test(t.clip[0].html));
  check('two people get the neutral greeting', /Hi there,/.test(t.clip[0].html) && /Hi there,/.test(t.clip[0].text) && !new RegExp('Hi ' + el[0].c.first + ',').test(t.clip[0].html));
  check('the bulk piece carries the generic Unsubscribe link', t.clip[0].html.indexOf('href="https://outreach.benefitsotb.com/unsubscribe.html"') >= 0 && t.clip[0].text.indexOf('Unsubscribe: https://outreach.benefitsotb.com/unsubscribe.html') >= 0 && t.clip[0].html.indexOf('?t=') < 0);
  const ctaLine = t.clip[0].text.split(String.fromCharCode(10)).find(l => l.indexOf(t.w.KIT.emails.intro.cta + ': ') === 0) || '';
  check('the associate link, name and address fill in, no tokens left', /^.+: https?:\/\//.test(ctaLine) && t.clip[0].html.indexOf('{{YOUR_NAME}}') < 0 && t.clip[0].html.indexOf('[First name]') < 0, ctaLine);
  check('one send row per contact, marked as a bulk Gmail send', t.logged.length === 1 && t.logged[0].n === 2 && t.logged[0].act === 'gmail' && t.logged[0].z === t.w.KIT.emails.intro.z, JSON.stringify(t.logged));

  // Cc toggle and Outlook, on a different piece
  const cc = t.d.querySelector('#bulkbar input[value=cc]'); cc.checked = true; cc.dispatchEvent(new t.w.Event('change'));
  check('picking Cc shows the warning', t.d.getElementById('bb_ccnote').hidden === false);
  const sel = t.d.getElementById('bb_piece'); sel.value = 'nudge'; sel.dispatchEvent(new t.w.Event('change'));
  click(t, t.d.getElementById('bb_outlook'));
  await tick();
  const o = new URL(t.opened[1]);
  check('Outlook opens the web compose deeplink', o.origin + o.pathname === 'https://outlook.office.com/mail/deeplink/compose');
  check('with Cc chosen the contacts go in Cc', o.searchParams.get('cc') === two.join(',') && !o.searchParams.has('bcc') && o.searchParams.get('to') === 'associate@example.com');
  check('and the subject of the picked piece', o.searchParams.get('subject') === t.w.KIT.emails.nudge.subject);
  check('Outlook also copies first', t.clip.length === 2 && t.clip[1].html.indexOf(t.w.KIT.emails.nudge.z) >= 0);
  check('the Outlook send is logged as outlook', t.logged[1].act === 'outlook' && t.logged[1].n === 2);

  // Copy Formatted alone
  click(t, t.d.getElementById('bb_copy'));
  await tick();
  check('Copy Formatted copies and opens nothing', t.clip.length === 3 && t.opened.length === 2 && t.logged[2].act === 'html');

  // The bulk piece is the approved piece: only the greeting name and the Unsubscribe link differ
  const c0 = t.w.st.contacts[el[0].i];
  c0.unsub_token = '11111111-2222-4333-8444-555555555555';
  t.w.openDrawer(el[0].i);
  await tick(50);
  const piece = t.w.RENDERED.Email.find(r => r.subject === t.w.KIT.emails.nudge.subject);
  const single = piece.html, singleText = piece.body;
  t.w.eval('closeDrawer()');
  const norm = (h) => h.replace(/Hi [^,<]+,/g, 'Hi NAME,').replace(/href="https:\/\/outreach\.benefitsotb\.com\/unsubscribe\.html[^"]*"/g, 'href="UNSUB"');
  check('the bulk piece matches the single piece apart from greeting name and Unsubscribe link', norm(single) === norm(t.clip[2].html));
  check('a single contact email now links to unsubscribe.html with its token', single.indexOf('href="https://outreach.benefitsotb.com/unsubscribe.html?t=11111111-2222-4333-8444-555555555555"') >= 0);
  check('and the plain text version says the same', singleText.indexOf('Unsubscribe: https://outreach.benefitsotb.com/unsubscribe.html?t=11111111-2222-4333-8444-555555555555') >= 0);
  check('no email still links to the old function host', single.indexOf('functions.supabase.co/unsub?') < 0);

  // one person keeps their own first name
  click(t, t.d.getElementById('bb_clear'));
  check('Clear selection hides the bar', bar().hidden === true && t.d.getElementById('coicount').textContent === '');
  click(t, box(t, el[2].i));
  click(t, t.d.getElementById('bb_copy'));
  await tick();
  check('with one person the greeting keeps their first name', new RegExp('Hi ' + el[2].c.first + ',').test(t.clip[3].html), el[2].c.first);
  check('and still uses the generic Unsubscribe link', t.clip[3].html.indexOf('href="https://outreach.benefitsotb.com/unsubscribe.html"') >= 0);

  // the single contact drawer is untouched
  t.w.openDrawer(el[0].i);
  await tick(50);
  const pane = t.d.querySelector('#d_out .chpane[data-ch="Email"]');
  const btns = pane ? Array.from(pane.querySelectorAll('button')).slice(0, 4).map(b => b.textContent).join(',') : '';
  check('the single drawer still shows its buttons', btns === 'Copy formatted email,Gmail,Outlook,Copy text', btns);
  check('and greets the contact by name', pane && new RegExp('Hi ' + el[0].c.first + ',').test(pane.textContent));
  check('the drawer covers the bar', getZ(t, '.drawer') > getZ(t, '#bulkbar'), getZ(t, '.drawer') + ' vs ' + getZ(t, '#bulkbar'));

  // no bar on other screens
  t.w.eval('closeDrawer(); goStep(2);');
  check('the bar is not shown on the Contacts step', t.d.getElementById('st4').classList.contains('on') === false);

  // phones: the buttons open the mail app, because the web compose links drop the addresses there
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Mobile Safari/537.36';
  for (const [name, ua] of [['iPhone', IPHONE], ['Android', ANDROID]]) {
    const p = boot(ua);
    const pe = Array.from(p.d.querySelectorAll('#coi .pcard')).map((d, i) => ({ i, c: p.w.st.contacts[i] })).filter(x => x.c.email);
    p.d.querySelectorAll('#coi .pcard .coick input')[pe[0].i].dispatchEvent(new p.w.MouseEvent('click', { bubbles: true, cancelable: true }));
    p.d.querySelectorAll('#coi .pcard .coick input')[pe[1].i].dispatchEvent(new p.w.MouseEvent('click', { bubbles: true, cancelable: true }));
    const addrs = [pe[0].c.email, pe[1].c.email].join(',');
    const gm = p.w.BulkSel.target('gmail'), ol = p.w.BulkSel.target('outlook');
    if (name === 'iPhone') {
      check('iPhone: Open in Gmail opens the Gmail app', gm.how === 'app' && gm.url.indexOf('googlegmail://co?to=associate%40example.com') === 0, gm.url);
      check('iPhone: with the people in Bcc and the approved subject', gm.url.indexOf('&bcc=' + encodeURIComponent(addrs)) > 0 && gm.url.indexOf('&subject=' + encodeURIComponent(p.w.KIT.emails.intro.subject)) > 0);
      check('iPhone: it falls back to the mail app', gm.fallback.indexOf('mailto:associate%40example.com?bcc=') === 0, gm.fallback);
      check('iPhone: Open in Outlook opens the Outlook app', ol.how === 'app' && ol.url.indexOf('ms-outlook://compose?to=') === 0, ol.url);
    } else {
      check('Android: the buttons open the mail app', gm.how === 'mailto' && ol.how === 'mailto');
      check('Android: your address in To, the people in Bcc, the approved subject', gm.url.indexOf('mailto:associate%40example.com?bcc=' + encodeURIComponent(addrs) + '&subject=' + encodeURIComponent(p.w.KIT.emails.intro.subject)) === 0, gm.url);
    }
    check(name + ': the note tells them to paste', /These open your mail app with the addresses and the subject filled in\. Paste the email into the message\./.test(p.d.getElementById('bulkbar').textContent));
    const cc2 = p.d.querySelector('#bulkbar input[value=cc]'); cc2.checked = true; cc2.dispatchEvent(new p.w.Event('change'));
    check(name + ': Cc carries through to the mail app link', p.w.BulkSel.target('gmail').url.indexOf('cc=' + encodeURIComponent(addrs)) > 0 && p.w.BulkSel.target('gmail').url.indexOf('bcc=') < 0);
  }
  check('a computer still gets the web compose link', t.w.BulkSel.target('gmail').how === 'web' && t.w.BulkSel.target('outlook').url.indexOf('https://outlook.office.com/mail/deeplink/compose') === 0);

  // copy rules for the bar
  const shown = bar().textContent + ' ' + Array.from(bar().querySelectorAll('option')).map(o => o.textContent).join(' ');
  check('no exclamation points in the bar', shown.indexOf('!') < 0);
  check('no hyphens between words in the bar copy', !/[A-Za-z]-[A-Za-z]/.test(shown.replace(/Z\d+[A-Z0-9-]*/g, '')), shown);

  process.exit(process.exitCode || 0);
})();

function getZ(t, sel) {
  const css = Array.from(t.d.querySelectorAll('style')).map(s => s.textContent).join('\n');
  const esc = sel.replace(/[.#]/g, m => '\\' + m);
  const m = css.match(new RegExp(esc + '\\{[^}]*z-index:(\\d+)'));
  return m ? +m[1] : 0;
}
