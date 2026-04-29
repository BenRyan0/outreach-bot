"use strict";

const { google } = require("googleapis");

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const KEY_PATH = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;

const MISSING_DOCS_SHEET = "Missing Docs";
const APPROVED_SHEET     = "Approved Applications";

// Columns the system reads but never overwrites
const JOB_ID_COL      = 1;   // column B — job_id (manual)
const EMAIL_COL       = 14;  // column O — email   (manual)
// Columns the system writes
const EMAIL_SENT_COL  = 18;  // column S
const REPLY_COL_START = 19;  // column T
const MAX_REPLIES     = 10;

const HEADERS = [
  "note", "job_id", "topic", "message", "password", "offer_amount",
  "terms_days", "terms_factor_rate", "company", "first_name", "last_name",
  "EIN", "SSN", "Date of Birth", "email", "Application Email",
  "Phone number", "Business Phone",
  "email sent",
  "reply 1", "reply 2", "reply 3", "reply 4", "reply 5",
  "reply 6", "reply 7", "reply 8", "reply 9", "reply 10",
];

// Converts a 0-indexed column number to A1-notation letter(s) (e.g. 0→A, 25→Z, 26→AA)
function colLetter(idx) {
  let col = "";
  let n = idx + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    n = Math.floor((n - 1) / 26);
  }
  return col;
}

const LAST_COL = colLetter(HEADERS.length - 1); // AC

function isConfigured() {
  return !!(SHEET_ID && KEY_PATH);
}

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

// Creates the sheet tab if it doesn't exist, then writes the header row if missing.
async function ensureSheetAndHeaders(sheets, sheetName) {
  // Get all existing tab titles
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const existingTitles = meta.data.sheets.map((s) => s.properties.title);

  if (!existingTitles.includes(sheetName)) {
    // Create the tab
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      },
    });
    console.log(`[sheets] Created sheet tab "${sheetName}"`);

    // Write headers immediately — new sheet is guaranteed empty
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A1:${LAST_COL}1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADERS] },
    });
    console.log(`[sheets] Headers written to "${sheetName}"`);
    return;
  }

  // Tab exists — check if headers are already there
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A1:${LAST_COL}1`,
  });
  const first = (res.data.values || [])[0];
  if (!first || first[JOB_ID_COL] !== "job_id") { // check column B
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A1:${LAST_COL}1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADERS] },
    });
    console.log(`[sheets] Headers written to "${sheetName}"`);
  }
}

async function findRow(sheets, sheetName, job_id) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A:${LAST_COL}`,
  });
  const rows = res.data.values || [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][JOB_ID_COL] === job_id) return { rowNumber: i + 1, rowData: rows[i] };
  }
  return null;
}

// Called when an outreach email is sent — creates the row or updates the email body column
async function upsertSentRow(sheetName, job_id, email, emailBody) {
  if (!isConfigured()) return;
  try {
    const sheets   = await getSheetsClient();
    await ensureSheetAndHeaders(sheets, sheetName);

    const bodyStr  = String(emailBody || "");
    const existing = await findRow(sheets, sheetName, job_id);

    if (existing) {
      // Only update the "email sent" cell — all other columns are manual
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!${colLetter(EMAIL_SENT_COL)}${existing.rowNumber}`,
        valueInputOption: "RAW",
        requestBody: { values: [[bodyStr]] },
      });
    } else {
      // Row not yet in sheet — seed job_id (B) and email (O) so the row is findable
      const row = Array(HEADERS.length).fill("");
      row[JOB_ID_COL]     = job_id;
      row[EMAIL_COL]      = email;
      row[EMAIL_SENT_COL] = bodyStr;
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!A:${LAST_COL}`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [row] },
      });
    }
    console.log(`[sheets] Row upserted — sheet="${sheetName}" job_id=${job_id}`);
  } catch (err) {
    console.error(`[sheets] upsertSentRow failed — job_id=${job_id}: ${err.message}`);
  }
}

// Called when a reply is received — fills the next empty reply column (D–M)
async function appendReply(sheetName, job_id, replyText) {
  if (!isConfigured()) return;
  try {
    const sheets   = await getSheetsClient();
    await ensureSheetAndHeaders(sheets, sheetName);

    const existing = await findRow(sheets, sheetName, job_id);
    if (!existing) {
      console.warn(`[sheets] No row for job_id=${job_id} in "${sheetName}" — skipping reply`);
      return;
    }

    const { rowNumber, rowData } = existing;

    // Find the next empty reply slot
    let nextCol = -1;
    for (let i = REPLY_COL_START; i < REPLY_COL_START + MAX_REPLIES; i++) {
      if (!rowData[i]) { nextCol = i; break; }
    }

    if (nextCol === -1) {
      console.warn(`[sheets] All reply columns full for job_id=${job_id}`);
      return;
    }

    const col = colLetter(nextCol);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!${col}${rowNumber}`,
      valueInputOption: "RAW",
      requestBody: { values: [[replyText]] },
    });
    console.log(`[sheets] Reply appended — sheet="${sheetName}" job_id=${job_id} col=${col}`);
  } catch (err) {
    console.error(`[sheets] appendReply failed — job_id=${job_id}: ${err.message}`);
  }
}

// Idempotent reply backfill for a single job.
// Reads how many reply cols are already filled, then writes only the missing ones.
// replies: [{ bodyPreview }] sorted by receivedAt asc
async function backfillRepliesForJob(sheets, sheetName, job_id, replies) {
  const existing = await findRow(sheets, sheetName, job_id);
  if (!existing) return 0;

  const { rowNumber, rowData } = existing;

  // Count consecutively filled reply slots from the start
  let filledCount = 0;
  for (let i = REPLY_COL_START; i < REPLY_COL_START + MAX_REPLIES; i++) {
    if (rowData[i] && rowData[i].toString().trim()) filledCount++;
    else break;
  }

  const toWrite = replies.slice(filledCount, MAX_REPLIES);
  if (toWrite.length === 0) return 0;

  for (let i = 0; i < toWrite.length; i++) {
    const col = colLetter(REPLY_COL_START + filledCount + i);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!${col}${rowNumber}`,
      valueInputOption: "RAW",
      requestBody: { values: [[toWrite[i].bodyPreview || ""]] },
    });
  }
  return toWrite.length;
}

// Call once on server start to pre-create both tabs and headers
async function initSheets() {
  if (!isConfigured()) {
    console.log("[sheets] Not configured — skipping init");
    return;
  }
  try {
    const sheets = await getSheetsClient();
    await ensureSheetAndHeaders(sheets, MISSING_DOCS_SHEET);
    await ensureSheetAndHeaders(sheets, APPROVED_SHEET);
    console.log("[sheets] Initialized — both tabs ready");
  } catch (err) {
    console.error(`[sheets] Init failed: ${err.message}`);
  }
}

module.exports = { upsertSentRow, appendReply, backfillRepliesForJob, initSheets, MISSING_DOCS_SHEET, APPROVED_SHEET };
