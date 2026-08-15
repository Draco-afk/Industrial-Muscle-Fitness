// Replaces the original's DriveApp.createFile(...).setSharing(ANYONE_WITH_LINK)
// pattern with a Cloud Storage upload + a public download URL (same
// public-embed-in-<img> intent, different storage backend).
'use strict';
const { bucket } = require('./admin');

async function uploadBase64Image(base64Data, mimeType, fileName, folder) {
  if (!base64Data) throw new Error('ไม่พบข้อมูลรูปภาพ');
  const buffer = Buffer.from(base64Data.split(',').pop(), 'base64');
  const path = `${folder}/${fileName || Date.now()}`;
  const file = bucket.file(path);
  await file.save(buffer, { metadata: { contentType: mimeType } });
  // No per-object makePublic(): the bucket uses uniform bucket-level access,
  // where object ACLs are rejected. Public read is granted once on the bucket
  // (allUsers -> roles/storage.objectViewer) instead, which is the same
  // "anyone with the link" exposure the original DriveApp sharing had.
  return `https://storage.googleapis.com/${bucket.name}/${path}`;
}

module.exports = { uploadBase64Image };
