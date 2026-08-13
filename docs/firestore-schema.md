# Firestore schema — mapped from the original 14 Google Sheets

Source of truth for column layouts: the `ensureXSheet_()` header rows in
`apps-script-source-refactored/`. This is the fixed contract later phases of
the Firebase migration build against. Only **members** and its auth-adjacent
pieces (**admins**, **trainers** for login/PIN purposes, **rateLimits**,
**auditLog**, **config**, **counters**) are implemented in Cloud Functions
so far — everything else here is schema-only until its module is ported.

General rules applied throughout:
- Dates are stored as plain `"yyyy-MM-dd"` strings, matching what the original
  already formatted before sending to the client (avoids timezone bugs).
- Timestamps (`Timestamp` columns) become Firestore `serverTimestamp()` values.
- Sheet row numbers (used as implicit foreign keys, e.g. "Member Row") are
  replaced by the referenced document's Firestore auto-ID.
- No collection stores a plaintext PIN or password — hash only.

| Sheet | Firestore collection | Status |
|---|---|---|
| Members | `members` | ✅ implemented |
| Admins | `admins` | ✅ implemented |
| Trainers | `trainers` | ✅ implemented (login/PIN fields only — full CRUD not ported) |
| AuditLog | `auditLog` | ✅ implemented |
| Logs (check-in) | `checkinLogs` | ✅ implemented |
| Packages | `packages` | ⏳ schema only |
| Payments | `payments` | ✅ implemented (write path from `saveMemberData` only) |
| DailyPayments | `dailyPayments` | ⏳ schema only |
| DailyPaymentOverrides | `dailyPaymentOverrides` | ⏳ schema only |
| Expenses | `expenses` | ⏳ schema only |
| Bookings | `bookings` | ⏳ schema only |
| Waitlist | `waitlist` | ⏳ schema only |
| Coupons | `coupons` | ⏳ schema only |
| Products | `products` | ⏳ schema only |

Plus new supporting collections with no sheet equivalent: `rateLimits` (login
throttling), `counters` (receipt numbering), `config` (singleton settings
docs — birthday discount, daily pass prices, LINE settings, etc., one doc
per setting group, replacing `PropertiesService`).

---

## `members` — doc ID: auto

Phone is **not unique** in the source data (two existing members already
share a number), so it stays a queryable field, not the doc key.

```
fullName, phone, email, package, startDate, expiryDate, fingerprintId,
status, checkInCount, referralCode, referredBy, referralRewardGiven,
cardChangeCount, freezeStartDate, pinHash, dob, lineUserId, lineLinkCode,
expiryLineNotifiedFor, birthdayLineNotifiedYear, winbackCouponCode,
createdAt
```
Dropped vs. the sheet: the plaintext `PIN Code` column.

## `admins` — doc ID: auto, `username` field queried

```
username, passwordHash, role, email
```

## `trainers` — doc ID: auto, `trainerId` kept as the original business key

```
trainerId, fullName, specialty, phone, workingDays, startHour, endHour,
slotMinutes, status, photoUrl, bio, pinHash, busyStatus, busySince, email,
lineUserId, lineLinkCode, createdAt
```
Dropped vs. the sheet: the plaintext `PIN Code` column. `trainerId` is
referenced by `bookings`/`waitlist`/LINE notifications exactly like before.

## `auditLog` — doc ID: auto

```
timestamp, user, action, target, details
```

## `checkinLogs` — doc ID: auto (replaces the `Logs` sheet)

```
timestamp, name, fingerprintId, status, details
```

## `packages` — doc ID: **the package name itself** (e.g. `"Standard Monthly"`)

Using the name as the key gives O(1) price lookup (`getPackagePrice_` in
`02_members.js` already reads it this way) instead of the original's
full-sheet scan into an in-memory map.

```
price, durationMonths, status
```

## `payments` — doc ID: auto, `receiptNo` field queried

```
timestamp, memberName, package, qrData, newExpiryDate, receiptNo, amount,
refundStatus, refundReason, refundedBy, refundedAt, paymentMethod
```

## `dailyPayments` — doc ID: auto, `receiptNo` field queried

```
timestamp, customerName, phone, amount, receiptNo, itemsJson,
refundStatus, refundReason, refundedBy, refundedAt, paymentMethod
```

## `dailyPaymentOverrides` — doc ID: **the date itself** (`"yyyy-MM-dd"`)

Natural key — the original looked these up by date.

```
cash, transfer, updatedBy, updatedAt, membership, dayPass, products
```

## `expenses` — doc ID: auto

```
timestamp, date, description, amount, addedBy
```

## `bookings` — doc ID: auto, `memberDocId` replaces "Member Row"

```
timestamp, bookingId, trainerId, trainerName, memberDocId, memberName,
memberPhone, date, timeSlot, status, notes
```

## `waitlist` — doc ID: auto, `memberDocId` replaces "Member Row"

```
timestamp, trainerId, trainerName, memberDocId, memberName, memberPhone,
date, timeSlot, status
```

## `coupons` — doc ID: **the coupon code itself**, uppercased

O(1) validation lookup instead of a sheet scan.

```
discountType, discountValue, usageLimit, usedCount, expiryDate,
minPurchaseAmount, applicableTo, status, description
```

## `products` — doc ID: auto, `productId` field kept as the original business key

```
productId, name, category, price, status, stock, lowStockThreshold
```

---

## Supporting collections (no sheet equivalent)

## `rateLimits` — doc ID: the throttle key (e.g. `"member_0812345678"`)

```
count, lockedUntil, updatedAt
```

## `counters` — doc ID: e.g. `"receipts_2026"`

```
value
```

## `config` — one doc per setting group (replaces `PropertiesService`)

Implemented so far: `config/birthdayDiscount` — `{ type, value }`.
Documented for later: `config/dailyPassPrices`, `config/lineSettings`,
`config/paymentQr`, `config/autoExpire`, `config/winback`,
`config/memberLineNotify`, `config/backup`.
