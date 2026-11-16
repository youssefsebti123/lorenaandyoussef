/**
 * Lorena & Youssef — RSVP receiver.
 * Lives in Extensions → Apps Script of the RSVP Google Sheet, deployed as a Web app
 * (Execute as: Me · Who has access: Anyone). Full steps in SETUP.md.
 *
 * Tab "Guests": YOU fill this in — First | Last | Plus ones | Notes.
 *               Plus ones: "Yes" = one extra guest, a number (2, 3…) = up to that many, "No"/blank = none.
 *               Only those guests see the "bringing guests?" question, and the script re-checks on submit.
 *               The form's "Find your name" search looks names up here too.
 * Tab "RSVPs":  one row per guest (matched on name + email). Editing a reply updates the row.
 * Tab "Log":    every submission ever received, so nothing is lost even if a row is overwritten.
 */

const SEND_CONFIRMATION = true;   // email the guest a copy of their reply
const NOTIFY_EMAIL = '';          // e.g. 'you@gmail.com' to get an email for every reply ('' = off)

const HEAD = ['Submitted', 'Updated', 'First', 'Last', 'Email', 'Thursday', 'Friday', 'Saturday',
              'Extra guests', 'Guest names', 'Also replying for', 'Dietary', 'Thursday notes'];
const ANSWERS = ['Attending', 'Not attending'];
const DAYS = [['thursday', 'Thursday 6 May · Marrakech day'], ['friday', 'Friday 7 May · Welcome drinks'], ['saturday', 'Saturday 8 May · The wedding']];
const MAX_EXTRAS = 10;

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return reply({ ok: false, error: 'bad request' }); }
  const clean = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

  // "Find your name": names only, at most 10 (more = "keep typing"), and only once 3+ letters are typed.
  if (d.action === 'search') {
    const m = search(clean(d.q, 80));
    return reply({ ok: true, matches: m.slice(0, 10), more: m.length > 10 });
  }
  // How many extra guests this name may bring — a number, nothing else about the list.
  if (d.action === 'lookup') {
    const n = extrasFor(clean(d.first, 80), clean(d.last, 80));
    return reply({ ok: true, plusOne: n > 0, extras: n });
  }

  if (d.website) return reply({ ok: true }); // honeypot: bots fill hidden fields — pretend success, store nothing

  const r = {
    first: clean(d.first, 80), last: clean(d.last, 80), email: clean(d.email, 200).toLowerCase(),
    party: clean(d.party, 300), dietary: clean(d.dietary, 1000), thursdayNotes: clean(d.thursdayNotes, 1000)
  };
  DAYS.forEach(([k]) => { r[k] = d[k]; });
  if (!r.first || !r.last) return reply({ ok: false, error: 'name' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) return reply({ ok: false, error: 'email' });
  if (DAYS.some(([k]) => ANSWERS.indexOf(r[k]) < 0)) return reply({ ok: false, error: 'answers' });

  // Extra guests are only kept up to what the Guests tab allows this guest.
  const allowed = extrasFor(r.first, r.last);
  let extras = 0, names = [];
  if (allowed) {
    if (d.extras != null) {
      extras = Math.max(0, Math.min(allowed, parseInt(d.extras, 10) || 0));
      names = (Array.isArray(d.guestNames) ? d.guestNames : []).slice(0, extras).map(x => clean(x, 160)).filter(String);
    } else if (d.plusOne === 'Yes' && clean(d.plusOneName, 160)) { // page from before multi-guest support
      extras = 1; names = [clean(d.plusOneName, 160)];
    }
  }

  const row = [r.first, r.last, r.email, r.thursday, r.friday, r.saturday, allowed ? extras : '', names.join(', '),
               r.party, r.dietary, r.thursdayNotes].map(safe);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const now = new Date();
    sheet(ss, 'Log').appendRow([now, ''].concat(row));

    const sh = sheet(ss, 'RSVPs');
    const key = (r.first + ' ' + r.last + ' ' + r.email).toLowerCase();
    const n = sh.getLastRow() - 1;
    const existing = n > 0 ? sh.getRange(2, 3, n, 3).getDisplayValues() : [];
    const i = existing.findIndex(x => (x[0] + ' ' + x[1] + ' ' + x[2]).toLowerCase() === key);
    if (i >= 0) {
      sh.getRange(i + 2, 2).setValue(now);
      sh.getRange(i + 2, 3, 1, row.length).setValues([row]);
    } else {
      sh.appendRow([now, ''].concat(row));
    }
  } finally {
    lock.releaseLock();
  }

  let emailed = false;
  let summary = DAYS.map(([k, label]) => label + ': ' + r[k]).join('\n');
  if (allowed) summary += '\n' + (allowed === 1 ? 'Plus-one: ' : 'Guests with you: ') +
    (extras ? (names.length ? names.join(', ') : extras) : (allowed === 1 ? 'not bringing one' : 'none'));
  if (SEND_CONFIRMATION) {
    try {
      MailApp.sendEmail({
        to: r.email,
        subject: 'Your RSVP · Lorena & Youssef · 8 May 2027',
        body: 'Dear ' + r.first + ',\n\nThank you for your reply. Here is what we have:\n\n' + summary +
              (r.party ? '\n\nAlso replying for: ' + r.party : '') +
              '\n\nNeed to change something? Just send the form again with the same name and email.\n\nWith love,\nLorena & Youssef'
      });
      emailed = true;
    } catch (err) { /* daily quota reached or bad address — the reply is still saved */ }
  }
  if (NOTIFY_EMAIL) {
    try { MailApp.sendEmail(NOTIFY_EMAIL, 'RSVP: ' + r.first + ' ' + r.last, summary + '\n\nEmail: ' + r.email); } catch (err) {}
  }
  return reply({ ok: true, emailed: emailed, extrasAllowed: allowed });
}

