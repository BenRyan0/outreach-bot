"use strict";

// Shared daily send budget for funding@lunalend.net.
// Counts how many emails each queue has sent today (UTC midnight boundary),
// counts pending in each queue, and splits the remaining budget proportionally.

async function getDailyAllocation(MissingDoc, ApprovedApplication, ApprovedApplicationOutreach) {
  const LIMIT = parseInt(process.env.SENDER_DAILY_LIMIT) || 50;

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  // Sent today per queue
  const [missingDocSentToday, offerSentToday] = await Promise.all([
    MissingDoc.countDocuments({
      "outreach.messaged":    true,
      "outreach.messaged_at": { $gte: todayStart },
    }),
    ApprovedApplicationOutreach.countDocuments({
      messaged:    true,
      messaged_at: { $gte: todayStart },
    }),
  ]);

  const sentToday = missingDocSentToday + offerSentToday;
  const remaining = Math.max(0, LIMIT - sentToday);

  if (remaining === 0) {
    return {
      limit: LIMIT, sentToday, missingDocSentToday, offerSentToday,
      remaining: 0, missingDocPending: 0, offerPending: 0,
      missingDocLimit: 0, offerLimit: 0,
    };
  }

  // Pending in each queue
  const contactedOfferDocs = await ApprovedApplicationOutreach
    .find({ messaged: true }, { job_id: 1 })
    .lean();
  const contactedOfferIds = contactedOfferDocs.map((d) => d.job_id);

  const [missingDocPending, offerPending] = await Promise.all([
    MissingDoc.countDocuments({ "outreach.messaged": { $ne: true } }),
    ApprovedApplication.countDocuments({ job_id: { $nin: contactedOfferIds } }),
  ]);

  const totalPending = missingDocPending + offerPending;

  let missingDocLimit = 0;
  let offerLimit      = 0;

  if (totalPending > 0) {
    missingDocLimit = Math.round(remaining * (missingDocPending / totalPending));
    offerLimit      = remaining - missingDocLimit;
  }

  return {
    limit: LIMIT,
    sentToday,
    missingDocSentToday,
    offerSentToday,
    remaining,
    missingDocPending,
    offerPending,
    missingDocLimit,
    offerLimit,
  };
}

module.exports = { getDailyAllocation };
