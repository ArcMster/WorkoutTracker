/* =====================================================================
   Firebase settings for Infinity Fitness Tracker

   1. Copy this file and name the copy  firebase-config.js
   2. Replace the values below with your own
      (Firebase console > Project settings > Your apps > Web app)
   3. Commit firebase-config.js to your repo once.

   App updates never include firebase-config.js, so your settings are
   kept when you replace index.html and the other files.

   These values are safe to publish. Access to your data is protected
   by the Firestore security rules, not by keeping this file secret.
   ===================================================================== */
export default {
  apiKey: "AIzaSyCNjOEst22aKQo9ROEIa438p3v5JS9M2Fo",
  authDomain: "fitness-tracker-472ec.firebaseapp.com",
  projectId: "fitness-tracker-472ec",
  storageBucket: "fitness-tracker-472ec.firebasestorage.app",
  messagingSenderId: "1040678939146",
  appId: "1:1040678939146:web:ebbef891c33a659d770df3",
  measurementId: "G-VP8B61R4ZP"
};

/* Address of the AI planning proxy (the Advanced tab), for example
   "https://yourname.pythonanywhere.com/ai/plan/". Leave empty to switch AI planning off.
   See PROXY_SETUP.md. This is not a secret: the Anthropic key stays on the proxy. */
export const AI_PROXY_URL = "https://pssreenath.pythonanywhere.com/ai/health/";
