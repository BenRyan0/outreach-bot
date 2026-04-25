// missing_info_templates.js
// Templates for requesting missing application information from leads.
//
// Covers every combination of 4 missing field types:
//   dob  — Date of birth / Birthday
//   ssn  — Social Security Number
//   vat  — VAT number
//   stmt — Bank statements submitted are personal, need business statements
//
// 15 total combinations (every non-empty subset of the 4 types).
//
// Key pattern: missing_info__[fields joined by underscore in alphabetical order]
//   e.g. missing_info__dob
//        missing_info__dob_ssn
//        missing_info__dob_ssn_stmt
//        missing_info__dob_ssn_vat_stmt  (all missing)
//
// Placeholders:
//   {{name}}         — lead first name
//   {{company}}      — business name
//   {{apply_link}}   — link to the application or reply instructions
//
// Usage:
//   const { MISSING_INFO_TEMPLATES, renderMissingInfo } = require('./missing_info_templates');
//   const body = renderMissingInfo('missing_info__dob_ssn', lead, 'https://www.lunalend.com/apply');

const APPLY = 'https://www.lunalend.com/apply';

const SIGN = `Talk soon,\nLinda Lopez\nSenior Underwriter, Luna Lending`;

const MISSING_INFO_TEMPLATES = {

  // ─── Single field missing ──────────────────────────────────────────────────

  missing_info__dob:
`Hi {{name}},

We are almost there with {{company}}'s application. The one thing we still need is your date of birth.

You can reply to this email with it or add it directly through the application at {{apply_link}}.

Once we have that we can move forward right away.

${SIGN}`,


  missing_info__ssn:
`Hi {{name}},

We are almost there with {{company}}'s application. The one thing we still need is your Social Security Number.

You can reply to this email with it or submit it securely through the application at {{apply_link}}.

Once we have that we can move forward right away.

${SIGN}`,


  missing_info__vat:
`Hi {{name}},

We are almost there with {{company}}'s application. The one thing we still need is your VAT number.

You can reply to this email with it or add it through the application at {{apply_link}}.

Once we have that we can move forward right away.

${SIGN}`,


  missing_info__stmt:
`Hi {{name}},

We received the bank statements for {{company}} but the ones on file are personal account statements. We need business bank statements to move forward.

Please upload your business account statements through the application at {{apply_link}} or reply to this email and I will walk you through it.

Once we have the right statements we can get your offer together quickly.

${SIGN}`,


  // ─── Two fields missing ────────────────────────────────────────────────────

  missing_info__dob_ssn:
`Hi {{name}},

We are reviewing {{company}}'s application and need two things before we can move forward.

Your date of birth and your Social Security Number are both missing from the file.

You can reply to this email with both or add them through the application at {{apply_link}}.

Once we have those we are good to go.

${SIGN}`,


  missing_info__dob_stmt:
`Hi {{name}},

We are reviewing {{company}}'s application and need two things before we can move forward.

First, your date of birth is missing. Second, the bank statements on file are personal account statements and we need business bank statements instead.

You can reply to this email with your date of birth and upload the right statements through the application at {{apply_link}}.

Once we have both we can get your offer together.

${SIGN}`,


  missing_info__dob_vat:
`Hi {{name}},

We are reviewing {{company}}'s application and need two things before we can move forward.

Your date of birth and your VAT number are both missing from the file.

You can reply to this email with both or add them through the application at {{apply_link}}.

Once we have those we are good to go.

${SIGN}`,


  missing_info__ssn_stmt:
`Hi {{name}},

We are reviewing {{company}}'s application and need two things before we can move forward.

First, your Social Security Number is missing. Second, the bank statements on file are personal account statements and we need business bank statements instead.

You can reply to this email with your SSN and upload the right statements through the application at {{apply_link}}.

Once we have both we can get your offer together.

${SIGN}`,


  missing_info__ssn_vat:
`Hi {{name}},

We are reviewing {{company}}'s application and need two things before we can move forward.

Your Social Security Number and your VAT number are both missing from the file.

You can reply to this email with both or add them through the application at {{apply_link}}.

Once we have those we are good to go.

${SIGN}`,


  missing_info__stmt_vat:
`Hi {{name}},

We are reviewing {{company}}'s application and need two things before we can move forward.

First, your VAT number is missing. Second, the bank statements on file are personal account statements and we need business bank statements instead.

You can reply to this email with your VAT number and upload the right statements through the application at {{apply_link}}.

Once we have both we can get your offer together.

${SIGN}`,


  // ─── Three fields missing ──────────────────────────────────────────────────

  missing_info__dob_ssn_stmt:
`Hi {{name}},

We are reviewing {{company}}'s application and there are three things we need before we can move forward.

Your date of birth and Social Security Number are both missing. The bank statements on file are also personal account statements and we need business bank statements instead.

You can reply to this email with your date of birth and SSN and upload the business statements through the application at {{apply_link}}.

Once we have all three we can get your offer put together.

${SIGN}`,


  missing_info__dob_ssn_vat:
`Hi {{name}},

We are reviewing {{company}}'s application and there are three things we need before we can move forward.

Your date of birth, Social Security Number, and VAT number are all missing from the file.

You can reply to this email with all three or add them through the application at {{apply_link}}.

Once we have everything we can move forward right away.

${SIGN}`,


  missing_info__dob_stmt_vat:
`Hi {{name}},

We are reviewing {{company}}'s application and there are three things we need before we can move forward.

Your date of birth and VAT number are both missing. The bank statements on file are also personal account statements and we need business bank statements instead.

You can reply to this email with your date of birth and VAT number and upload the business statements through the application at {{apply_link}}.

Once we have all three we can get your offer put together.

${SIGN}`,


  missing_info__ssn_stmt_vat:
`Hi {{name}},

We are reviewing {{company}}'s application and there are three things we need before we can move forward.

Your Social Security Number and VAT number are both missing. The bank statements on file are also personal account statements and we need business bank statements instead.

You can reply to this email with your SSN and VAT number and upload the business statements through the application at {{apply_link}}.

Once we have all three we can get your offer put together.

${SIGN}`,


  // ─── All four missing ──────────────────────────────────────────────────────

  missing_info__dob_ssn_stmt_vat:
`Hi {{name}},

We are reviewing {{company}}'s application and there are a few things we need before we can move forward.

Your date of birth, Social Security Number, and VAT number are all missing from the file. The bank statements on file are also personal account statements and we need business bank statements instead.

The fastest way to get everything sorted is to go through the application at {{apply_link}} where you can add the missing details and upload the right statements in one go. You can also reply to this email and I will walk you through each item one at a time.

Once we have everything we can get your offer together right away.

${SIGN}`,

};


