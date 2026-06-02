// Round 189b: Google Sheets helpers — FIX "caller does not have permission"
// Path: lib/utils/google-sheets.js
//
// Fixes vs R189:
// - Broader scope: 'drive' (bukan drive.file)
// - Auto-fix escaped \n di private_key dari env var Vercel
// - Error detail lebih jelas

import { google } from 'googleapis';

const SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive', // R189b: full Drive access (bukan drive.file)
];

let cachedAuth = null;
let cachedCreds = null;

function loadCreds() {
  if (cachedCreds) return cachedCreds;
  const raw = process.env.GOOGLE_SHEETS_SA_KEY;
  if (!raw) throw new Error('GOOGLE_SHEETS_SA_KEY env var belum di-set');

  let creds;
  try {
    creds = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    throw new Error('GOOGLE_SHEETS_SA_KEY harus valid JSON: ' + e.message);
  }

  // R189b: Auto-fix escaped \n di private_key (common Vercel env var bug)
  if (creds.private_key && typeof creds.private_key === 'string') {
    if (creds.private_key.includes('\\n') && !creds.private_key.includes('\n')) {
      creds.private_key = creds.private_key.replace(/\\n/g, '\n');
    }
  }

  cachedCreds = creds;
  return creds;
}

export function getAuth() {
  if (cachedAuth) return cachedAuth;
  const creds = loadCreds();
  cachedAuth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: SHEETS_SCOPES,
  });
  return cachedAuth;
}

export function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

export function getDriveClient() {
  return google.drive({ version: 'v3', auth: getAuth() });
}

export function getServiceAccountEmail() {
  try {
    const creds = loadCreds();
    return creds.client_email || null;
  } catch {
    return null;
  }
}

export function getProjectId() {
  try {
    const creds = loadCreds();
    return creds.project_id || null;
  } catch {
    return null;
  }
}

// Create new sheet with title
export async function createSheet(title) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [
        { properties: { title: '📋 Peserta', gridProperties: { rowCount: 100, columnCount: 20 } } },
        { properties: { title: '📕 Passport', gridProperties: { rowCount: 100, columnCount: 15 } } },
        { properties: { title: '💰 Payment', gridProperties: { rowCount: 300, columnCount: 15 } } },
        { properties: { title: '💸 HPP', gridProperties: { rowCount: 200, columnCount: 18 } } },
        { properties: { title: '📊 Summary', gridProperties: { rowCount: 50, columnCount: 10 } } },
      ],
    },
  });
  return {
    sheet_id: res.data.spreadsheetId,
    url: res.data.spreadsheetUrl,
  };
}

// Make sheet publicly viewable (anyone with link can VIEW)
export async function makeSheetShareable(spreadsheetId, role = 'reader') {
  const drive = getDriveClient();
  await drive.permissions.create({
    fileId: spreadsheetId,
    requestBody: {
      type: 'anyone',
      role,
    },
  });
}

// Helper: write 2D array to a tab (start from A1)
export async function writeTab(spreadsheetId, tabName, values) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: tabName,
  });
  if (values && values.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
  }
}

// Helper: bold header row + freeze
export async function formatTab(spreadsheetId, tabIndex) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId: tabIndex, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.9, green: 0.9, blue: 0.95 },
              },
            },
            fields: 'userEnteredFormat(textFormat,backgroundColor)',
          },
        },
        {
          updateSheetProperties: {
            properties: { sheetId: tabIndex, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount',
          },
        },
      ],
    },
  });
}

// R189b: diagnostic helper — test connection
export async function diagnoseConnection() {
  const creds = loadCreds();
  const result = {
    has_env: true,
    project_id: creds.project_id,
    client_email: creds.client_email,
    private_key_preview: (creds.private_key || '').slice(0, 50) + '...',
    private_key_has_newlines: (creds.private_key || '').includes('\n'),
    private_key_has_escaped_n: (creds.private_key || '').includes('\\n'),
  };

  try {
    const drive = getDriveClient();
    const r = await drive.about.get({ fields: 'user' });
    result.auth_ok = true;
    result.authenticated_as = r.data.user?.emailAddress;
  } catch (e) {
    result.auth_ok = false;
    result.auth_error = e?.message || String(e);
  }

  return result;
}
