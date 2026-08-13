# Industrial Muscle Fitness — Gym Management System

Pulled from the live Google Apps Script project + Google Sheet on 2026-08-13.

## Structure

- `apps-script-source/` — **raw, unmodified pull** of the live Apps Script project (via `clasp clone`). This is the exact code currently running in production. Kept as a reference / rollback point.
- `apps-script-source-refactored/` — same system, reorganized for readability. **Not yet pushed to Google** — nothing changes live until you explicitly push this.
- `data/members.csv` — export of the `Members` sheet (28 members) at time of pull.
- `scripts/` — the Node scripts used to do the split (`split-code.js`, `split-html.js`) plus their verifiers (`verify-split.js`, `verify-html-split.js`). Re-run these if you pull a newer version of the live code and want to re-apply the same restructuring.

## What changed in the refactor (logic-preserving only)

- `Code.js` (4,829 lines, ~188 functions in one file) was split into 22 feature modules (`01_Routing.js`, `02_Auth_Session.js`, `06_Members.js`, `20_Bookings.js`, etc.), each function moved **byte-for-byte exact** — verified programmatically against the original (see `scripts/verify-split.js`). Apps Script concatenates all `.js` files into one global scope at deploy time, so this has zero behavioral effect.
- The three largest HTML pages (`Index.html` 4,639 lines, `Client.html`, `TrainerApp.html`) had their inline `<style>` and `<script>` blocks extracted into `_Styles.html` / `_Script.html` partials, pulled back in via Apps Script's `<?!= include('...'); ?>` templating (a small `include()` helper was added to `01_Routing.js`). Verified byte-identical reconstruction (see `scripts/verify-html-split.js`).
- No business logic, sheet names, function signatures, or behavior were changed anywhere.

## Known issue worth fixing before/while migrating to Firebase

The `Members` sheet stores each member's login PIN in **plain text** (`PIN Code` column) right next to a SHA-256 hash of the same PIN (`PIN Hash` column) — see `saveMemberData` in `06_Members.js`. The hash isn't protecting anything today. Should be fixed as part of the Firebase Auth migration.

## Syncing with the live project

```bash
cd apps-script-source
clasp pull    # fetch latest from Google
clasp push    # push local changes to Google (overwrites live code — confirm before running)
```

## Next steps (not started yet)

- Firebase migration (Firestore for data, Firebase Auth for admin/member/trainer login) — deferred per your request.
