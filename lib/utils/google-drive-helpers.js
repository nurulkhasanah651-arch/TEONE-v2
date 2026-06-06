// R215t + R215u + R215v: Google Drive helpers with Shared Drive support
// R215v FIX: supportsAllDrives + includeItemsFromAllDrives untuk Shared Drives
// Path: lib/utils/google-drive-helpers.js

import { getDriveClient, extractFolderId } from '@/lib/utils/google-sheets';
import { Readable } from 'stream';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

// R215v: Common options buat semua Drive API calls — support Shared Drives
const SHARED_DRIVE_OPTS = {
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
};

export async function findFolderInParent(parentFolderId, folderName) {
  const drive = getDriveClient();
  const escapedName = folderName.replace(/'/g, "\\'");
  const q = `'${parentFolderId}' in parents and name='${escapedName}' and mimeType='${FOLDER_MIME}' and trashed=false`;
  try {
    const r = await drive.files.list({
      q,
      fields: 'files(id, name, webViewLink)',
      pageSize: 1,
      ...SHARED_DRIVE_OPTS,
    });
    const found = (r.data.files || [])[0];
    return found || null;
  } catch (e) {
    console.error('[findFolderInParent]', e?.message);
    return null;
  }
}

export async function findOrCreateFolder(parentFolderId, folderName) {
  if (!parentFolderId || !folderName) throw new Error('parentFolderId & folderName wajib');
  const existing = await findFolderInParent(parentFolderId, folderName);
  if (existing) return existing;

  const drive = getDriveClient();
  const r = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: FOLDER_MIME,
      parents: [parentFolderId],
    },
    fields: 'id, name, webViewLink',
    supportsAllDrives: true,
  });
  return r.data;
}

function bufferToStream(buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

// R215v: Upload dgn supportsAllDrives=true (otomatis kerja di Shared Drive)
export async function uploadFileToDriveFolder(folderId, fileName, mimeType, buffer) {
  if (!folderId || !fileName) throw new Error('folderId & fileName wajib');
  if (!Buffer.isBuffer(buffer)) {
    if (buffer && typeof buffer.arrayBuffer === 'function') {
      buffer = Buffer.from(await buffer.arrayBuffer());
    } else {
      throw new Error('buffer harus Buffer atau Blob');
    }
  }

  const drive = getDriveClient();
  const stream = bufferToStream(buffer);

  try {
    const r = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
        mimeType: mimeType || 'application/octet-stream',
      },
      media: {
        mimeType: mimeType || 'application/octet-stream',
        body: stream,
      },
      fields: 'id, name, webViewLink, webContentLink, size',
      supportsAllDrives: true, // R215v: critical untuk Shared Drive
    });
    console.log(`[Drive Upload OK] ${fileName} → ${r.data.id} (${r.data.size || buffer.length} bytes)`);
    return r.data;
  } catch (e) {
    console.error(`[Drive Upload FAIL] ${fileName}:`, e?.message, e?.code, e?.errors);
    // R215v: Detect "no quota" error & give helpful message
    if (/storage quota/i.test(e?.message || '')) {
      throw new Error(
        `Service account gak punya quota. Pakai Shared Drive (bukan My Drive personal). ` +
        `Setup: drive.google.com → Shared drives → New → Add service account as Manager.`
      );
    }
    throw e;
  }
}

export async function deleteDriveFile(fileId) {
  if (!fileId) return;
  try {
    const drive = getDriveClient();
    await drive.files.delete({ fileId, supportsAllDrives: true });
  } catch (e) {
    console.warn('[deleteDriveFile]', e?.message);
  }
}

export async function makeFileShareable(fileId, role = 'reader') {
  if (!fileId) return;
  try {
    const drive = getDriveClient();
    await drive.permissions.create({
      fileId,
      requestBody: { type: 'anyone', role },
      supportsAllDrives: true,
    });
  } catch (e) {
    console.warn('[makeFileShareable]', e?.message);
  }
}

export function sanitizeFolderName(name) {
  return String(name || 'unknown')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .slice(0, 100);
}

export { extractFolderId };
