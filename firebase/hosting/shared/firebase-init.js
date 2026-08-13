// Firebase client init, shared by every page. Auto-connects to the local
// Emulator Suite when served from localhost (matches `firebase serve` /
// `firebase emulators:start --only hosting,...`), talks to the real
// project otherwise. Same code, no build step — plain ES modules from the
// Firebase CDN.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import {
  getAuth, connectAuthEmulator, signInWithCustomToken, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import {
  getFunctions, connectFunctionsEmulator, httpsCallable
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-functions.js';

// Public web config — Firebase API keys are not secret; access is governed
// by Firestore/Auth rules and App Check, not by hiding this key.
const firebaseConfig = {
  projectId: 'industrial-muscle-fitness',
  appId: '1:403028372028:web:e0d49d98de1f3b20cd3139',
  storageBucket: 'industrial-muscle-fitness.firebasestorage.app',
  apiKey: 'AIzaSyCDuccZiZsy12d3SW6BeFAP77_1fACWHr0',
  authDomain: 'industrial-muscle-fitness.firebaseapp.com',
  messagingSenderId: '403028372028',
  measurementId: 'G-PBYSPSECGY'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const functions = getFunctions(app, 'us-central1');

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
if (isLocal) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  console.log('[firebase-init] Connected to local emulators (Auth :9099, Functions :5001)');
}

// Mimics the {success, message, ...} shape every ported Cloud Function
// already returns, so page code reads exactly like it did against
// google.script.run's withSuccessHandler callback, just with await instead.
async function callServer(name, data) {
  const fn = httpsCallable(functions, name);
  const res = await fn(data || {});
  return res.data;
}

export { app, auth, functions, callServer, signInWithCustomToken, onAuthStateChanged, signOut };