// ─── Renderer ─────────────────────────────────────────────────────────────────
// Build the template key from the missing fields array, then render it.
//
// missingFields — array of field codes in any order, e.g. ['ssn', 'dob']
//                 Valid codes: 'dob', 'ssn', 'vat', 'stmt'
// lead          — { name, company }
// applyLink     — the URL to the application or a reply instruction string
//
// Example:
//   renderMissingInfo(['ssn', 'dob'], { name: 'Edward', company: 'Pops Originals' });
//   → uses missing_info__dob_ssn (fields sorted alphabetically)

function renderMissingInfo(missingFields, lead = {}, applyLink = APPLY) {
  if (!Array.isArray(missingFields) || missingFields.length === 0) {
    throw new Error('missingFields must be a non-empty array of field codes');
  }

  const VALID = ['dob', 'ssn', 'stmt', 'vat'];
  const invalid = missingFields.filter(f => !VALID.includes(f));
  if (invalid.length > 0) {
    throw new Error(`Invalid field codes: ${invalid.join(', ')}. Valid codes: ${VALID.join(', ')}`);
  }

  // Sort alphabetically so key is consistent regardless of input order
  const sorted = [...new Set(missingFields)].sort();
  const key = 'missing_info__' + sorted.join('_');

  const template = MISSING_INFO_TEMPLATES[key];
  if (!template) {
    throw new Error(`No template found for key: ${key}`);
  }

  return template
    .replace(/\{\{name\}\}/g,       lead.name    || 'there')
    .replace(/\{\{company\}\}/g,    lead.company || 'your business')
    .replace(/\{\{apply_link\}\}/g, applyLink);
}

// ─── Key lookup helper ────────────────────────────────────────────────────────
// Returns the template key for a given set of missing fields.
// Useful for logging or debugging without rendering the full template.

function getMissingInfoKey(missingFields) {
  const sorted = [...new Set(missingFields)].sort();
  return 'missing_info__' + sorted.join('_');
}

// ─── All valid keys ───────────────────────────────────────────────────────────
// Reference list of all 15 keys in alphabetical order.

const ALL_MISSING_INFO_KEYS = Object.keys(MISSING_INFO_TEMPLATES).sort();

module.exports = {
  MISSING_INFO_TEMPLATES,
  renderMissingInfo,
  getMissingInfoKey,
  ALL_MISSING_INFO_KEYS,
};