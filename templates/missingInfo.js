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
//   {{apply_link}}   — link to the application resubmission page

const APPLY = 'https://www.lunalend.com/apply';
const SIGN  = `Talk soon,\nLinda Lopez\nSenior Underwriter, Luna Lending`;

const MISSING_INFO_TEMPLATES = {

  missing_info__dob:
`Hi {{name}},

We are almost there with your application. The one thing we still need is your date of birth.

Please resubmit your application at the link below with your date of birth included and we can move forward right away.

{{apply_link}}

${SIGN}`,


  missing_info__ssn:
`Hi {{name}},

We are almost there with your application. The one thing we still need is your Social Security Number.

Please resubmit your application at the link below with your SSN included and we can move forward right away.

{{apply_link}}

${SIGN}`,


  missing_info__vat:
`Hi {{name}},

We are almost there with your application. The one thing we still need is your VAT number.

Please resubmit your application at the link below with your VAT number included and we can move forward right away.

{{apply_link}}

${SIGN}`,


  missing_info__stmt:
`Hi {{name}},

We received your bank statements but the ones on file are personal account statements. We need business bank statements to move forward.

Please resubmit your application at the link below and upload your business account statements this time.

{{apply_link}}

Once we have the right statements we can get your offer together quickly.

${SIGN}`,


  missing_info__dob_ssn:
`Hi {{name}},

We are reviewing your application and need two things before we can move forward.

Your date of birth and your Social Security Number are both missing from the file.

Please resubmit your application at the link below with both items included.

{{apply_link}}

Once we have those we are good to go.

${SIGN}`,


  missing_info__dob_stmt:
`Hi {{name}},

We are reviewing your application and need two things before we can move forward.

Your date of birth is missing and the bank statements on file are personal account statements. We need your date of birth and business bank statements instead.

Please resubmit your application at the link below with your date of birth filled in and your business bank statements uploaded.

{{apply_link}}

Once we have both we can get your offer together.

${SIGN}`,


  missing_info__dob_vat:
`Hi {{name}},

We are reviewing your application and need two things before we can move forward.

Your date of birth and your VAT number are both missing from the file.

Please resubmit your application at the link below with both items included.

{{apply_link}}

Once we have those we are good to go.

${SIGN}`,


  missing_info__ssn_stmt:
`Hi {{name}},

We are reviewing your application and need two things before we can move forward.

Your Social Security Number is missing and the bank statements on file are personal account statements. We need your SSN and business bank statements instead.

Please resubmit your application at the link below with your SSN filled in and your business bank statements uploaded.

{{apply_link}}

Once we have both we can get your offer together.

${SIGN}`,


  missing_info__ssn_vat:
`Hi {{name}},

We are reviewing your application and need two things before we can move forward.

Your Social Security Number and your VAT number are both missing from the file.

Please resubmit your application at the link below with both items included.

{{apply_link}}

Once we have those we are good to go.

${SIGN}`,


  missing_info__stmt_vat:
`Hi {{name}},

We are reviewing your application and need two things before we can move forward.

Your VAT number is missing and the bank statements on file are personal account statements. We need your VAT number and business bank statements instead.

Please resubmit your application at the link below with your VAT number filled in and your business bank statements uploaded.

{{apply_link}}

Once we have both we can get your offer together.

${SIGN}`,


  missing_info__dob_ssn_stmt:
`Hi {{name}},

We are reviewing your application and there are three things we need before we can move forward.

Your date of birth and Social Security Number are both missing. The bank statements on file are also personal account statements and we need business bank statements instead.

Please resubmit your application at the link below with your date of birth and SSN filled in and your business bank statements uploaded.

{{apply_link}}

Once we have all three we can get your offer put together.

${SIGN}`,


  missing_info__dob_ssn_vat:
`Hi {{name}},

We are reviewing your application and there are three things we need before we can move forward.

Your date of birth, Social Security Number, and VAT number are all missing from the file.

Please resubmit your application at the link below with all three items included.

{{apply_link}}

Once we have everything we can move forward right away.

${SIGN}`,


  missing_info__dob_stmt_vat:
`Hi {{name}},

We are reviewing your application and there are three things we need before we can move forward.

Your date of birth and VAT number are both missing. The bank statements on file are also personal account statements and we need business bank statements instead.

Please resubmit your application at the link below with your date of birth and VAT number filled in and your business bank statements uploaded.

{{apply_link}}

Once we have all three we can get your offer put together.

${SIGN}`,


  missing_info__ssn_stmt_vat:
`Hi {{name}},

We are reviewing your application and there are three things we need before we can move forward.

Your Social Security Number and VAT number are both missing. The bank statements on file are also personal account statements and we need business bank statements instead.

Please resubmit your application at the link below with your SSN and VAT number filled in and your business bank statements uploaded.

{{apply_link}}

Once we have all three we can get your offer put together.

${SIGN}`,


  missing_info__dob_ssn_stmt_vat:
`Hi {{name}},

We are reviewing your application and there are a few things we need before we can move forward.

Your date of birth, Social Security Number, and VAT number are all missing from the file. The bank statements on file are also personal account statements and we need business bank statements instead.

Please resubmit your application at the link below. Fill in your date of birth, SSN, and VAT number and upload your business bank statements all in one go.

{{apply_link}}

Once we have everything we can get your offer together right away.

${SIGN}`,

};


function renderMissingInfo(missingFields, lead = {}, applyLink = APPLY) {
  if (!Array.isArray(missingFields) || missingFields.length === 0) {
    throw new Error('missingFields must be a non-empty array of field codes');
  }

  const VALID = ['dob', 'ssn', 'stmt', 'vat'];
  const invalid = missingFields.filter(f => !VALID.includes(f));
  if (invalid.length > 0) {
    throw new Error(`Invalid field codes: ${invalid.join(', ')}. Valid codes: ${VALID.join(', ')}`);
  }

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

function getMissingInfoKey(missingFields) {
  const sorted = [...new Set(missingFields)].sort();
  return 'missing_info__' + sorted.join('_');
}

const ALL_MISSING_INFO_KEYS = Object.keys(MISSING_INFO_TEMPLATES).sort();

module.exports = {
  MISSING_INFO_TEMPLATES,
  renderMissingInfo,
  getMissingInfoKey,
  ALL_MISSING_INFO_KEYS,
};