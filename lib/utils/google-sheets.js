// Round 189 Fase 1: Google Sheets API helpers
// Path: lib/utils/google-sheets.js
//
// Pakai service account auth. Env yang dibutuhin:
// - GOOGLE_SHEETS_SA_KEY (JSON string of service account key)

import { google } from 'googleapis';

const SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];

let cachedAuth = null;

export function getAuth() {
  if (cachedAuth) return cachedAuth;
  const raw = process.env.GOOGLE_SHEETS_SA_KEY;
  if (!raw) throw new Error('GOOGLE_SHEETS_SA_KEY env var belum di-set');

  let creds;
  try {
    creds = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    throw new Error('GOOGLE_SHEETS_SA_KEY harus valid JSON: ' + e.message);
  }

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
  const raw = process.env.GOOGLE_SHEETS_SA_KEY;
  if (!raw) return null;
  try {
    const creds = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return creds.client_email || null;
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

// Make sheet publicly viewable (anyone with link can VIEW — change to writer for edit access)
export async function makeSheetShareable(spreadsheetId, role = 'reader') {
  const drive = getDriveClient();
  await drive.permissions.create({
    fileId: spreadsheetId,
    requestBody: {
      type: 'anyone',
      role, // 'reader' or 'writer'
    },
  });
}

// Helper: write 2D array to a tab (start from A1)
export async function writeTab(spreadsheetId, tabName, values) {
  const sheets = getSheetsClient();
  // Clear first
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: tabName,
  });
  // Write data
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
        // Bold header row
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
        // Freeze header row
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

export function getTabIds(spreadsheetMeta) {
  const tabs = spreadsheetMeta?.sheets || [];
  return tabs.map((s) => ({
    title: s.properties?.title,
    sheetId: s.properties?.sheetId,
  }));
}
