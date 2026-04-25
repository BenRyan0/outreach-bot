"use strict";

const { sendAndTrack } = require("../graph/sendAndTrack");
const { upsertSentRow, MISSING_DOCS_SHEET } = require("../sheets/googleSheets");

const TEST_MODE    = process.env.OUTREACH_TEST_MODE === "true";
const JOB_ENABLED  = process.env.MISSING_DOC_OUTREACH_ENABLED !== "false";

async function sendMessage({ to, subject, body, template_key, job_id }) {
  if (TEST_MODE) {
    console.log(`[outreach:test-mode] job_id=${job_id} to=${to}\n${body}`);
    return { delivered: false, test_mode: true };
  }

  const { conversationId, internetMessageId } = await sendAndTrack(to, subject, body);
  console.log(`[outreach] Email sent via Graph → job_id=${job_id} conversationId=${conversationId}`);
  return { delivered: true, conversationId, internetMessageId };
}

// ─── Scheduler loop ───────────────────────────────────────────────────────────
// Queries for leads that need outreach and haven't been messaged yet,
// runs classify() on each, calls sendMessage(), and writes the result back.
// `limit` is the maximum number of emails this run is allowed to send
// (allocated by dailyLimit.js from the shared SENDER_DAILY_LIMIT budget).
async function runOutreachJob(MissingDoc, classify, limit = Infinity) {
  if (!JOB_ENABLED) {
    console.log(`[outreach] Missing-doc outreach disabled (MISSING_DOC_OUTREACH_ENABLED=false) — skipping`);
    return;
  }

  console.log(`[outreach] Job started — ${new Date().toISOString()} (limit=${limit})`);

  if (limit === 0) {
    console.log(`[outreach] Allocated limit is 0 — skipping`);
    return;
  }

  // $ne: true catches both explicit false AND missing field (legacy records)
  const candidates = await MissingDoc.find({
    "outreach.messaged": { $ne: true },
  }).lean();

  console.log(`[outreach] ${candidates.length} candidate(s) found`);

  let sent = 0, skipped = 0, failed = 0;

  for (const record of candidates) {
    if (sent >= limit) {
      console.log(`[outreach] Allocated limit (${limit}) reached — stopping`);
      break;
    }
    let result;

    try {
      result = await classify(record);
    } catch (err) {
      console.error(`[outreach] classify() failed — job_id=${record.job_id}: ${err.message}`);
      failed++;
      continue;
    }

    if (!result.outreach_required) {
      skipped++;
      continue;
    }

    const email = record.user_details?.email;
    if (!email) {
      console.warn(`[outreach] No email — job_id=${record.job_id}, skipping`);
      skipped++;
      continue;
    }

    // Increment attempts before sending so a mid-send crash is still counted
    await MissingDoc.updateOne(
      { job_id: record.job_id },
      { $inc: { "outreach.attempts": 1 } }
    );

    try {
      const sendResult = await sendMessage({
        to:           email,
        subject:      "Your Luna Lending Application — Action Required",
        body:         result.rendered_message,
        template_key: result.template_key,
        job_id:       record.job_id,
      });

      await MissingDoc.updateOne(
        { job_id: record.job_id },
        {
          "outreach.messaged":            true,
          "outreach.messaged_at":         new Date(),
          "outreach.template_key":        result.template_key,
          "outreach.last_error":          null,
          "outreach.conversation_id":     sendResult.conversationId    ?? null,
          "outreach.internet_message_id": sendResult.internetMessageId ?? null,
        }
      );

      await upsertSentRow(MISSING_DOCS_SHEET, record.job_id, email, result.rendered_message);

      sent++;
      console.log(`[outreach] Sent → job_id=${record.job_id}`);
    } catch (err) {
      await MissingDoc.updateOne(
        { job_id: record.job_id },
        { "outreach.last_error": err.message }
      );
      failed++;
      console.error(`[outreach] sendMessage() failed — job_id=${record.job_id}: ${err.message}`);
    }
  }

  console.log(`[outreach] Job done — sent=${sent} skipped=${skipped} failed=${failed}`);
}

module.exports = { runOutreachJob, sendMessage };