// Visiting the /exec URL in a browser shows this — handy to check the deployment is live.
function doGet() { return reply({ ok: true, service: 'rsvp' }); }

/* ───────── Guests tab ───────── */

function guestRows() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Guests');
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 3).getDisplayValues()
    .filter(x => x[0].trim() || x[1].trim())
    .map(x => ({ first: x[0].trim(), last: x[1].trim(), key: norm(x[0] + ' ' + x[1]), extras: allowance(x[2]) }));
}

// "Yes" = 1, a number = that many (max 10), anything else = 0.
function allowance(v) {
  const s = String(v).trim().toLowerCase();
  if (/^(yes|y|true|x)$/.test(s)) return 1;
  const n = parseInt(s, 10);
  return n > 0 ? Math.min(n, MAX_EXTRAS) : 0;
}

// Case-, accent- and spacing-insensitive. If a name is listed twice, the larger allowance wins.
function extrasFor(first, last) {
  if (!first || !last) return 0;
  const want = norm(first + ' ' + last);
  return guestRows().reduce((n, g) => g.key === want ? Math.max(n, g.extras) : n, 0);
}

// Every word typed must start one of the words in the guest's name: "lor magg" finds "Lorena Maggiorani".
function search(q) {
  const words = norm(q).split(' ').filter(String);
  if (words.join('').length < 3) return [];
  const seen = {}, out = [];
  for (const g of guestRows()) {
    const parts = g.key.split(' ');
    if (seen[g.key] || !words.every(w => parts.some(p => p.indexOf(w) === 0))) continue;
    seen[g.key] = true;
    out.push({ first: g.first, last: g.last });
    if (out.length === 11) break; // one extra, so the form knows to say "keep typing"
  }
  return out;
}

function norm(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }

/* ───────── One-time setup ───────── */

