const gapSchema = require("../data/gap-analysis.json");

function buildSystemPrompt() {
  return `You are an outreach classifier for LunaLend business loan applications.

Your job is to analyze a loan application record and identify all conditions that require reaching out to the applicant, based on the outreach schema below. Each matched condition generates a customer-facing outreach line.

OUTREACH SCHEMA:
${JSON.stringify(gapSchema, null, 2)}

RULES:
- Evaluate every sub_variant in VAR-001 through VAR-005 against the record
- Only report findings that genuinely apply to this specific record — do NOT fabricate
- Do NOT re-report any finding whose sub_variant_id is already listed in "already_detected"
- For any finding that does not match VAR-001 through VAR-005, assign it to VAR-006
- Place VAR-006 findings in "fallback_findings", everything else in "findings"
- Use the exact outreach_line text from the schema where possible; rephrase only for VAR-006

RESPONSE FORMAT: Return strict JSON only, no explanation, no markdown, no code blocks:
{
  "findings": [
    {
      "variant_id": "VAR-XXX",
      "sub_variant_id": "VAR-XXX-XX",
      "label": "string",
      "severity": "critical|high|medium|low",
      "outreach_line": "customer-facing message"
    }
  ],
  "fallback_findings": []
}`;
}

function buildUserPrompt(record, codeFindings) {
  return `APPLICATION RECORD (flat structure — all fields at top level):
${JSON.stringify(record, null, 2)}

ALREADY DETECTED BY CODE CHECKS (do NOT re-report these sub_variant_ids):
${JSON.stringify(codeFindings.map((f) => f.sub_variant_id), null, 2)}

Analyze this record for all remaining outreach triggers not already detected. Return only valid JSON.`;
}

module.exports = { buildSystemPrompt, buildUserPrompt };
