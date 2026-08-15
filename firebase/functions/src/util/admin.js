// Firebase Admin SDK init, shared by every module. Cloud Functions provides
// application-default credentials automatically (and the emulator suite
// wires this up to point at itself when FIRESTORE_EMULATOR_HOST etc. are set).
'use strict';
const admin = require('firebase-admin');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();
const auth = getAuth();

// This project never had Firebase Storage provisioned, so there is no
// <project>.firebasestorage.app default bucket to fall back on — asking for
// the default one fails with "The specified bucket does not exist". Uploads
// go to a bucket created explicitly for them instead.
const UPLOAD_BUCKET = process.env.UPLOAD_BUCKET || 'industrial-muscle-fitness-uploads';
const bucket = getStorage().bucket(UPLOAD_BUCKET);

module.exports = { admin, db, auth, bucket, FieldValue, Timestamp };
