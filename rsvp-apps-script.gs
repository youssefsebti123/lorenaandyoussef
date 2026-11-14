/**
 * Lorena & Youssef — RSVP receiver.
 * Paste into Extensions → Apps Script of your RSVP Google Sheet, then deploy as a Web app
 * (Execute as: Me · Who has access: Anyone). Full steps in SETUP.md.
 *
 * Tab "Guests": YOU fill this in — First | Last | Plus one (Yes/No). Guests marked Yes see a plus-one
 *               question on the form. Nobody else can add one, even by tampering with the page.
 * Tab "RSVPs":  one row per guest (matched on name + email). Editing a reply updates the row.
 * Tab "Log":    every submission ever received, so nothing is lost even if a row is overwritten.
 */

const SEND_CONFIRMATION = true;   // email the guest a copy of their reply
const NOTIFY_EMAIL = '';          // e.g. 'you@gmail.com' to get an email for every reply ('' = off)

const HEAD = ['Submitted', 'Updated', 'First', 'Last', 'Email', 'Thursday', 'Friday', 'Saturday',
              'Plus-one', 'Also replying for', 'Dietary', 'Thursday notes'];
const ANSWERS = ['Attending', 'Not attending'];
const DAYS = [['thursday', 'Thursday 6 May · Marrakech day'], ['friday', 'Friday 7 May · Welcome drinks'], ['saturday', 'Saturday 8 May · The wedding']];

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return reply({ ok: false, error: 'bad request' }); }
  const clean = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

  // Form asks "does this guest have a plus-one?" — answers only true/false, nothing else about the list.
  if (d.action === 'lookup') return reply({ ok: true, plusOne: hasPlusOne(clean(d.first, 80), clean(d.last, 80)) });

  if (d.website) return reply({ ok: true }); // honeypot: bots fill hidden fields — pretend success, store nothing

  const r = {
    first: clean(d.first, 80), last: clean(d.last, 80), email: clean(d.email, 200).toLowerCase(),
    party: clean(d.party, 300), dietary: clean(d.dietary, 1000), thursdayNotes: clean(d.thursdayNotes, 1000)
  };
  DAYS.forEach(([k]) => { r[k] = d[k]; });
  if (!r.first || !r.last) return reply({ ok: false, error: 'name' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) return reply({ ok: false, error: 'email' });
  if (DAYS.some(([k]) => ANSWERS.indexOf(r[k]) < 0)) return reply({ ok: false, error: 'answers' });

  // Plus-one is only kept if the Guests tab says this guest has one.
  const allowed = hasPlusOne(r.first, r.last);
  r.plusOne = '';
  if (allowed && d.plusOne === 'Yes' && clean(d.plusOneName, 160)) r.plusOne = clean(d.plusOneName, 160);
  else if (allowed && d.plusOne === 'No') r.plusOne = 'No';

  const row = [r.first, r.last, r.email, r.thursday, r.friday, r.saturday, r.plusOne, r.party, r.dietary, r.thursdayNotes].map(safe);
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
  if (r.plusOne) summary += '\nPlus-one: ' + (r.plusOne === 'No' ? 'not bringing one' : r.plusOne);
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
  return reply({ ok: true, emailed: emailed, plusOneAllowed: allowed });
}

// Visiting the /exec URL in a browser shows this — handy to check the deployment is live.
function doGet() { return reply({ ok: true, service: 'rsvp' }); }

// Case-, accent- and spacing-insensitive match against the Guests tab.
function hasPlusOne(first, last) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Guests');
  if (!sh || sh.getLastRow() < 2 || !first || !last) return false;
  const want = norm(first + ' ' + last);
  return sh.getRange(2, 1, sh.getLastRow() - 1, 3).getDisplayValues()
    .some(x => norm(x[0] + ' ' + x[1]) === want && /^(yes|y|true|1|x)$/i.test(String(x[2]).trim()));
}
function norm(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }

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
