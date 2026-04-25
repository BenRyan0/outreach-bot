const { runCodeChecks } = require("./codeChecks");
const { runLLMCheck } = require("./llmCheck");
const { resolveTemplate } = require("./resolveTemplate");

const SEVERITY_ORDER = ["critical", "high", "medium", "low"];

function buildOutreachSummary(findings, fallbackFindings) {
  const all = [...findings, ...fallbackFindings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  );
  const groups = {};
  for (const f of all) {
    if (!groups[f.severity]) groups[f.severity] = [];
    groups[f.severity].push(f.outreach_line);
  }
  return SEVERITY_ORDER
    .filter((s) => groups[s])
    .map((s) => `${s.toUpperCase()}: ${groups[s].join(" ")}`)
    .join("\n");
}

async function classify(record) {
  const codeFindings = runCodeChecks(record);
  const llmResult = await runLLMCheck(record, codeFindings);

  // Split LLM output — VAR-006 goes to fallback
  const llmMainFindings = (llmResult.findings || []).filter(
    (f) => f.variant_id !== "VAR-006"
  );
  const llmFallbackFindings = [
    ...(llmResult.fallback_findings || []),
    ...(llmResult.findings || []).filter((f) => f.variant_id === "VAR-006"),
  ];

  // Split code findings
  const codeMainFindings = codeFindings.filter((f) => f.variant_id !== "VAR-006");
  const codeFallbackFindings = codeFindings.filter((f) => f.variant_id === "VAR-006");

  // Merge and deduplicate by sub_variant_id — code findings take priority
  const seen = new Set();
  const dedupe = (arr) =>
    arr.filter((f) => {
      if (seen.has(f.sub_variant_id)) return false;
      seen.add(f.sub_variant_id);
      return true;
    });

  // If VAR-004-01 (name mismatch) is present, drop VAR-002-02 (same issue, less specific)
  const allMain = [...codeMainFindings, ...llmMainFindings];
  const hasVar004_01 = allMain.some((f) => f.sub_variant_id === "VAR-004-01");
  const filteredMain = hasVar004_01
    ? allMain.filter((f) => f.sub_variant_id !== "VAR-002-02")
    : allMain;

  const finalFindings = dedupe(filteredMain);
  const finalFallback = dedupe([...codeFallbackFindings, ...llmFallbackFindings]);
  const combined = [...finalFindings, ...finalFallback];

  const { template_key, rendered_message } = resolveTemplate(finalFindings, finalFallback, record);

  return {
    application_id: record.job_id,
    applicant_email: record.user_details?.email ?? null,
    outreach_required: combined.length > 0,
    template_key,
    rendered_message,
    findings: finalFindings,
    fallback_findings: finalFallback,
    outreach_summary: buildOutreachSummary(finalFindings, finalFallback),
    total_findings: combined.length,
    severity_breakdown: {
      critical: combined.filter((f) => f.severity === "critical").length,
      high: combined.filter((f) => f.severity === "high").length,
      medium: combined.filter((f) => f.severity === "medium").length,
      low: combined.filter((f) => f.severity === "low").length,
    },
  };
}

module.exports = { classify };
