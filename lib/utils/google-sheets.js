// Round 191: Google Sheets helpers — AUTO-CREATE di folder yg di-share user
// Service account bikin sheet di parent folder yg dimiliki user, sheet inherit permission folder.
// Path: lib/utils/google-sheets.js

import { google } from 'googleapis';

const SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
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

// R191: Parent folder ID dari env var
export function getDriveFolderId() {
  return process.env.TEONE_DRIVE_FOLDER_ID || null;
}

// R191: Extract folder ID dari URL Drive
export function extractFolderId(input) {
  if (!input) return null;
  const trimmed = String(input).trim();
  // https://drive.google.com/drive/folders/FOLDER_ID
  const m1 = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  // https://drive.google.com/drive/u/0/folders/FOLDER_ID
  const m2 = trimmed.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

// R191: createSheet dengan opsi parent folder
export async function createSheet(title, parentFolderId = null) {
  // Kalau ada parent folder, pakai Drive API buat bikin sheet di folder itu
  // (cara ini bypass permission denied karena sheet ke-attach ke user's folder)
  if (parentFolderId) {
    const drive = getDriveClient();
    const file = await drive.files.create({
      requestBody: {
        name: title,
        mimeType: 'application/vnd.google-apps.spreadsheet',
        parents: [parentFolderId],
      },
      fields: 'id, webViewLink',
    });

    const sheetId = file.data.id;

    // Setelah sheet dibuat, tambahin 5 tab via Sheets API
    const sheets = getSheetsClient();
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const existingTabs = (meta.data.sheets || []).map((s) => s.properties.title);
    const requiredTabs = ['📋 Peserta', '📕 Passport', '💰 Payment', '💸 HPP', '📊 Summary'];
    const missingTabs = requiredTabs.filter((t) => !existingTabs.includes(t));

    if (missingTabs.length > 0) {
      const addRequests = missingTabs.map((t) => ({ addSheet: { properties: { title: t } } }));
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: { requests: addRequests },
      });
    }

    // Optional: delete default "Sheet1" kalau ada
    const updatedMeta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheet1 = (updatedMeta.data.sheets || []).find((s) => s.properties.title === 'Sheet1');
    if (sheet1) {
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            requests: [{ deleteSheet: { sheetId: sheet1.properties.sheetId } }],
          },
        });
      } catch {}
    }

    return {
      sheet_id: sheetId,
      url: file.data.webViewLink || `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
    };
  }

  // Fallback: bikin pakai Sheets API langsung (sheet bakal di Drive service account)
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [
        { properties: { title: '📋 Peserta' } },
        { properties: { title: '📕 Passport' } },
        { properties: { title: '💰 Payment' } },
        { properties: { title: '💸 HPP' } },
        { properties: { title: '📊 Summary' } },
      ],
    },
  });
  return { sheet_id: res.data.spreadsheetId, url: res.data.spreadsheetUrl };
}

export async function makeSheetShareable(spreadsheetId, role = 'reader') {
  const drive = getDriveClient();
  await drive.permissions.create({
    fileId: spreadsheetId,
    requestBody: { type: 'anyone', role },
  });
}

export async function writeTab(spreadsheetId, tabName, values) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: tabName });
  if (values && values.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
  }
}

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

// R191: Cek apakah service account bisa akses folder
export async function checkFolderAccess(folderId) {
  if (!folderId) return { ok: false, error: 'Folder ID belum di-set' };
  try {
    const drive = getDriveClient();
    const r = await drive.files.get({
      fileId: folderId,
      fields: 'id, name, mimeType, webViewLink',
    });
    if (r.data.mimeType !== 'application/vnd.google-apps.folder') {
      return { ok: false, error: 'ID yang dikasih bukan folder' };
    }
    return {
      ok: true,
      folder_id: r.data.id,
      folder_name: r.data.name,
      folder_url: r.data.webViewLink,
    };
  } catch (e) {
    const msg = e?.message || String(e);
    if (/not.*found|404/i.test(msg)) {
      return { ok: false, error: 'Folder tidak ditemukan. ID/URL salah?' };
    }
    if (/permission|403/i.test(msg)) {
      return { ok: false, error: 'Service account belum di-share ke folder ini. Share dulu sebagai Editor.' };
    }
    return { ok: false, error: msg };
  }
}

export async function diagnoseConnection() {
  const creds = loadCreds();
  const folderId = getDriveFolderId();
  const result = {
    has_env: true,
    project_id: creds.project_id,
    client_email: creds.client_email,
    private_key_has_newlines: (creds.private_key || '').includes('\n'),
    folder_id_configured: !!folderId,
    folder_id: folderId,
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

  if (folderId) {
    const folderCheck = await checkFolderAccess(folderId);
    result.folder_check = folderCheck;
  }

  return result;
}
