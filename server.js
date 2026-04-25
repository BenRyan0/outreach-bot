require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const { Client } = require("@microsoft/microsoft-graph-client");
require("isomorphic-fetch");
const { classify } = require("./classifier");
const { runOutreachJob } = require("./outreach");
const { getAccessToken } = require("./graph/auth");
const AppFollowUpReplies = require("./models/AppFollowUpReplies");
const ApprovedApplication         = require("./models/ApprovedApplication");
const ApprovedApplicationOutreach = require("./models/ApprovedApplicationOutreach");
const { runOfferOutreachJob }     = require("./outreach/offerOutreach");
const { getDailyAllocation }      = require("./outreach/dailyLimit");
const { appendReply, upsertSentRow, backfillRepliesForJob, MISSING_DOCS_SHEET, APPROVED_SHEET, initSheets } = require("./sheets/googleSheets");

const app = express();
app.use(express.json());

const statementSchema = new mongoose.Schema({
  filename: String,
  account_holder_name: String,
  account_type: String,
  total_deposits: Number,
  statement_date: String,
  mca_details: [mongoose.Schema.Types.Mixed],
});

const missingDocSchema = new mongoose.Schema(
  {
    job_id: { type: String, required: true, unique: true },
    status: { type: String },
    user_details: {
      userid: String,
      vat: String,
      company: String,
      date_of_birth: String,
      ssn: String,
      email: String,
      first_name: String,
      last_name: String,
    },
    statements_count: Number,
    has_minimum_statements: Boolean,
    is_recent: Boolean,
    is_ssn_valid: Boolean,
    is_vat_valid: Boolean,
    average_deposits: Number,
    name_match_status: String,
    statements: [statementSchema],
    final_bucket: String,
    note: mongoose.Schema.Types.Mixed,
    missing_fields: [String],
    form_link: { type: String, default: null },
    outreach: {
      messaged:            { type: Boolean, default: false },
      messaged_at:         { type: Date,    default: null  },
      template_key:        { type: String,  default: null  },
      attempts:            { type: Number,  default: 0     },
      last_error:          { type: String,  default: null  },
      reset_at:            { type: Date,    default: null  },
      conversation_id:     { type: String,  default: null  },
      internet_message_id: { type: String,  default: null  },
      reply_received:      { type: Boolean, default: false },
      reply_received_at:   { type: Date,    default: null  },
      reply_count:         { type: Number,  default: 0     },
    },
  },
  { timestamps: true }
);

const MissingDoc = mongoose.model("MissingDoc", missingDocSchema, "missing-docs");

