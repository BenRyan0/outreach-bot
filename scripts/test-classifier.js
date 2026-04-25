require("dotenv").config();
const mongoose = require("mongoose");
const { classify } = require("../classifier");

const arg = process.argv[2];
const jobId = arg && isNaN(arg) ? arg : null;
const limit = !jobId ? (parseInt(arg) || 5) : null;

const missingDocSchema = new mongoose.Schema({}, { strict: false });
const MissingDoc = mongoose.model("MissingDoc", missingDocSchema, "missing-docs");

async function printResult(record, index, total) {
  console.log(`\n[${index}/${total}] ────────────────────────────────────────`);
  console.log(`  job_id : ${record.job_id}`);
  console.log(`  email  : ${record.user_details?.email ?? "N/A"}`);
  console.log(`  status : ${record.status ?? "N/A"}`);

  console.log(`  → Running code checks...`);
  console.log(`  → Sending to GPT-4o for semantic analysis...`);

  const result = await classify(record);

  console.log(`  ✓ Classification complete`);
  console.log(`  outreach_required : ${result.outreach_required}`);
  console.log(`  template_key      : ${result.template_key ?? "none"}`);
  console.log(`  severity: critical=${result.severity_breakdown.critical} | high=${result.severity_breakdown.high} | medium=${result.severity_breakdown.medium} | low=${result.severity_breakdown.low} | total=${result.total_findings}`);

  if (result.findings.length > 0) {
    console.log("\n  Findings:");
    for (const f of result.findings) {
      console.log(`    [${f.severity.toUpperCase()}] ${f.sub_variant_id} — ${f.label}`);
      console.log(`           ${f.outreach_line}`);
    }
  }

  if (result.fallback_findings.length > 0) {
    console.log("\n  Fallback (VAR-006):");
    for (const f of result.fallback_findings) {
      console.log(`    [${f.severity.toUpperCase()}] ${f.sub_variant_id} — ${f.label}`);
      console.log(`           ${f.outreach_line}`);
    }
  }

  if (result.outreach_summary) {
    console.log(`\n  Outreach Summary:`);
    for (const line of result.outreach_summary.split("\n")) {
      console.log(`    ${line}`);
    }
  }

  if (result.rendered_message) {
    console.log(`\n  Rendered Message (${result.template_key}):`);
    console.log(result.rendered_message.split("\n").map((l) => `    ${l}`).join("\n"));
  }

  return result;
}

async function run() {
  console.log(`Connecting to MongoDB...`);
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`✓ Connected\n`);

  if (jobId) {
    console.log(`Mode   : single record`);
    console.log(`job_id : ${jobId}`);
    console.log(`\nFetching record from database...`);

    const record = await MissingDoc.findOne({ job_id: jobId }).lean();
    if (!record) {
      console.log(`✗ No record found with job_id: ${jobId}`);
      process.exit(1);
    }
    console.log(`✓ Record found`);

    try {
      await printResult(record, 1, 1);
      console.log(`\n✓ Done`);
    } catch (err) {
      console.log(`\n✗ ERROR: ${err.message}`);
    }
  } else {
    console.log(`Mode  : batch`);
    console.log(`Limit : ${limit} record(s)`);
    console.log(`\nFetching records from database...`);

    const records = await MissingDoc.find({}).limit(limit).lean();

    if (records.length === 0) {
      console.log(`✗ No records found in database.`);
      process.exit(0);
    }
    console.log(`✓ Found ${records.length} record(s)\n`);

    let passed = 0;
    let failed = 0;

    for (let i = 0; i < records.length; i++) {
      try {
        await printResult(records[i], i + 1, records.length);
        passed++;
      } catch (err) {
        console.log(`\n  ✗ ERROR: ${err.message}`);
        failed++;
      }
    }

    console.log(`\n════════════════════════════════════════`);
    console.log(`Processed : ${records.length}`);
    console.log(`Passed    : ${passed}`);
    console.log(`Failed    : ${failed}`);
  }

  console.log(`\nDisconnecting from MongoDB...`);
  await mongoose.disconnect();
  console.log(`✓ Done`);
}

run().catch((err) => {
  console.error(`\n✗ Fatal: ${err.message}`);
  process.exit(1);
});
