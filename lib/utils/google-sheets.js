// R191 + R215: Google Sheets helpers
// R215 update: formatTab() di-enhance jadi Excel-style format:
//   - Auto-filter (panah ⏷ di tiap kolom)
//   - Freeze header row
//   - Bold header + bg biru + text putih + center
//   - Auto-detect kolom Rupiah → format CURRENCY native
//   - Auto-resize columns
//   - Border bottom di header
// Semua function lain TIDAK berubah.
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

// Email service account (fallback hardcoded biar selalu tampil di petunjuk share sheet)
export const SERVICE_ACCOUNT_EMAIL_FALLBACK = 'teone-sheet-bot@zinc-wares-498208-s4.iam.gserviceaccount.com';

export function getServiceAccountEmail() {
  try {
    const creds = loadCreds();
    return creds.client_email || SERVICE_ACCOUNT_EMAIL_FALLBACK;
  } catch {
    return SERVICE_ACCOUNT_EMAIL_FALLBACK;
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

export function getDriveFolderId() {
  return process.env.TEONE_DRIVE_FOLDER_ID || null;
}

export function extractFolderId(input) {
  if (!input) return null;
  const trimmed = String(input).trim();
  const m1 = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = trimmed.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

export async function createSheet(title, parentFolderId = null) {
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

// R215: helper — deteksi apakah header text = kolom Rupiah
function isCurrencyHeader(headerText) {
  const text = String(headerText || '').toLowerCase();
  // Match: "Amount (Rp)", "Cash In (Rp)", "Cash Out (Rp)", "Net Cash Flow (Rp)",
  //        "(Rp)", "Rupiah", "Total Amount", "Grand Total", "Nominal"
  return /amount|cash\s*in|cash\s*out|net\s*cash|\(rp\)|rupiah|grand\s*total|nominal|saldo|harga|hpp|biaya|tagihan|pendapatan/i.test(text);
}

// R215: helper — deteksi kolom Date
function isDateHeader(headerText) {
  const text = String(headerText || '').toLowerCase();
  return /tanggal|tgl|date|bulan(?!\s*ini)/i.test(text);
}

// R215: ENHANCED formatTab — auto-filter + freeze + currency + styling
export async function formatTab(spreadsheetId, tabId) {
  const sheets = getSheetsClient();

  // 1. Get sheet metadata + header values
  let tabName;
  let rowCountMax = 1000;
  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets(properties(sheetId,title,gridProperties))',
    });
    const sheet = (meta.data.sheets || []).find((s) => s.properties.sheetId === tabId);
    if (!sheet) return; // tab udah ke-delete
    tabName = sheet.properties.title;
    rowCountMax = sheet.properties.gridProperties?.rowCount || 1000;
  } catch {
    return;
  }

  // Fetch header row + count actual data rows
  let headers = [];
  let lastRow = 1;
  try {
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!1:1`,
    });
    headers = (headerRes.data.values || [[]])[0] || [];

    const allDataRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: tabName,
    });
    lastRow = (allDataRes.data.values || []).length || 1;
  } catch {
    // If we can't fetch data, just apply basic formatting
  }

  const colCount = Math.max(headers.length, 1);
  const dataEndRow = Math.max(lastRow, 2); // ensure at least 2 (header + 1 data)

  // R215: detect currency columns
  const currencyColIdxs = [];
  const dateColIdxs = [];
  headers.forEach((h, idx) => {
    if (isCurrencyHeader(h)) currencyColIdxs.push(idx);
    if (isDateHeader(h)) dateColIdxs.push(idx);
  });

  const requests = [];

  // 2. HEADER STYLE — bg biru + text putih + bold + center + size 11
  requests.push({
    repeatCell: {
      range: {
        sheetId: tabId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: colCount,
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: { red: 0.145, green: 0.388, blue: 0.922 }, // brand blue
          textFormat: {
            foregroundColor: { red: 1, green: 1, blue: 1 },
            bold: true,
            fontSize: 11,
          },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE',
          wrapStrategy: 'WRAP',
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)',
    },
  });

  // 3. FREEZE header row
  requests.push({
    updateSheetProperties: {
      properties: { sheetId: tabId, gridProperties: { frozenRowCount: 1 } },
      fields: 'gridProperties.frozenRowCount',
    },
  });

  // 4. CURRENCY FORMAT (Rupiah) di kolom Amount
  for (const colIdx of currencyColIdxs) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: tabId,
          startRowIndex: 1,
          endRowIndex: dataEndRow,
          startColumnIndex: colIdx,
          endColumnIndex: colIdx + 1,
        },
        cell: {
          userEnteredFormat: {
            numberFormat: { type: 'CURRENCY', pattern: '"Rp "#,##0' },
            horizontalAlignment: 'RIGHT',
          },
        },
        fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
      },
    });
  }

  // 5. DATE FORMAT di kolom tanggal
  for (const colIdx of dateColIdxs) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: tabId,
          startRowIndex: 1,
          endRowIndex: dataEndRow,
          startColumnIndex: colIdx,
          endColumnIndex: colIdx + 1,
        },
        cell: {
          userEnteredFormat: {
            numberFormat: { type: 'DATE', pattern: 'dd-mmm-yyyy' },
            horizontalAlignment: 'CENTER',
          },
        },
        fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
      },
    });
  }

  // 6. CLEAR existing filter (kalau ada) — biar setBasicFilter di bawah gak conflict
  requests.push({
    clearBasicFilter: { sheetId: tabId },
  });

  // 7. AUTO-FILTER pada header + data range (panah ⏷ kayak Excel)
  if (colCount > 0 && dataEndRow > 1) {
    requests.push({
      setBasicFilter: {
        filter: {
          range: {
            sheetId: tabId,
            startRowIndex: 0,
            endRowIndex: dataEndRow,
            startColumnIndex: 0,
            endColumnIndex: colCount,
          },
        },
      },
    });
  }

  // 8. AUTO-RESIZE all columns (lebar otomatis ngepas isi)
  if (colCount > 0) {
    requests.push({
      autoResizeDimensions: {
        dimensions: {
          sheetId: tabId,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: colCount,
        },
      },
    });
  }

  // 9. BORDER bottom di header (extra polish)
  requests.push({
    updateBorders: {
      range: {
        sheetId: tabId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: colCount,
      },
      bottom: {
        style: 'SOLID_MEDIUM',
        color: { red: 0.0, green: 0.2, blue: 0.6 },
      },
    },
  });

  // 10. ROW HEIGHT — header row sedikit lebih tinggi (utk wrap text)
  requests.push({
    updateDimensionProperties: {
      range: {
        sheetId: tabId,
        dimension: 'ROWS',
        startIndex: 0,
        endIndex: 1,
      },
      properties: { pixelSize: 36 },
      fields: 'pixelSize',
    },
  });

  // 11. Execute batch (kalau salah satu request fail, swallow biar tab lain tetep format)
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });
  } catch (e) {
    // Fallback: minimal formatting kalau batch fail
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: { sheetId: tabId, startRowIndex: 0, endRowIndex: 1 },
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
                properties: { sheetId: tabId, gridProperties: { frozenRowCount: 1 } },
                fields: 'gridProperties.frozenRowCount',
              },
            },
          ],
        },
      });
    } catch {}
  }
}

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
