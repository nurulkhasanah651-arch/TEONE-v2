// R215t + R215u: Google Drive helpers
// R215u FIX: Upload file pakai Readable stream yg proper (Vercel serverless compatible)
// Path: lib/utils/google-drive-helpers.js

import { getDriveClient, extractFolderId } from '@/lib/utils/google-sheets';
import { Readable } from 'stream';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

export async function findFolderInParent(parentFolderId, folderName) {
  const drive = getDriveClient();
  const escapedName = folderName.replace(/'/g, "\\'");
  const q = `'${parentFolderId}' in parents and name='${escapedName}' and mimeType='${FOLDER_MIME}' and trashed=false`;
  try {
    const r = await drive.files.list({
      q,
      fields: 'files(id, name, webViewLink)',
      pageSize: 1,
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
  });
  return r.data;
}

// R215u FIX: Convert Buffer ke Readable stream yg proper buat serverless
function bufferToStream(buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null); // signal end
  return stream;
}

// R215u FIX: Upload file dgn proper stream conversion + error logging
export async function uploadFileToDriveFolder(folderId, fileName, mimeType, buffer) {
  if (!folderId || !fileName) throw new Error('folderId & fileName wajib');
  if (!Buffer.isBuffer(buffer)) {
    if (buffer && typeof buffer.arrayBuffer === 'function') {
      // Convert Blob to Buffer
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
      // R215u: Resumable upload untuk file > 5MB lebih stable
      uploadType: buffer.length > 5 * 1024 * 1024 ? 'resumable' : 'multipart',
    });
    console.log(`[Drive Upload OK] ${fileName} → ${r.data.id} (${r.data.size || buffer.length} bytes)`);
    return r.data;
  } catch (e) {
    console.error(`[Drive Upload FAIL] ${fileName}:`, e?.message, e?.code, e?.errors);
    throw e;
  }
}

export async function deleteDriveFile(fileId) {
  if (!fileId) return;
  try {
    const drive = getDriveClient();
    await drive.files.delete({ fileId });
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
