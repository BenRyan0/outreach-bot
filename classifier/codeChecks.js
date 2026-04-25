function normalizeName(name) {
  return name
    .toUpperCase()
    .replace(/\b(LLC|INC|CORP|LTD|CO|COMPANY|GROUP|PARTNERS|LP|LLP|LAW)\b/g, "")
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function runCodeChecks(record) {
  const findings = [];
  const userDetails = record.user_details || {};
  const statements = record.statements || [];

  // Track which missing_fields entries get covered by a specific variant
  // so VAR-006-01 only catches the leftovers
  const coveredMissingFields = new Set();

  // ── VAR-001: Missing Identity Information ────────────────────────────────

  // VAR-001-01: SSN Missing or Invalid
  if (!userDetails.ssn || record.is_ssn_valid === false) {
    findings.push({
      variant_id: "VAR-001",
      sub_variant_id: "VAR-001-01",
      label: "SSN Missing",
      severity: "critical",
      outreach_line: "Your Social Security Number (SSN) is missing or invalid. Please provide your SSN to continue.",
    });
    // Mark related missing_fields as covered
    if (record.missing_fields) {
      record.missing_fields.forEach((m, i) => {
        if (/ssn|social security/i.test(m)) coveredMissingFields.add(i);
      });
    }
  }

  // VAR-001-02: Date of Birth Missing
  if (!userDetails.date_of_birth) {
    findings.push({
      variant_id: "VAR-001",
      sub_variant_id: "VAR-001-02",
      label: "Date of Birth Missing",
      severity: "critical",
      outreach_line: "Your date of birth is missing. Please provide your date of birth to continue.",
    });
    if (record.missing_fields) {
      record.missing_fields.forEach((m, i) => {
        if (/date of birth|birthday|dob/i.test(m)) coveredMissingFields.add(i);
      });
    }
  }

  // VAR-001-03: VAT or EIN Missing or Invalid
  if (!userDetails.vat || record.is_vat_valid === false) {
    findings.push({
      variant_id: "VAR-001",
      sub_variant_id: "VAR-001-03",
      label: "VAT or EIN Missing",
      severity: "critical",
      outreach_line: "Your VAT or EIN is missing or invalid. Please provide your business tax identification number.",
    });
    if (record.missing_fields) {
      record.missing_fields.forEach((m, i) => {
        if (/vat|ein|tax id/i.test(m)) coveredMissingFields.add(i);
      });
    }
  }

  // ── VAR-002: Bank Statement Issues ──────────────────────────────────────

  // VAR-002-01: Personal Account Statements Submitted
  const personalStatements = statements.filter(
    (s) => s.account_type && s.account_type.toLowerCase() === "personal"
  );
  if (personalStatements.length > 0) {
    findings.push({
      variant_id: "VAR-002",
      sub_variant_id: "VAR-002-01",
      label: "Personal Account Statements Submitted",
      severity: "critical",
      outreach_line: "One or more of your submitted bank statements are from a personal account. Please resubmit using business bank statements only.",
    });
    if (record.missing_fields) {
      record.missing_fields.forEach((m, i) => {
        if (/personal account|business bank statement/i.test(m)) coveredMissingFields.add(i);
      });
    }
  }

  // VAR-002-02: Account Holder Name Does Not Match Business
  if (record.name_match_status === "Mismatch" && userDetails.company && statements.length > 0) {
    const normalizedCompany = normalizeName(userDetails.company);
    const mismatched = statements.filter((s) => {
      if (!s.account_holder_name || s.account_holder_name === "N/A") return false;
      return normalizeName(s.account_holder_name) !== normalizedCompany;
    });
    if (mismatched.length > 0) {
      findings.push({
        variant_id: "VAR-002",
        sub_variant_id: "VAR-002-02",
        label: "Account Holder Name Does Not Match Business",
        severity: "high",
        outreach_line: "The name on your bank statements does not match your business name on file. Please confirm the account belongs to your business.",
      });
    }
  }

  // VAR-002-03: Bank Statements Not Recent
  if (record.is_recent === false) {
    findings.push({
      variant_id: "VAR-002",
      sub_variant_id: "VAR-002-03",
      label: "Bank Statements Not Recent",
      severity: "critical",
      outreach_line: "Your bank statements are outdated. Please provide statements from the last 3 months.",
    });
  } else {
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const dates = statements
      .filter((s) => s.statement_date)
      .map((s) => new Date(s.statement_date));
    if (dates.length > 0 && new Date(Math.max(...dates)) < cutoff) {
      findings.push({
        variant_id: "VAR-002",
        sub_variant_id: "VAR-002-03",
        label: "Bank Statements Not Recent",
        severity: "critical",
        outreach_line: "Your bank statements are outdated. Please provide statements from the last 3 months.",
      });
    }
  }

  // VAR-002-04: Insufficient Number of Statements
  if (record.has_minimum_statements === false) {
    findings.push({
      variant_id: "VAR-002",
      sub_variant_id: "VAR-002-04",
      label: "Insufficient Number of Statements",
      severity: "high",
      outreach_line: "We require a minimum number of bank statements and your submission does not meet that requirement. Please provide additional statements.",
    });
  }

  // ── VAR-003: Active MCA or Debt Detected ────────────────────────────────

  // VAR-003-01: MCA Activity Found on Statement
  const mcaStatements = statements.filter(
    (s) => s.mca_details && s.mca_details.length > 0
  );
  if (mcaStatements.length > 0) {
    findings.push({
      variant_id: "VAR-003",
      sub_variant_id: "VAR-003-01",
      label: "MCA Activity Found on Statement",
      severity: "high",
      outreach_line: "We detected existing MCA or financing activity on your bank statements. Please disclose all current outstanding advances or loans.",
    });
  }

  // ── VAR-004: Identity Verification Mismatch ─────────────────────────────

  // VAR-004-01: Name Mismatch Between Application and Statements
  if (record.name_match_status === "Mismatch") {
    findings.push({
      variant_id: "VAR-004",
      sub_variant_id: "VAR-004-01",
      label: "Name Mismatch Between Application and Statements",
      severity: "high",
      outreach_line: "The name on your application does not match the name on your bank statements. Please confirm your legal name and resubmit matching documents.",
    });
  }

  // VAR-004-02: SSN Does Not Pass Validation (SSN provided but invalid)
  if (record.is_ssn_valid === false && userDetails.ssn) {
    findings.push({
      variant_id: "VAR-004",
      sub_variant_id: "VAR-004-02",
      label: "SSN Does Not Pass Validation",
      severity: "critical",
      outreach_line: "The SSN you provided could not be validated. Please double-check and resubmit your Social Security Number.",
    });
  }

  // VAR-004-03: VAT or EIN Does Not Pass Validation (VAT provided but invalid)
  if (record.is_vat_valid === false && userDetails.vat) {
    findings.push({
      variant_id: "VAR-004",
      sub_variant_id: "VAR-004-03",
      label: "VAT or EIN Does Not Pass Validation",
      severity: "critical",
      outreach_line: "The VAT or EIN you provided could not be validated. Please verify and resubmit your business tax ID.",
    });
  }

  // ── VAR-005: Financial Profile Concerns ─────────────────────────────────

  // VAR-005-02: Significant Deposit Spike in One Month
  if (statements.length > 1 && record.average_deposits > 0) {
    for (const s of statements) {
      if (s.total_deposits > record.average_deposits * 1.4) {
        findings.push({
          variant_id: "VAR-005",
          sub_variant_id: "VAR-005-02",
          label: "Significant Deposit Spike in One Month",
          severity: "medium",
          outreach_line: "We noticed an unusually high deposit in one of your statements. Please provide a brief explanation for this activity.",
        });
        break;
      }
    }
  }

  // VAR-005-03: Mixed Personal and Business Deposits
  const accountTypes = [...new Set(
    statements.map((s) => s.account_type).filter(Boolean).map((t) => t.toLowerCase())
  )];
  if (accountTypes.includes("personal") && accountTypes.includes("business")) {
    findings.push({
      variant_id: "VAR-005",
      sub_variant_id: "VAR-005-03",
      label: "Mixed Personal and Business Deposits",
      severity: "medium",
      outreach_line: "Your submitted statements include both personal and business accounts. Please resubmit using only business account statements.",
    });
  }

  // ── VAR-006: Fallback ────────────────────────────────────────────────────

  // VAR-006-01: Uncovered missing_fields entries
  if (record.missing_fields && record.missing_fields.length > 0) {
    const uncovered = record.missing_fields.filter((_, i) => !coveredMissingFields.has(i));
    for (const message of uncovered) {
      findings.push({
        variant_id: "VAR-006",
        sub_variant_id: "VAR-006-01",
        label: "System-Flagged Missing Field Not Covered by Other Variants",
        severity: "medium",
        outreach_line: message,
      });
    }
  }

  // VAR-006-02: System Note Contains Unstructured Warning
  if (record.note) {
    findings.push({
      variant_id: "VAR-006",
      sub_variant_id: "VAR-006-02",
      label: "System Note Contains Unstructured Warning",
      severity: "low",
      outreach_line: "Our system flagged an issue with your application. A member of our team will reach out to assist you.",
    });
  }

  return findings;
}

module.exports = { runCodeChecks };
