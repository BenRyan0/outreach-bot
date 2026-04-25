"use strict";

const { sendAndTrack } = require("../graph/sendAndTrack");
const { upsertSentRow, APPROVED_SHEET } = require("../sheets/googleSheets");

const TEST_MODE    = process.env.OUTREACH_TEST_MODE === "true";
const JOB_ENABLED  = process.env.APPROVED_OUTREACH_ENABLED !== "false";
const SENDER_NAME  = "Sarah Mitchell";
const SIGNATURE   = "Talk soon,\nSarah Mitchell\nSenior Underwriter, Luna Lending";

const SUFFIX_RE = /\s*,?\s*(LLC|INC|LTD|CORP|CO|PC|LLP|PLLC|INCORPORATED|LIMITED|HOLDINGS|GROUP|ENTERPRISES)\.?$/i;

function stripSuffix(name) {
  return (name || "").replace(SUFFIX_RE, "").trim();
}

function formatAmount(amount) {
  if (!amount && amount !== 0) return "your approved amount";
  return "$" + Number(amount).toLocaleString("en-US");
}

function buildBody(record) {
  const name    = record.first_name || "there";
  const amount  = formatAmount(record.offer_amount);
  const company = stripSuffix(record.company) || "your business";
  const link    = record.join_url || "";

  return (
    `Hi ${name},\n\n` +
    `Good news. We have prepared a ${amount} offer for ${company} and it is ready for review. ` +
    `This offer is valid for 14 days so the sooner we connect the better.\n` +
    `Please book a time with our loan specialists below and we will walk you through the full details on the call.\n\n` +
    `${link}\n\n` +
    `Just reply here if you have any questions before booking.\n\n` +
    SIGNATURE
  );
}

// `limit` is the maximum number of emails this run is allowed to send
// (allocated by dailyLimit.js from the shared SENDER_DAILY_LIMIT budget).
async function runOfferOutreachJob(ApprovedApplication, ApprovedApplicationOutreach, limit = Infinity) {
  if (!JOB_ENABLED) {
    console.log(`[offer-outreach] Approved-application outreach disabled (APPROVED_OUTREACH_ENABLED=false) — skipping`);
    return;
  }

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
    const subject = "Your Business Funding Offer Is Ready — 14 Days to Review";

    if (TEST_MODE) {
      console.log(`[offer-outreach:test-mode] job_id=${record.job_id} to=${record.email}\n${body}`);
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
      const { conversationId, internetMessageId } = await sendAndTrack(
        record.email,
        subject,
        body,
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