app.post("/missing-docs", async (req, res) => {
  try {
    const { _id, createdAt, updatedAt, __v, ...payload } = req.body;
    const doc = await MissingDoc.findOneAndUpdate(
      { job_id: payload.job_id },
      payload,
      { upsert: true, new: true, runValidators: true }
    );
    res.status(200).json({ success: true, id: doc._id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/gap-analysis/:job_id", async (req, res) => {
  try {
    const record = await MissingDoc.findOne({ job_id: req.params.job_id }).lean();
    if (!record) return res.status(404).json({ success: false, error: "Record not found" });
    const result = await classify(record);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/outreach/test/:job_id", async (req, res) => {
  try {
    const record = await MissingDoc.findOne({ job_id: req.params.job_id }).lean();
    if (!record) return res.status(404).json({ success: false, error: "Record not found" });

    const result = await classify(record);

    const to = record.user_details?.email ?? "N/A";
    const subject = "Your Luna Lending Application — Action Required";

    console.log(`\n[outreach:test] ────────────────────────────────────────`);
    console.log(`[outreach:test] job_id        : ${record.job_id}`);
    console.log(`[outreach:test] to            : ${to}`);
    console.log(`[outreach:test] subject       : ${subject}`);
    console.log(`[outreach:test] outreach_req  : ${result.outreach_required}`);
    console.log(`[outreach:test] template_key  : ${result.template_key ?? "none"}`);
    if (result.rendered_message) {
      console.log(`[outreach:test] message:\n`);
      console.log(result.rendered_message.split("\n").map((l) => `  ${l}`).join("\n"));
    }
    console.log(`[outreach:test] ────────────────────────────────────────\n`);

    res.json({
      success: true,
      job_id: record.job_id,
      to,
      subject,
      outreach_required: result.outreach_required,
      template_key: result.template_key ?? null,
      rendered_message: result.rendered_message ?? null,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/replies", async (req, res) => {
  try {
    const filter = {};
    if (req.query.job_id) filter.job_id = req.query.job_id;
    if (req.query.from)   filter.from   = req.query.from;

    const replies = await AppFollowUpReplies.find(filter, {
      _id: 0,
      messageId: 1,
      conversationId: 1,
      job_id: 1,
      from: 1,
      subject: 1,
      bodyPreview: 1,
      bodyContent: 1,
      receivedAt: 1,
    })
      .sort({ receivedAt: -1 })
      .lean();

    res.json({ success: true, count: replies.length, replies });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/outreach/status", async (req, res) => {
  try {
    const filter = {};
    if (req.query.messaged === "true")  filter["outreach.messaged"] = true;
    if (req.query.messaged === "false") filter["outreach.messaged"] = { $ne: true };

    const docs = await MissingDoc.find(filter, {
      job_id: 1,
      status: 1,
      "user_details.email": 1,
      "user_details.first_name": 1,
      "user_details.last_name": 1,
      outreach: 1,
    }).lean();

    res.json({ success: true, count: docs.length, leads: docs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/outreach/reset/:job_id", async (req, res) => {
  try {
    const doc = await MissingDoc.findOneAndUpdate(
      { job_id: req.params.job_id },
      {
        "outreach.messaged":     false,
        "outreach.messaged_at":  null,
        "outreach.template_key": null,
        "outreach.last_error":   null,
        "outreach.reset_at":     new Date(),
        // attempts intentionally preserved — full history is never destroyed
      },
      { new: true }
    );

    if (!doc) return res.status(404).json({ success: false, error: "Record not found" });

    res.json({ success: true, job_id: doc.job_id, outreach: doc.outreach });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Approved Applications ────────────────────────────────────────────────────

app.post("/approved-applications", async (req, res) => {
  try {
    const { _id, createdAt, updatedAt, __v, ...payload } = req.body;
    const doc = await ApprovedApplication.findOneAndUpdate(
      { job_id: payload.job_id },
      payload,
      { upsert: true, new: true, runValidators: true }
    );
    res.status(200).json({ success: true, id: doc._id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/approved-applications/status", async (req, res) => {
  try {
    const apps = await ApprovedApplication.find().lean();
    const outreachDocs = await ApprovedApplicationOutreach.find().lean();
    const outreachMap = Object.fromEntries(outreachDocs.map((o) => [o.job_id, o]));

    const leads = apps.map((a) => ({
      job_id:     a.job_id,
      email:      a.email,
      first_name: a.first_name,
      last_name:  a.last_name,
      topic:      a.topic,
      outreach:   outreachMap[a.job_id] ?? null,
    }));

    res.json({ success: true, count: leads.length, leads });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/approved-applications/:job_id", async (req, res) => {
  try {
    const app     = await ApprovedApplication.findOne({ job_id: req.params.job_id }).lean();
    if (!app) return res.status(404).json({ success: false, error: "Record not found" });
    const outreach = await ApprovedApplicationOutreach.findOne({ job_id: req.params.job_id }).lean();
    res.json({ success: true, ...app, outreach: outreach ?? null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/approved-applications/outreach/reset/:job_id", async (req, res) => {
  try {
    const doc = await ApprovedApplicationOutreach.findOneAndUpdate(
      { job_id: req.params.job_id },
      {
        messaged:     false,
        messaged_at:  null,
        last_error:   null,
        reset_at:     new Date(),
      },
      { new: true }
    );
    if (!doc) return res.status(404).json({ success: false, error: "Outreach record not found" });
    res.json({ success: true, job_id: doc.job_id, outreach: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/approved-applications/outreach/test/:job_id", async (req, res) => {
  try {
    const record = await ApprovedApplication.findOne({ job_id: req.params.job_id }).lean();
    if (!record) return res.status(404).json({ success: false, error: "Record not found" });

    const name    = record.first_name || "there";
    const SIGN    = "Talk soon,\nSarah Mitchell\nLuna Lending";
    let body      = (record.message || "")
      .replace(/\[Client Name\]/gi, name)
      .replace(/\[Name\]/gi, name)
      .replace(/\[Your Name\]/gi, SIGN);

    if (record.join_url && record.password) {
      body +=
        "\n\n──────────────────────────────────────\n" +
        "Schedule your offer review call:\n" +
        `Join: ${record.join_url}\n` +
        `Password: ${record.password}\n` +
        "──────────────────────────────────────";
    }

    const subject = record.topic || "Your Luna Lending Offer";

    console.log(`\n[offer-outreach:test] ────────────────────────────────────────`);
    console.log(`[offer-outreach:test] job_id  : ${record.job_id}`);
    console.log(`[offer-outreach:test] to      : ${record.email}`);
    console.log(`[offer-outreach:test] subject : ${subject}`);
    console.log(`[offer-outreach:test] message:\n`);
    console.log(body.split("\n").map((l) => `  ${l}`).join("\n"));
    console.log(`[offer-outreach:test] ────────────────────────────────────────\n`);

    res.json({ success: true, job_id: record.job_id, to: record.email, subject, rendered_message: body });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Webhook: receive Graph inbox notifications ──────────────────────────────
app.post("/webhook/replies", async (req, res) => {
  // Microsoft validation handshake
  if (req.query.validationToken) {
    return res.status(200).send(req.query.validationToken);
  }

  // Acknowledge immediately — Graph requires a fast 202 response
  res.sendStatus(202);

  const notifications = req.body.value || [];
  for (const notification of notifications) {
    if (notification.clientState !== process.env.WEBHOOK_SECRET) {
      console.warn("[webhook] Invalid clientState — ignoring");
      continue;
    }
    try {
      const token = await getAccessToken();
      const client = Client.init({ authProvider: (done) => done(null, token) });
      const message = await client
        .api(`/users/${process.env.SENDER_EMAIL}/messages/${notification.resourceData.id}`)
        .select("id,subject,from,receivedDateTime,conversationId,bodyPreview,body")
        .get();
      await handleReply(message);
    } catch (err) {
      console.error("[webhook] Error processing notification:", err.message);
    }
  }
});

async function handleReply(message) {
  const from = message.from.emailAddress.address;

  // Try to link the reply to a missing-doc lead first, then an offer lead
  const missingDocLead = await MissingDoc.findOne({
    "outreach.conversation_id": message.conversationId,
  });

  const offerOutreachDoc = missingDocLead
    ? null
    : await ApprovedApplicationOutreach.findOne({ conversation_id: message.conversationId });

  const job_id = missingDocLead?.job_id ?? offerOutreachDoc?.job_id ?? null;

  // Upsert by messageId — Graph sometimes fires duplicate notifications for the same message.
  // $setOnInsert means the fields are only written on a genuine new insert.
  const result = await AppFollowUpReplies.updateOne(
    { messageId: message.id },
    {
      $setOnInsert: {
        messageId:      message.id,
        conversationId: message.conversationId,
        job_id,
        subject:        message.subject,
        from,
        bodyPreview:    message.bodyPreview,
        bodyContent:    message.body?.content ?? null,
        receivedAt:     new Date(message.receivedDateTime),
      },
    },
    { upsert: true }
  );

  // upsertedCount === 0 means this messageId was already saved — duplicate notification, skip.
  if (result.upsertedCount === 0) {
    console.log(`[webhook] Duplicate notification ignored — messageId already stored`);
    return;
  }

  const replyText = message.bodyPreview || "";

  if (missingDocLead) {
    await MissingDoc.updateOne(
      { _id: missingDocLead._id },
      {
        "outreach.reply_received":    true,
        "outreach.reply_received_at": new Date(),
        $inc: { "outreach.reply_count": 1 },
      }
    );
    await appendReply(MISSING_DOCS_SHEET, missingDocLead.job_id, replyText);
    console.log(`[webhook] Reply linked (missing-doc) → job_id=${missingDocLead.job_id} from=${from}`);
  } else if (offerOutreachDoc) {
    await ApprovedApplicationOutreach.updateOne(
      { _id: offerOutreachDoc._id },
      {
        reply_received:    true,
        reply_received_at: new Date(),
        $inc: { reply_count: 1 },
      }
    );
    await appendReply(APPROVED_SHEET, offerOutreachDoc.job_id, replyText);
    console.log(`[webhook] Reply linked (offer) → job_id=${offerOutreachDoc.job_id} from=${from}`);
  } else {
    console.log(`[webhook] Reply saved (no matching job) → from=${from} conversationId=${message.conversationId}`);
  }
}

// ── Graph subscription: register + auto-renew ───────────────────────────────
let subscriptionId = null;

async function registerSubscription() {
  const token = await getAccessToken();
  const client = Client.init({ authProvider: (done) => done(null, token) });
  const sub = await client.api("/subscriptions").post({
    changeType:         "created",
    notificationUrl:    `${process.env.PUBLIC_URL}/webhook/replies`,
    resource:           `/users/${process.env.SENDER_EMAIL}/mailFolders/inbox/messages`,
    expirationDateTime: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    clientState:        process.env.WEBHOOK_SECRET,
  });
  subscriptionId = sub.id;
  console.log(`[webhook] Subscription registered: ${subscriptionId}`);
}

async function renewSubscription() {
  if (!subscriptionId) return;
  const token = await getAccessToken();
  const client = Client.init({ authProvider: (done) => done(null, token) });
  await client.api(`/subscriptions/${subscriptionId}`).patch({
    expirationDateTime: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
  });
  console.log("[webhook] Subscription renewed");
}

async function backfillSheets() {
  const { renderMissingInfo } = require("./templates/missingInfo");
  const SIGNATURE = "Talk soon,\nSarah Mitchell\nLuna Lending";

  // Reconstruct the offer email body the same way offerOutreach.js does
  function buildOfferBody(app) {
    const name = app.first_name || "there";
    let body = (app.message || "")
      .replace(/\[Client Name\]/gi, name)
      .replace(/\[Name\]/gi, name)
      .replace(/\[Your Name\]/gi, SIGNATURE);
    if (app.join_url && app.password) {
      body +=
        "\n\n──────────────────────────────────────\n" +
        "Schedule your offer review call:\n" +
        `Join: ${app.join_url}\n` +
        `Password: ${app.password}\n` +
        "──────────────────────────────────────";
    }
    return body;
  }

  // Reconstruct the missing-doc email body from the stored template_key (no LLM needed)
  function buildMissingDocBody(lead) {
    const key = lead.outreach?.template_key;
    if (!key) return "";
    // template_key format: "missing_info__dob_ssn" → extract codes after double underscore
    const match = key.match(/^missing_info__(.+)$/);
    if (!match) return "";
    const codes = match[1].split("_").filter(Boolean);
    try {
      return renderMissingInfo(codes, {
        name:    lead.user_details?.first_name?.trim() || "there",
        company: lead.user_details?.company || "your business",
      }, lead.form_link || "https://www.lunalend.com/apply");
    } catch {
      return "";
    }
  }

  try {
    console.log("[sheets] Backfill started...");

    // ── 1. Missing-doc leads ──────────────────────────────────────────────────
    const missingDocLeads = await MissingDoc.find(
      { "outreach.messaged": true }
    ).lean();

    const missingDocJobIds = new Set(missingDocLeads.map((l) => l.job_id));

    for (const lead of missingDocLeads) {
      await upsertSentRow(
        MISSING_DOCS_SHEET,
        lead.job_id,
        lead.user_details?.email || "",
        buildMissingDocBody(lead)
      );
    }
    console.log(`[sheets] Backfilled ${missingDocLeads.length} missing-doc row(s)`);

    // ── 2. Approved-application leads ─────────────────────────────────────────
    const offerOutreachDocs = await ApprovedApplicationOutreach.find(
      { messaged: true },
      { job_id: 1, messaged_at: 1 }
    ).lean();

    const offerJobIds = new Set(offerOutreachDocs.map((o) => o.job_id));

    for (const od of offerOutreachDocs) {
      const app = await ApprovedApplication.findOne({ job_id: od.job_id }).lean();
      if (app) {
        await upsertSentRow(APPROVED_SHEET, od.job_id, app.email || "", buildOfferBody(app));
      }
    }
    console.log(`[sheets] Backfilled ${offerOutreachDocs.length} approved-application row(s)`);

    // ── 3. Existing replies ───────────────────────────────────────────────────
    const allReplies = await AppFollowUpReplies.find(
      { job_id: { $ne: null } },
      { job_id: 1, bodyPreview: 1, receivedAt: 1 }
    ).sort({ receivedAt: 1 }).lean();

    // Group replies by job_id (already sorted oldest→newest)
    const repliesByJob = {};
    for (const r of allReplies) {
      if (!repliesByJob[r.job_id]) repliesByJob[r.job_id] = [];
      repliesByJob[r.job_id].push(r);
    }

    const { google } = require("googleapis");
    const { GoogleAuth } = google.auth;
    const auth = new GoogleAuth({
      keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheetsClient = google.sheets({ version: "v4", auth });

    let totalRepliesWritten = 0;
    for (const [job_id, replies] of Object.entries(repliesByJob)) {
      let sheetName = null;
      if (missingDocJobIds.has(job_id))  sheetName = MISSING_DOCS_SHEET;
      else if (offerJobIds.has(job_id)) sheetName = APPROVED_SHEET;
      if (!sheetName) continue;

      const written = await backfillRepliesForJob(sheetsClient, sheetName, job_id, replies);
      totalRepliesWritten += written;
    }

    console.log(`[sheets] Backfilled ${totalRepliesWritten} reply/replies`);
    console.log("[sheets] Backfill complete");
  } catch (err) {
    console.error(`[sheets] Backfill error: ${err.message}`);
  }
}

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("Connected to MongoDB");
    await initSheets();
    await backfillSheets();
    const port = process.env.PORT || 3000;
    app.listen(port, () => console.log(`Server running on port ${port}`));

    // Register webhook subscription first — must be live before any outreach runs
    await registerSubscription().catch((err) =>
      console.error("[webhook] Registration error:", err.message)
    );
    setInterval(() => {
      renewSubscription().catch((err) =>
        console.error("[webhook] Renewal error:", err.message)
      );
    }, 3 * 60 * 60 * 1000);

    const INTERVAL = parseInt(process.env.OUTREACH_INTERVAL_MS) || 60 * 60 * 1000;

    async function runCombinedOutreachJob() {
      const alloc = await getDailyAllocation(MissingDoc, ApprovedApplication, ApprovedApplicationOutreach);

      console.log(
        `[outreach] Daily budget — limit=${alloc.limit} sentToday=${alloc.sentToday}` +
        ` (missing=${alloc.missingDocSentToday} offer=${alloc.offerSentToday}) remaining=${alloc.remaining}`
      );

      if (alloc.remaining === 0) {
        console.log(`[outreach] Daily limit of ${alloc.limit} reached — skipping all jobs`);
        return;
      }

      console.log(
        `[outreach] Allocation — missing-doc: pending=${alloc.missingDocPending} slots=${alloc.missingDocLimit}` +
        ` | offer: pending=${alloc.offerPending} slots=${alloc.offerLimit}`
      );

      await runOutreachJob(MissingDoc, classify, alloc.missingDocLimit);
      await runOfferOutreachJob(ApprovedApplication, ApprovedApplicationOutreach, alloc.offerLimit);
    }

    runCombinedOutreachJob().catch((err) =>
      console.error("[outreach] Startup job error:", err.message)
    );
    setInterval(() => {
      runCombinedOutreachJob().catch((err) =>
        console.error("[outreach] Scheduled job error:", err.message)
      );
    }, INTERVAL);

    console.log(`[outreach] Combined scheduler started — interval=${INTERVAL}ms limit=${process.env.SENDER_DAILY_LIMIT || 50}`);
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });
