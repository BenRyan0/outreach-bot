# Offer Outreach — Strategy & Action Plan

## Context

The existing system handles one segment: applicants with **missing documents**.  
This plan covers applicants who already have an **approved offer** — they are in the
`approved-applications` collection via the `ApprovedApplication` model.

Two sub-cases exist within this segment:

| Sub-case | Description |
|---|---|
| **New offer, never contacted** | Record exists in `approved-applications` but outreach has never been sent |
| **Clean applicant** | Applicant never had missing documents — went straight to offer without entering the missing-doc pipeline |

Both sub-cases get the same outreach treatment: send the pre-formatted offer email.

---

## 1. Existing Model (already implemented — do not change)

```js
// models/ApprovedApplication.js  →  collection: approved-applications
const approvedApplicationSchema = new mongoose.Schema(
  {
    job_id:     { type: String, required: true, unique: true },
    email:      { type: String, required: true },
    first_name: String,
    last_name:  String,
    topic:      String,   // ← becomes the email subject line
    message:    String,   // ← contains the full pre-written offer body
    join_url:   String,   // ← Zoom meeting link for offer review call
    password:   String,   // ← Zoom meeting password
  },
  { timestamps: true }
);
```

### Sample inbound record

```json
{
  "job_id":    "Jjb8bH",
  "email":     "jaurdeemosttler@gmail.com",
  "first_name": "Jaurdee",
  "topic":     "Review and Acceptance of Financing Offer",
  "message":   "Hi [Client Name],\n\nI'm pleased to share that your financing deal with Jaurdyns Pathways has been approved by Vader Mountain Capital! Here are the key terms of the offer:\n\n- Soft Offer: $5,000.00\n- Buy Rate: 1.36\n- Term Length: 95 days\n- Max Upsell: 12.00 points\n\nPlease let us know if you wish to proceed with the contract. Keep in mind that the offer is valid for 30 days and any changes should be requested before finalizing the contract.\n\nBest regards,\n\n[Your Name]",
  "join_url":  "https://us05web.zoom.us/j/88698310645?pwd=...",
  "password":  "MkJ6jy"
}
```

**Key observations about the `message` field:**
- Contains `[Client Name]` placeholder — must be replaced with `first_name` before sending.
- Contains `[Your Name]` placeholder — must be replaced with the sender signature.
- Offer validity ("valid for 30 days") is already embedded in the message text — no separate `expires_at` date field exists.

---

## 2. Outreach Tracking — Separate Model

The `ApprovedApplication` schema has no `outreach` subdoc and must not be changed.  
Outreach state is tracked in a **separate collection** keyed by `job_id`.

```js
// models/ApprovedApplicationOutreach.js  →  collection: approved-application-outreach
const approvedApplicationOutreachSchema = new mongoose.Schema(
  {
    job_id:              { type: String, required: true, unique: true },
    messaged:            { type: Boolean, default: false },
    messaged_at:         { type: Date,    default: null  },
    attempts:            { type: Number,  default: 0     },
    last_error:          { type: String,  default: null  },
    reset_at:            { type: Date,    default: null  },
    conversation_id:     { type: String,  default: null  },   // Graph thread ID for reply matching
    internet_message_id: { type: String,  default: null  },
    reply_received:      { type: Boolean, default: false },
    reply_received_at:   { type: Date,    default: null  },
    reply_count:         { type: Number,  default: 0     },
  },
  { timestamps: true }
);
```

**File path:** `models/ApprovedApplicationOutreach.js`

A record in this collection is created/upserted the first time outreach is attempted for a given `job_id`.  
Absence of a document = never contacted.

---

## 3. Email Content Strategy

No custom template file is needed. The `message` field already contains the full offer body
written by the upstream system. The outreach job only needs to:

1. Replace `[Client Name]` with `record.first_name` (or `"there"` if missing).
2. Replace `[Your Name]` with the sender signature block.
3. Append the Zoom meeting details (join URL + password) as a separate paragraph.

**Subject line:** use `record.topic` directly (e.g., `"Review and Acceptance of Financing Offer"`).

### Final email structure

```
{record.message — with [Client Name] and [Your Name] substituted}

──────────────────────────────────
Schedule your offer review call:
Join: {record.join_url}
Password: {record.password}
──────────────────────────────────
```

### Signature replacement value

```
Talk soon,
Sarah Mitchell
Luna Lending
```

The sender address is `funding@lunalend.net` — a shared inbox, not a personal address.
The display name shown in the recipient's email client should be set to **"Sarah Mitchell"**
via the `from` field in the Graph API send call (e.g. `"Sarah Mitchell <funding@lunalend.net>"`).
This creates a consistent persona tied to the single funding inbox.

This keeps the email fully consistent with what the upstream deal team already wrote —
no separate template system needed.

---

## 4. Outreach Job

**File path:** `outreach/offerOutreach.js`

Runs independently from `runOutreachJob` (the missing-doc runner).

### Daily sending limit

Controlled by a single env var:

```
OFFER_OUTREACH_DAILY_LIMIT=20
```

The job counts how many offer emails have been sent **since midnight UTC today** by querying
`ApprovedApplicationOutreach` where `messaged_at >= start-of-today`. If that count is already
at or above the limit, the job exits immediately without sending anything.
If headroom remains, it sends up to `limit - alreadySentToday` records before stopping.

This prevents flooding if a large batch of offers is pushed at once, and makes the cap easy
to tune without a code deploy.

### Logic

