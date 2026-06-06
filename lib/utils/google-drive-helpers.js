// R215t: Google Drive helpers (extend dari google-sheets.js)
// Path: lib/utils/google-drive-helpers.js
// Reuse service account dari existing google-sheets.js

import { getDriveClient, extractFolderId } from '@/lib/utils/google-sheets';
import { Readable } from 'stream';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

// Find folder by name in parent. Return ID or null.
export async function findFolderInParent(parentFolderId, folderName) {
  const drive = getDriveClient();
  const q = `'${parentFolderId}' in parents and name='${folderName.replace(/'/g, "\\'")}' and mimeType='${FOLDER_MIME}' and trashed=false`;
  try {
    const r = await drive.files.list({
      q,
      fields: 'files(id, name, webViewLink)',
      pageSize: 1,
    });
    const found = (r.data.files || [])[0];
    return found || null;
  } catch {
    return null;
  }
}

// Create folder in parent (return existing if same name found)
export async function findOrCreateFolder(parentFolderId, folderName) {
  if (!parentFolderId || !folderName) throw new Error('parentFolderId & folderName wajib');

  // Try find existing
  const existing = await findFolderInParent(parentFolderId, folderName);
  if (existing) return existing;

  // Create new
  const drive = getDriveClient();
  const r = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: FOLDER_MIME,
      parents: [parentFolderId],
    },
    fields: 'id, name, webViewLink',
  });
  return r.data;
}

// Upload file ke Drive folder. Return file metadata.
export async function uploadFileToDriveFolder(folderId, fileName, mimeType, bufferOrStream) {
  if (!folderId || !fileName) throw new Error('folderId & fileName wajib');

  const drive = getDriveClient();
  // Convert Buffer to Readable stream (googleapis prefers stream)
  let body = bufferOrStream;
  if (Buffer.isBuffer(bufferOrStream)) {
    body = Readable.from(bufferOrStream);
  }

  const r = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType: mimeType || 'application/octet-stream',
      body,
    },
    fields: 'id, name, webViewLink, webContentLink',
  });
  return r.data;
}

// Delete file from Drive (untuk replace)
export async function deleteDriveFile(fileId) {
  if (!fileId) return;
  try {
    const drive = getDriveClient();
    await drive.files.delete({ fileId });
  } catch (e) {
    console.warn('[deleteDriveFile]', e?.message);
  }
}

// Make file viewable by anyone with link (optional, for sharing)
export async function makeFileShareable(fileId, role = 'reader') {
  if (!fileId) return;
  try {
    const drive = getDriveClient();
    await drive.permissions.create({
      fileId,
      requestBody: { type: 'anyone', role },
    });
  } catch (e) {
    console.warn('[makeFileShareable]', e?.message);
  }
}

// Sanitize folder name (Drive allows most chars but let's clean)
export function sanitizeFolderName(name) {
  return String(name || 'unknown')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .slice(0, 100);
}

export { extractFolderId };
