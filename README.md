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

## Firebase migration status

Real Firebase project: **`industrial-muscle-fitness`** (Spark plan), linked as the
`default` alias in `firebase/.firebaserc`. `demo-industrial-muscle` stays available
as the `demo` alias for local emulator work (no login/billing needed for that).

Done against the real project:
- Firestore database created (`asia-southeast1`), security rules + indexes deployed.
- Authentication provisioned.
- All 28 real members migrated in (`node scripts/migrate-members-to-firestore.js --prod`).

Not done yet:
- **Cloud Functions are not deployed** — they require upgrading the project to the
  Blaze (pay-as-you-go) plan first. Local dev/testing works fine without it via
  `firebase emulators:start` (see below).
- Only the Auth + Members modules are ported (see `docs/firestore-schema.md` for
  what's schema-only vs. implemented). 20 modules remain.

## Frontend (`firebase/hosting/`)

New pages built against the Auth + Members backend (plain ES modules + the
Firebase SDK from CDN, no build step):

- `login.html` / `member-login.html` — admin and member login, same visual
  design as the original `Login.html` / `MemberLogin.html`.
- `admin/members.html` — member list, add/edit/delete, manual check-in.
- `member/index.html` — member's own profile, payment history, PIN change.
- `shared/firebase-init.js` — Firebase app/auth/functions init + a
  `callServer()` helper. Auto-connects to the local emulator suite when
  served from `localhost`, talks to the real project otherwise — same code
  both ways, no separate "dev" build.

Not built yet: everything the other 20 backend modules would power
(trainers, bookings, payments, coupons, LINE, reports, etc.) — the admin
dashboard only covers what `02_members.js` implements today.

### Running it locally

```bash
cd firebase
firebase emulators:start --only firestore,auth,functions,hosting --project industrial-muscle-fitness
# in another terminal, seed data into the running emulator:
cd ..
GCLOUD_PROJECT=industrial-muscle-fitness node scripts/migrate-members-to-firestore.js
```
Then open `http://localhost:5000/login.html`. There's no admin account in a
fresh emulator — create one by hand (Firestore emulator UI at
`http://localhost:4000/firestore`, `admins` collection, fields `username`,
`passwordHash` [sha256 hex of the password — see `firebase/functions/src/util/hash.js`],
`role`, `email`).

Local machine setup notes (for reference): Firestore emulator needed a Java 21
JDK (Eclipse Temurin, installed via winget) since only Java 8 was present.
Deploying to the real project needed `gcloud auth application-default login`
(Google Cloud SDK, installed via winget) for Application Default Credentials —
the Firebase CLI's own login is a separate credential store from ADC.