```
1. Count ApprovedApplicationOutreach docs where messaged=true AND messaged_at >= today 00:00 UTC.
2. If count >= OFFER_OUTREACH_DAILY_LIMIT → log "daily limit reached" and exit.
3. Compute remaining = OFFER_OUTREACH_DAILY_LIMIT - count.
4. Fetch up to `remaining` ApprovedApplication records that have no messaged=true outreach doc.
5. For each:
   a. Replace [Client Name] → record.first_name || "there"
   b. Replace [Your Name]  → "Talk soon,\nSarah Mitchell\nLuna Lending"
   c. Set From display name → "Sarah Mitchell <funding@lunalend.net>"
   d. Append Zoom block (join_url + password) if both fields are present
   e. Subject = record.topic
   f. To      = record.email
6. Increment attempts in the outreach doc (upsert) before sending.
7. Call sendAndTrack() via the existing Graph API layer.
8. Write back: messaged=true, messaged_at, conversation_id, internet_message_id.
9. Log sent / skipped / failed / daily-limit-remaining.
```

### Efficiency note

Step 1+2 can be combined with a pipeline:

```js
// Find all approved-applications that have NO outreach doc with messaged:true
const contacted = await ApprovedApplicationOutreach
  .find({ messaged: true }, { job_id: 1 }).lean();
const contactedIds = new Set(contacted.map(d => d.job_id));

const candidates = await ApprovedApplication
  .find({ job_id: { $nin: [...contactedIds] } }).lean();
```

---

## 5. API Routes

Add to `server.js` (or a new `routes/approvedApplications.js`):

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/approved-applications` | Upsert an approved application record |
| `GET` | `/approved-applications/status` | List all records + their outreach state |
| `GET` | `/approved-applications/:job_id` | Get a single record + outreach state |
| `POST` | `/approved-applications/outreach/reset/:job_id` | Clear outreach flags for a re-send |
| `GET` | `/approved-applications/outreach/test/:job_id` | Dry-run — log rendered email, do not send |

The `POST /approved-applications` upsert follows the same pattern as `POST /missing-docs`:

```js
await ApprovedApplication.findOneAndUpdate(
  { job_id: payload.job_id },
  payload,
  { upsert: true, new: true, runValidators: true }
);
```

---

## 6. Webhook / Reply Tracking

Extend the existing `handleReply()` function in `server.js` to also check the
`ApprovedApplicationOutreach` collection by `conversation_id`.

**Current flow:**
```
handleReply(message)
  → find MissingDoc by conversation_id
  → save AppFollowUpReplies
  → update MissingDoc.outreach.reply_*
```

**Updated flow:**
```
handleReply(message)
  → find MissingDoc by conversation_id           [existing]
  → if no MissingDoc match:
      find ApprovedApplicationOutreach by conversation_id  [new]
  → save AppFollowUpReplies (job_id from whichever matched)
  → update the matched doc's reply_received / reply_count
```

No new reply collection needed — `AppFollowUpReplies` already stores `job_id` and works for both.

---

## 7. Scheduler Integration

In `server.js`, alongside the existing `runOutreachJob` wiring:

```js
const { runOfferOutreachJob } = require("./outreach/offerOutreach");
const ApprovedApplication         = require("./models/ApprovedApplication");
const ApprovedApplicationOutreach = require("./models/ApprovedApplicationOutreach");

// On startup
runOfferOutreachJob(ApprovedApplication, ApprovedApplicationOutreach)
  .catch(err => console.error("[offer-outreach] Startup error:", err.message));

// On interval
const OFFER_INTERVAL = parseInt(process.env.OFFER_OUTREACH_INTERVAL_MS) || INTERVAL;
setInterval(() => {
  runOfferOutreachJob(ApprovedApplication, ApprovedApplicationOutreach)
    .catch(err => console.error("[offer-outreach] Scheduled error:", err.message));
}, OFFER_INTERVAL);
```

Use a separate env var `OFFER_OUTREACH_INTERVAL_MS` so the two jobs can be tuned independently.

---

## 8. Implementation Sequence

Do these in order — each step is testable before the next:

1. **Outreach model** — create `models/ApprovedApplicationOutreach.js`
2. **Outreach runner** — create `outreach/offerOutreach.js` with `OUTREACH_TEST_MODE` support
3. **API routes** — add the five routes above to `server.js`
4. **Webhook update** — extend `handleReply()` to check `ApprovedApplicationOutreach`
5. **Scheduler** — wire `runOfferOutreachJob` into the startup block
6. **Test** — POST a sample record, call `/approved-applications/outreach/test/:job_id`
   with `OUTREACH_TEST_MODE=true`, verify the rendered email looks correct before going live

---

## Open Questions (resolve before implementation)

1. **Daily limit default** — what should `OFFER_OUTREACH_DAILY_LIMIT` default to if the env var
   is not set? Suggested: `20`. Confirm or adjust.
2. **Zoom block** — should the join URL and password always be appended, or only when both fields
   are populated on the record?
3. **Re-send on updated offer** — if a `job_id` is re-POSTed with a revised `message`/`topic`,
   should the outreach doc auto-reset so the new offer gets sent, or require a manual reset?
4. **Reply tracking model** — confirm reusing `AppFollowUpReplies` (Option A) is acceptable
   rather than a separate offer-replies collection.
5. **Interval** — confirm whether offer outreach should share `OUTREACH_INTERVAL_MS` or get
   its own `OFFER_OUTREACH_INTERVAL_MS` env var.
