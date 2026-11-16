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
  assets/config.js   ← where RSVPs go (Supabase project URL + public key)
supabase/schema.sql  ← the database: tables, headcount views and the 3 functions the form calls
```

---

## 1. RSVPs → Supabase (since 16 Nov 2026)

Replies go into a free Supabase database. Nothing is stored on the website itself.

- **Dashboard:** [supabase.com/dashboard](https://supabase.com/dashboard/project/aiacsujoqmhdwlkfodjw) → organisation **Lorena & Youssef** (free plan, separate from Caselane) → project **wedding-rsvp** (Frankfurt). Sign in with GitHub.
- **Table editor** (left sidebar → grid icon):
  - **guests** — the invite list (129 people, imported from Joy via the old sheet). Edit rows right there: `first`, `last`, `plus_ones` (0 = none, 1 = a plus-one, 2+ = up to that many extra guests), `notes`. Changes apply to the form immediately.
  - **rsvps** — one row per guest (matched on name + email). Sending the form again updates the row and sets `updated_at`. `extra_guests` = how many they're bringing (empty if they weren't offered any), `guest_names` lists them.
  - **log** — every submission ever received, so nothing is lost when someone edits their reply.
  - **headcount** — live totals per day (guests + extra guests). **overview** — replies received, guests on the list, extra spots offered, and how many haven't replied yet.
  - Any table → **Export → CSV** to open it in Sheets/Excel.
- **How the form talks to it:** `docs/assets/config.js` holds the project URL and the *publishable* key, which is public by design. That key can only call three functions — `search_guests` (Find your name: names only, up to 10, after 3+ letters), `guest_extras` (how many guests a name may bring) and `submit_rsvp` (validates and saves; caps extra guests at the list's number). It can't read the tables; tested.
- **Changing the database:** edit `supabase/schema.sql` and run it in the dashboard's **SQL editor**. It's safe to re-run.
- **No confirmation emails** for now (the form shows guests their answers on screen and they can edit later from the same device). To add them: a Resend/Brevo key stored in Supabase Vault as `resend_api_key` — `submit_rsvp` already sends one when that secret exists (from `rsvp@lorenaandyoussef.com`, which needs the sending domain verified).
- **Free-plan pause:** Supabase pauses a free project after 7 days without any requests. Guests using the form count as activity. If it does pause, Supabase emails you first and **Restore** in the dashboard brings it back with all data. To prevent it entirely, run `gh auth refresh -h github.com -s workflow` once and ask for the daily keep-alive GitHub Action.

The old Google setup (sheet "Lorena & Youssef RSVPs" + Apps Script "RSVP receiver") is no longer used by the site; it's in git history if ever needed.

If `config.js` ever has no URL/key, the RSVP page shows a banner saying replies can't be sent — so you can't accidentally publish a form that silently drops answers.

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
- The old form said "Your reply has been saved" even when nothing was connected, and couldn't tell if the send failed. Now it only confirms after the database answers OK, and shows a clear error otherwise.
- "Email for confirmation" never sent anything. The email field is now just for contacting guests (no confirmation emails yet — see section 1).
- Added "Also replying for" (couples on one invitation), returning guests see their answers and can edit, plus spam protection, a Find-your-name search and multiple extra guests per invitation.

## Still yours to fill in
- Dress codes (Details page) and Thursday's meeting point / dinner restaurant.
- A WhatsApp number or link if you want "Message us on WhatsApp" to be clickable.
- "Taxis and ride-hailing apps run to the venue" — worth confirming which apps actually operate in Marrakech in 2027 before naming any.

## Preview locally
```bash
python3 -m http.server 4200 --directory docs
```
then open http://localhost:4200.
