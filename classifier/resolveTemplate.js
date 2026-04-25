const { renderMissingInfo, getMissingInfoKey } = require("../templates/missingInfo");

const VARIANT_TO_CODE = {
  "VAR-001-01": "ssn",
  "VAR-001-02": "dob",
  "VAR-001-03": "vat",
  "VAR-002-01": "stmt",
};

function resolveTemplate(findings, fallbackFindings, record) {
  const allFindings = [...findings, ...fallbackFindings];

  const codes = allFindings
    .map((f) => VARIANT_TO_CODE[f.sub_variant_id])
    .filter(Boolean);

  if (codes.length === 0) {
    return { template_key: null, rendered_message: null };
  }

  const lead = {
    name: record.user_details?.first_name?.trim() || "there",
    company: record.user_details?.company || "your business",
  };

  const applyLink = record.form_link || "https://www.lunalend.com/apply";

  const template_key = getMissingInfoKey(codes);
  const rendered_message = renderMissingInfo(codes, lead, applyLink);

  return { template_key, rendered_message };
}

module.exports = { resolveTemplate };
