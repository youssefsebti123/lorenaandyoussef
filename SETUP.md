# Lorena & Youssef — wedding site

Plain HTML/CSS/JS. No build step, no server, no monthly cost. Everything that goes online is in `docs/` (GitHub Pages publishes that folder).

```
docs/
  index.html         the entrance (arch doors)
  celebration.html   Thu 6 · Fri 7 · Sat 8 May — all three days on one page (#thursday, #friday, #saturday)
  stay.html          hotels, neighbourhood map, getting here, venue (#venue)
  details.html       dress code + good to know
  rsvp.html          the form
  404.html           shown for any wrong link
  assets/config.js   ← the one line you edit (RSVP endpoint)
rsvp-apps-script.gs  ← paste into Google Apps Script (step 1)
```

---

## 1. Connect RSVPs to Google Sheets (10 minutes)

Replies go straight into a Google Sheet you own. Nothing is stored on the website itself.

1. Create a new Google Sheet, e.g. **"L&Y RSVPs"**.
2. **Extensions → Apps Script**. Delete the sample code, paste all of `rsvp-apps-script.gs`, click **Save**.
   - Optional: set `NOTIFY_EMAIL` at the top to your address to get an email for every reply.
3. **Deploy → New deployment →** gear icon **→ Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**, approve the Google permissions (it needs the sheet + sending email as you), and copy the **Web app URL** (ends in `/exec`).
5. Open `docs/assets/config.js` and paste it between the quotes:
   ```js
   window.RSVP_ENDPOINT = 'https://script.google.com/macros/s/AKfy…/exec';
   ```
6. Test: open the URL from step 4 in a browser — you should see `{"ok":true,"service":"rsvp"}`. Then send a test RSVP from the site and check the sheet.

What you get in the sheet:
- **RSVPs** tab — one row per guest (matched on name + email). If they send the form again, that row is updated and the *Updated* column is stamped.
- **Log** tab — every submission ever received, so nothing is lost.
- Guests get a plain-text copy of their reply by email (turn off with `SEND_CONFIRMATION = false`). Gmail allows ~100 of these a day on a free account; if you hit the limit the reply is still saved.

If you change the script later, use **Deploy → Manage deployments → Edit → Version: New version** so the URL stays the same.

Until step 5 is done, the RSVP page shows a banner saying replies can't be sent — so you can't accidentally publish a form that silently drops answers.

---

## 2. Domain & hosting

- **Domain:** `lorenaandyoussef.com`, registered at Porkbun on 14 Nov 2026, expires 14 Nov 2027 — keep auto-renew on until after the wedding.
- **Hosting:** GitHub Pages, publishing the `docs/` folder of this repo. Free, HTTPS included. `docs/CNAME` holds the domain.
- **To update the site:** edit files in `docs/`, commit, push to `main`. It's live about a minute later.
- **DNS at Porkbun** (Domain Management → DNS) — set on 14 Nov 2026:

  | Type | Host | Answer |
  |---|---|---|
  | ALIAS | *(blank)* | youssefsebti123.github.io |
  | CNAME | www | youssefsebti123.github.io |

  These replaced Porkbun's parking records (`uixie.porkbun.com`). The MX/TXT records Porkbun added for email forwarding were left as they are.

The site tells search engines not to index it (`robots.txt` + `noindex`), so it only reaches people you send the link to.

---

## What was fixed from the mockup

**Navigation**
- Every page has a real address (`/stay.html`, `/celebration.html#saturday`), so links shared on WhatsApp land on the right page and the browser Back button works. The old version rewrote the address without history, so Back left the site and pasted links only worked on first load.
- Friday and Saturday were hidden behind tabs inside Celebration that always opened on Thursday. All three days are now on one page with a sticky Thu/Fri/Sat bar.
- The home page had no way to reach a page except its door, and on phones the doors were 9px labels in a strip. Doors are now a 2×2 grid on mobile; every interior page has the full menu.
- Removed hidden-only navigation (arrow keys / Escape), and the duplicated "Back to the celebration" + "Next" footers.
- "Venue & directions" pointed to two different places. It now always goes to the venue section, which has a Google Maps directions link and the venue website.

**Content**
- No year anywhere — now "Saturday 8 May 2027", with Thu 6 / Fri 7 dates.
- Booking.com links were pre-set to **2–5 May**, i.e. checking out before the wedding. Now 6 → 9 May, and the tracking junk is stripped.
- Hotels 1–3 appear on the map, 4–6 don't (no coordinates) — now labelled "on the map" so the numbering doesn't confuse.
- "Kindly reply by 31 December" → "31 December 2026".

**RSVP**
- The old form said "Your reply has been saved" even when nothing was connected, and couldn't tell if the send failed. Now it only confirms after the sheet answers OK, and shows a clear error otherwise.
- "Email for confirmation" never sent anything — it now does.
- Added "Also replying for" (couples on one invitation), returning guests see their answers and can edit, plus spam and spreadsheet-formula protection.

## Still yours to fill in
- Dress codes (Details page) and Thursday's meeting point / dinner restaurant.
- A WhatsApp number or link if you want "Message us on WhatsApp" to be clickable.
- "Taxis and ride-hailing apps run to the venue" — worth confirming which apps actually operate in Marrakech in 2027 before naming any.

## Preview locally
```bash
python3 -m http.server 4200 --directory docs
```
then open http://localhost:4200.
