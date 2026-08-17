const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

let firebaseApp = null;
let isInitialized = false;

function initFirebase() {
  if (isInitialized) return firebaseApp;

  try {
    let serviceAccount = null;

    // 1. Check process.env.FIREBASE_SERVICE_ACCOUNT
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      } catch (e) {
        console.warn("⚠️ Failed to parse FIREBASE_SERVICE_ACCOUNT env string.");
      }
    }

    // 2. Check local file config/firebase-service-account.json if env was not provided
    if (!serviceAccount) {
      const filePath = path.join(__dirname, "firebase-service-account.json");
      if (fs.existsSync(filePath)) {
        serviceAccount = require(filePath);
      }
    }

    if (serviceAccount) {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      isInitialized = true;
      console.log("🔥 Firebase Admin SDK initialized successfully.");
    } else {
      console.warn(
        "⚠️ Firebase Service Account credentials missing. Push notifications will run in simulation mode.\n" +
        "   To enable live FCM push, set FIREBASE_SERVICE_ACCOUNT env var or add config/firebase-service-account.json."
      );
    }
  } catch (err) {
    console.error("❌ Firebase Admin SDK initialization error:", err.message);
  }

  return firebaseApp;
}

initFirebase();

module.exports = {
  admin: isInitialized ? admin : null,
  isInitialized: () => isInitialized,
  sendFcmMessage: async ({ tokens, topic, title, body, imageUrl, deepLink }) => {
    const payload = {
      notification: {
        title,
        body,
        ...(imageUrl && { imageUrl }),
      },
      data: {
        title,
        body,
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        deepLink: deepLink || "home",
        ...(imageUrl && { imageUrl }),
      },
    };

    if (!isInitialized || !admin) {
      console.log("💬 [FCM Simulation Mode] Would send push notification:", { topic, tokensCount: tokens?.length, payload });
      return {
        success: true,
        simulated: true,
        sentCount: topic ? 1 : (tokens ? tokens.length : 0),
        successCount: topic ? 1 : (tokens ? tokens.length : 0),
        failureCount: 0,
      };
    }

    try {
      if (topic) {
        const response = await admin.messaging().send({
          topic,
          ...payload,
        });
        console.log("🔥 FCM Topic message sent:", response);
        return {
          success: true,
          simulated: false,
          sentCount: 1,
          successCount: 1,
          failureCount: 0,
          response,
        };
      } else if (tokens && tokens.length > 0) {
        const message = {
          tokens,
          ...payload,
        };
        const response = await admin.messaging().sendMulticast(message);
        console.log(`🔥 FCM Multicast sent: ${response.successCount} success, ${response.failureCount} failed.`);
        return {
          success: true,
          simulated: false,
          sentCount: tokens.length,
          successCount: response.successCount,
          failureCount: response.failureCount,
          response,
        };
      } else {
        return {
          success: false,
          message: "No device tokens or topic provided.",
          sentCount: 0,
          successCount: 0,
          failureCount: 0,
        };
      }
    } catch (err) {
      console.error("❌ Error sending FCM message:", err);
      return {
        success: false,
        error: err.message,
        sentCount: tokens ? tokens.length : 1,
        successCount: 0,
        failureCount: tokens ? tokens.length : 1,
      };
    }
  },
};
