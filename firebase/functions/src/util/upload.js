// Replaces the original's DriveApp.createFile(...).setSharing(ANYONE_WITH_LINK)
// pattern with a Cloud Storage upload + a public download URL (same
// public-embed-in-<img> intent, different storage backend).
'use strict';
const { bucket } = require('./admin');

async function uploadBase64Image(base64Data, mimeType, fileName, folder) {
  const buffer = Buffer.from(base64Data.split(',').pop(), 'base64');
  const path = `${folder}/${fileName || Date.now()}`;
  const file = bucket.file(path);
  await file.save(buffer, { metadata: { contentType: mimeType } });
  await file.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${path}`;
}

module.exports = { uploadBase64Image };
