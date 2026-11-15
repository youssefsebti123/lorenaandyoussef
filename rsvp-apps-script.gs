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

// Run once from the editor (pick "setup" next to ▷ Run). Builds the Summary, Guests, RSVPs and Log tabs.
// Safe to run again: it never overwrites a tab that already has content.
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const style = (sh, cols) => {
    sh.getRange(1, 1, 1, cols).setFontWeight('bold').setBackground('#f3e9dc');
    sh.setFrozenRows(1);
  };

  const guests = ss.getSheetByName('Guests') || ss.insertSheet('Guests');
  if (guests.getLastRow() === 0) {
    guests.getRange(1, 1, 1, 4).setValues([['First', 'Last', 'Plus one', 'Notes']]);
    style(guests, 4);
    guests.getRange('C2:C1000').setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(['Yes', 'No'], true).setAllowInvalid(false).build());
    guests.setColumnWidths(1, 2, 140).setColumnWidth(3, 90).setColumnWidth(4, 260);
  }
  ['RSVPs', 'Log'].forEach(name => {
    const sh = sheet(ss, name);
    style(sh, HEAD.length);
    sh.setColumnWidths(1, 2, 150).setColumnWidths(3, 2, 120).setColumnWidth(5, 200).setColumnWidths(6, 3, 110)
      .setColumnWidths(9, 2, 180).setColumnWidths(11, 2, 240);
  });

  let sum = ss.getSheetByName('Summary');
  if (!sum) {
    const first = ss.getSheets()[0];
    sum = first.getLastRow() === 0 && !/^(Guests|RSVPs|Log)$/.test(first.getName()) ? first.setName('Summary') : ss.insertSheet('Summary');
  }
  if (sum.getLastRow() === 0) {
    sum.getRange('A1').setValue('Headcount').setFontWeight('bold').setFontSize(14);
    sum.getRange('A3:E3').setValues([['Day', 'Guests attending', 'Plus-ones attending', 'Total attending', 'Not attending']])
      .setFontWeight('bold').setBackground('#f3e9dc');
    [['Thursday 6 May', 'F'], ['Friday 7 May', 'G'], ['Saturday 8 May', 'H']].forEach(([day, c], i) => {
      const r = 4 + i, col = 'RSVPs!' + c + '2:' + c;
      sum.getRange('A' + r).setNumberFormat('@').setValue(day);
      sum.getRange('B' + r + ':E' + r).setFormulas([[
        '=COUNTIF(' + col + ',"Attending")',
        '=COUNTIFS(' + col + ',"Attending",RSVPs!I2:I,"<>",RSVPs!I2:I,"<>No")',
        '=B' + r + '+C' + r,
        '=COUNTIF(' + col + ',"Not attending")']]);
    });
    sum.getRange('A8:B10').setFormulas([
      ['Replies received', '=COUNTA(RSVPs!C2:C)'],
      ['Guests on the list', '=COUNTA(Guests!A2:A)'],
      ['Plus-ones offered', '=COUNTIF(Guests!C2:C,"Yes")']]);
    sum.getRange('A8:A10').setFontWeight('bold');
    sum.getRange('A12').setValue('Names in "Also replying for" are free text and aren\'t counted above.').setFontStyle('italic');
    sum.setColumnWidth(1, 170).setColumnWidths(2, 4, 150);
  }
  ss.setActiveSheet(sum);
  ss.moveActiveSheet(1);
}

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