// Run from the editor (pick "setup" next to ▷ Run). Builds the Summary, Guests, RSVPs and Log tabs.
// Safe to run again: it never touches guests or replies. It does rebuild the Summary tab (all formulas).
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const style = (sh, cols) => {
    sh.getRange(1, 1, 1, cols).setFontWeight('bold').setBackground('#f3e9dc');
    sh.setFrozenRows(1);
  };

  const guests = ss.getSheetByName('Guests') || ss.insertSheet('Guests');
  if (guests.getLastRow() === 0) {
    guests.getRange(1, 1, 1, 4).setValues([['First', 'Last', 'Plus ones', 'Notes']]);
    guests.setColumnWidths(1, 2, 140).setColumnWidth(3, 90).setColumnWidth(4, 260);
  }
  guests.getRange('C1').setValue('Plus ones');
  style(guests, 4);
  guests.getRange('C2:C1000').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['No', 'Yes', '2', '3', '4', '5', '6'], true).setAllowInvalid(true)
    .setHelpText('Yes = one extra guest, a number = up to that many, No = none').build());

  ['RSVPs', 'Log'].forEach(name => {
    const sh = sheet(ss, name);
    const now = sh.getRange(1, 1, 1, HEAD.length).getDisplayValues()[0];
    if (now.join('|') !== HEAD.join('|')) {
      if (sh.getLastRow() > 1) throw new Error('The ' + name + ' tab already has replies in the old layout — move them to another tab first.');
      sh.getRange(1, 1, 1, sh.getMaxColumns()).clearContent();
      sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]);
    }
    style(sh, HEAD.length);
    sh.setColumnWidths(1, 2, 150).setColumnWidths(3, 2, 120).setColumnWidth(5, 200).setColumnWidths(6, 4, 110)
      .setColumnWidths(10, 2, 200).setColumnWidths(12, 2, 240);
  });

  let sum = ss.getSheetByName('Summary');
  if (!sum) {
    const first = ss.getSheets()[0];
    sum = first.getLastRow() === 0 && !/^(Guests|RSVPs|Log)$/.test(first.getName()) ? first.setName('Summary') : ss.insertSheet('Summary');
  }
  sum.getRange('A1:E14').clear();
  sum.getRange('A1').setValue('Headcount').setFontWeight('bold').setFontSize(14);
  sum.getRange('A3:E3').setValues([['Day', 'Guests attending', 'Extra guests attending', 'Total attending', 'Not attending']])
    .setFontWeight('bold').setBackground('#f3e9dc');
  [['Thursday 6 May', 'F'], ['Friday 7 May', 'G'], ['Saturday 8 May', 'H']].forEach(([day, c], i) => {
    const r = 4 + i, col = 'RSVPs!' + c + '2:' + c;
    sum.getRange('A' + r).setNumberFormat('@').setValue(day);
    sum.getRange('B' + r + ':E' + r).setFormulas([[
      '=COUNTIF(' + col + ',"Attending")',
      '=SUMIF(' + col + ',"Attending",RSVPs!I2:I)',
      '=B' + r + '+C' + r,
      '=COUNTIF(' + col + ',"Not attending")']]);
  });
  sum.getRange('A8:A10').setValues([['Replies received'], ['Guests on the list'], ['Extra guests offered']]).setFontWeight('bold');
  sum.getRange('B8:B10').setFormulas([['=COUNTA(RSVPs!C2:C)'], ['=COUNTA(Guests!A2:A)'], ['=COUNTIF(Guests!C2:C,"Yes")+SUM(Guests!C2:C)']]);
  sum.getRange('A12').setValue('Names in "Also replying for" are free text and aren\'t counted above.').setFontStyle('italic');
  sum.setColumnWidth(1, 170).setColumnWidths(2, 4, 160);
  ss.setActiveSheet(sum);
  ss.moveActiveSheet(1);
}

/* ───────── Helpers ───────── */

function sheet(ss, name) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEAD);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEAD.length).setFontWeight('bold');
  }
  return sh;
}

// Stop guest text being run as a spreadsheet formula (=, +, -, @ at the start).
function safe(v) { return /^[=+\-@\t\r]/.test(v) ? "'" + v : v; }

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
