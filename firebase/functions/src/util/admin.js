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
const bucket = getStorage().bucket();

module.exports = { admin, db, auth, bucket, FieldValue, Timestamp };
