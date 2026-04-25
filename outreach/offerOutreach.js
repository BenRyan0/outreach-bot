"use strict";

const { sendAndTrack } = require("../graph/sendAndTrack");
const { upsertSentRow, APPROVED_SHEET } = require("../sheets/googleSheets");

const TEST_MODE   = process.env.OUTREACH_TEST_MODE === "true";
const SENDER_NAME = "Sarah Mitchell";
const SIGNATURE   = "Talk soon,\nSarah Mitchell\nLuna Lending";

function buildBody(record) {
  const name = record.first_name || "there";

  let body = (record.message || "")
    .replace(/\[Client Name\]/gi, name)
    .replace(/\[Name\]/gi, name)
    .replace(/\[Your Name\]/gi, SIGNATURE);

  if (record.join_url && record.password) {
    body +=
      "\n\n──────────────────────────────────────\n" +
      "Schedule your offer review call:\n" +
      `Join: ${record.join_url}\n` +
      `Password: ${record.password}\n` +
      "──────────────────────────────────────";
  }

  return body;
}

// `limit` is the maximum number of emails this run is allowed to send
// (allocated by dailyLimit.js from the shared SENDER_DAILY_LIMIT budget).
async function runOfferOutreachJob(ApprovedApplication, ApprovedApplicationOutreach, limit = Infinity) {
  console.log(`[offer-outreach] Job started — ${new Date().toISOString()} (limit=${limit})`);

  if (limit === 0) {
    console.log(`[offer-outreach] Allocated limit is 0 — skipping`);
    return;
  }

  // Find job_ids that have already been messaged
  const contacted = await ApprovedApplicationOutreach
    .find({ messaged: true }, { job_id: 1 })
    .lean();
  const contactedIds = contacted.map((d) => d.job_id);

  const candidates = await ApprovedApplication
    .find({ job_id: { $nin: contactedIds } })
    .limit(limit)
    .lean();

  console.log(`[offer-outreach] ${candidates.length} candidate(s) found`);

  let sent = 0, skipped = 0, failed = 0;

  for (const record of candidates) {
    if (sent >= limit) {
      console.log(`[offer-outreach] Allocated limit (${limit}) reached — stopping`);
      break;
    }

    if (!record.email) {
      console.warn(`[offer-outreach] No email — job_id=${record.job_id}, skipping`);
      skipped++;
      continue;
    }

    const body    = buildBody(record);
    const subject = record.topic || "Your Luna Lending Offer";

    if (TEST_MODE) {
      console.log(`\n[offer-outreach:test-mode] ────────────────────────────────────────`);
      console.log(`[offer-outreach:test-mode] job_id  : ${record.job_id}`);
      console.log(`[offer-outreach:test-mode] to      : ${record.email}`);
      console.log(`[offer-outreach:test-mode] subject : ${subject}`);
      console.log(`[offer-outreach:test-mode] message:\n`);
      console.log(body.split("\n").map((l) => `  ${l}`).join("\n"));
      console.log(`[offer-outreach:test-mode] ────────────────────────────────────────\n`);
      sent++;
      continue;
    }

    // Increment attempts before sending so a mid-send crash is still counted
    await ApprovedApplicationOutreach.findOneAndUpdate(
      { job_id: record.job_id },
      { $inc: { attempts: 1 } },
      { upsert: true }
    );

    try {
      const htmlBody = `<pre style="font-family:sans-serif;white-space:pre-wrap">${body}</pre>`;
      const { conversationId, internetMessageId } = await sendAndTrack(
        record.email,
        subject,
        htmlBody,
        SENDER_NAME
      );

      await ApprovedApplicationOutreach.findOneAndUpdate(
        { job_id: record.job_id },
        {
          messaged:            true,
          messaged_at:         new Date(),
          last_error:          null,
          conversation_id:     conversationId    ?? null,
          internet_message_id: internetMessageId ?? null,
        },
        { upsert: true }
      );

      await upsertSentRow(APPROVED_SHEET, record.job_id, record.email, body);

      sent++;
      console.log(`[offer-outreach] Sent → job_id=${record.job_id}`);
    } catch (err) {
      await ApprovedApplicationOutreach.findOneAndUpdate(
        { job_id: record.job_id },
        { last_error: err.message },
        { upsert: true }
      );
      failed++;
      console.error(`[offer-outreach] Send failed — job_id=${record.job_id}: ${err.message}`);
    }
  }

  console.log(`[offer-outreach] Job done — sent=${sent} skipped=${skipped} failed=${failed}`);
}

module.exports = { runOfferOutreachJob };
