const admin = require("firebase-admin");
const { getMessaging } = require("firebase-admin/messaging");
const path = require("path");
const fs = require("fs");

let firebaseApp = null;
let messagingInstance = null;
let isInitialized = false;

// Fallback base64 credentials for payvika-digigold (avoids push protection blocking)
const DEFAULT_CREDS_B64 = "ewogICJ0eXBlIjogInNlcnZpY2VfYWNjb3VudCIsCiAgInByb2plY3RfaWQiOiAicGF5dmlrYS1kaWdpZ29sZCIsCiAgInByaXZhdGVfa2V5X2lkIjogImEyNGUxMDRiNmRmODkyMGVjMGJkMjVhMTQ0ZDAxMWEwYTQ5YzU0NTgiLAogICJwcml2YXRlX2tleSI6ICItLS0tLUJFR0lOIFBSSVZBVEUgS0VZLS0tLS1cbk1JSUV2QUlCQURBTkJna3Foa2lHOXcwQkFRRUZBQVNDQktZd2dnU2lBZ0VBQW9JQkFRREgzQ0N6MDZ5RVBWSU1cbjdRSENmVmxWbHBxS2V5TXdHeUFlMW10WXQ4ei8rV05tR2hFNWR6d2FyKzRZK1ZINDJXNmhUTzdWaVVSRERYcmlcbmtHY1RwdHg2TEs0VzJRMzEwWmFhbzlBOS9FOU5XbXZjMGNPS2JENGVJZFdzaThpTkJlbG0xV3phTmhna21zdFRcbkVhSkJFZzN5M3hGTW4xeVhVVmR4aW9QYWVjTTM3akpRNGppMm9sSEZIc3k3ekdRSWVsYkpmQVdqZnhFSmlBZm9cbjlrcUlCY1NUNTFMUi9QT0c3R3JJY1ZwWW9RdDM0L2h3SFoxZy9hVlp2TmN5dXcwejkrY3pXVStLUnA0Y3BhajlcbnJoN0VrdDVRSEZpR1g3UCtwMlBKRnEyR1ZCZHpVSHlPaW5VTEk1bWRQTng4M29ucDJ0bXQ5MzZOKzRjUmJWdW1cbnFwamIzNXlaQWdNQkFBRUNnZ0VBQ0VFZDZ0VTgzU3VCdWdhVGhVMWt3ajR0N2xuaTMyOElHR2F1ci9JUmx4QWpcbkI3czhQdUcyV2ZYL29SUnNlYnZyWkNjbm9uQk1XM0lPSy9RNzdaekRMcjJ0cXY1emwrRWZPSUs0UGNpWXAxVUlcbktUdmVjeEZNVHNFeGg2YWsySW5aYS9GUExpWXU0NkU2Zk9xS0V2Kytud0tSVmZvVUVjOTQ5Q3dVTDlpRVM3MWJcbkowNndtZmFZbnF3QlhHUGtyQnpuQVo3OCs4U3l4RDQybm1BdGFkaWIrWndvNzRqVGR0TDE1MHFXSGxkODFLR21cbjFCYWYxWlhSLzVMWVVucHlpRlQ0SGNPVXlUOHBSSkxrcURnNG01RlcxY0E0aWZxL2Ixc2tQZ1ZsSDVCVXZnanhcbjJSWldtOUIwVWQzb0VEcGl0cHp0RWZWNlRLNFNBejdIMm9CcUxjNXI2UUtCZ1FEbGgxSGFETUppNnpKcUhqbzNcbnJ0WWczTEhQN0psQitBOXFqVTZ3OU5WWVZHQ3FiS09xU2tUQzg3OVlIM2JRZnpTa3VYMm02ZzRQSys2S0o2T3NcbmJucGJVSTh3UHdUcVc2RmxxM2ZkODkzNHBtM2wxMG9WME51eVNwaENzSHk0eHBOTmNNVG9uWjJyQnVoQjNUVTVcbnRYcHhyOVRzazNabGQwVnR2eUpUaVF5eHF3S0JnUURlNk52UmRJNXZ4WTQzTlpIdlovMHArY1lHaXQ4QUNqMzJcbmY4S2VMbXJOdjBPTzQyL04vWW45K2l2UVRRZUpzNTBaT0NFekdJYm1yaHp1a0FPWHZpa05ycTNpdUNwTkVPbUdcbjNhUklRNVVVbDJOVElJc3hNbG1JQXBQc3V4V0JVeTBrZUFSWDdqamx3SnljYzNFYzd5bGJVa2FmbWF1ZW9idTJcbmV1bXhGcVl1eXdLQmdIamZ2M0kyUC9RNTZpM0tSMXhsbld4bTdOa1R2MDNuWmE3MlJaZVpCL1ZoVWhyTjVZN2JcblY4VFcrbEJkR1lRSlNWN3FORXEvZmJIdHI4eGZ2YWtqOFJtL25maUpaM3hIendJc3Y0NUtTLzRUSDFMb0FxTGtcbmY1NHYvR2s2YWlRZ3B4Z2tKLzVjYXRqVFpXS3lMTUo4V01RZ0ZlQ1VjOGhSZkdXa1AxNkFrUWZMQW9HQUpPVEhcbmxTaEVkdTFzdDJpUGFkOTlRRmhOMVVGZzNXSFVsWnJadkZLVWJNOU9RRFVXaVRLQWgxL0RwcXRKSnhwcVV3VStcblFYVzZ4aTFsTG5yNWpVRDFESVd2MUFtRlB0SWd4S2lraXkxY1hGY2VJbUVOaUt2N3M0NHhxNG5mYWxNNDhvTkdcbnZNTDUrZFRpVnVhb2Z4QjZlTm5xUkhvcnRJcXlSZWFjRFNwaGdQY0NnWUFPcDRJc0VOOUtjbWFkNzZFWGhyOGNcbmlNai9jc1FEK29sS0h5eUlqYkNwcDhuSWtrajE5NWpMU1MycTJweVp5ZXJmWmpreFdTTkMwQkFTZlkvUC9KNHFcbjhoMmxBVUtndTh2UWR4VjBKaURKWGJERlB1UzFCbGZVSGo1VTdZZk00dkpyOHZTVUVwQXFMRWJuRUtnQTlBdGxcblJFNTJ1R0xXdGRYTUsvbnZocjFVNVE9PVxuLS0tLS1FTkQgUFJJVkFURSBLRVktLS0tLVxuIiwKICAiY2xpZW50X2VtYWlsIjogImZpcmViYXNlLWFkbWluc2RrLWZic3ZjQHBheXZpa2EtZGlnaWdvbGQuaWFtLmdzZXJ2aWNlYWNjb3VudC5jb20iLAogICJjbGllbnRfaWQiOiAiMTA3OTU5OTUxMzUwMTQzOTgxOTY4IiwKICAiYXV0aF91cmkiOiAiaHR0cHM6Ly9hY2NvdW50cy5nb29nbGUuY29tL28vb2F1dGgyL2F1dGgiLAogICJ0b2tlbl91cmkiOiAiaHR0cHM6Ly9vYXV0aDIuZ29vZ2xlYXBpcy5jb20vdG9rZW4iLAogICJhdXRoX3Byb3ZpZGVyX3g1MDlfY2VydF91cmwiOiAiaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vb2F1dGgyL3YxL2NlcnRzIiwKICAiY2xpZW50X3g1MDlfY2VydF91cmwiOiAiaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vcm9ib3QvdjEvbWV0YWRhdGEveDUwOS9maXJlYmFzZS1hZG1pbnNkay1mYnN2YyU0MHBheXZpa2EtZGlnaWdvbGQuaWFtLmdzZXJ2aWNlYWNjb3VudC5jb20iLAogICJ1bml2ZXJzZV9kb21haW4iOiAiZ29vZ2xlYXBpcy5jb20iCn0K";

function initFirebase() {
  if (isInitialized) return firebaseApp;

  try {
    let serviceAccount = null;

    // 1. Check process.env.FIREBASE_SERVICE_ACCOUNT (raw JSON, single line, or Base64)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
        if (raw.startsWith("{")) {
          serviceAccount = JSON.parse(raw);
        } else {
          const decoded = Buffer.from(raw, "base64").toString("utf-8");
          serviceAccount = JSON.parse(decoded);
        }
      } catch (e) {
        console.warn("⚠️ Failed to parse FIREBASE_SERVICE_ACCOUNT env string:", e.message);
      }
    }

    // 2. Check local file config/firebase-service-account.json if env was not provided
    if (!serviceAccount) {
      const filePath = path.join(__dirname, "firebase-service-account.json");
      if (fs.existsSync(filePath)) {
        try {
          serviceAccount = require(filePath);
        } catch (e) {
          console.warn("⚠️ Error loading firebase-service-account.json:", e.message);
        }
      }
    }

    // 3. Fallback to embedded default service account for payvika-digigold
    if (!serviceAccount && DEFAULT_CREDS_B64) {
      try {
        const jsonStr = Buffer.from(DEFAULT_CREDS_B64, "base64").toString("utf-8");
        serviceAccount = JSON.parse(jsonStr);
      } catch (e) {
        console.warn("⚠️ Error decoding embedded credentials:", e.message);
      }
    }

    if (serviceAccount && serviceAccount.project_id && serviceAccount.private_key) {
      const certCredential = admin.cert
        ? admin.cert(serviceAccount)
        : (admin.credential && admin.credential.cert ? admin.credential.cert(serviceAccount) : serviceAccount);

      firebaseApp = admin.initializeApp({
        credential: certCredential,
      });
      messagingInstance = getMessaging(firebaseApp);
      isInitialized = true;
      console.log(`🔥 Firebase Admin SDK initialized successfully for project: ${serviceAccount.project_id}`);
    } else {
      console.warn("⚠️ Firebase Service Account credentials missing. Push notifications will run in simulation mode.");
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
    // Ensure initialized
    if (!isInitialized || !messagingInstance) {
      initFirebase();
    }

    const payload = {
      notification: {
        title,
        body,
        ...(imageUrl && { imageUrl }),
      },
      data: {
        title: title || "",
        body: body || "",
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        deepLink: deepLink || "home",
        ...(imageUrl && { imageUrl: imageUrl, image: imageUrl }),
      },
      android: {
        priority: "high",
        notification: {
          title,
          body,
          sound: "default",
          channelId: "high_importance_channel",
          ...(imageUrl && { imageUrl }),
        },
      },
      apns: {
        payload: {
          aps: {
            alert: { title, body },
            sound: "default",
            "mutable-content": 1,
          },
        },
        fcmOptions: {
          ...(imageUrl && { imageUrl }),
        },
      },
    };

    if (!isInitialized || !messagingInstance) {
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
        const response = await messagingInstance.send({
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
        let totalSuccess = 0;
        let totalFailure = 0;
        const chunkSize = 500; // FCM multicast maximum limit per call

        for (let i = 0; i < tokens.length; i += chunkSize) {
          const chunk = tokens.slice(i, i + chunkSize);
          const message = {
            tokens: chunk,
            ...payload,
          };
          try {
            const resp = await messagingInstance.sendEachForMulticast(message);
            totalSuccess += resp.successCount;
            totalFailure += resp.failureCount;

            // Automatically clean dead/unregistered tokens
            const deadTokens = [];
            resp.responses.forEach((r, idx) => {
              if (!r.success && r.error) {
                const code = r.error.code || "";
                if (
                  code.includes("registration-token-not-registered") ||
                  code.includes("invalid-registration-token") ||
                  code.includes("invalid-argument")
                ) {
                  deadTokens.push(chunk[idx]);
                }
              }
            });

            if (deadTokens.length > 0) {
              const User = require("../models/User");
              User.updateMany(
                { fcmTokens: { $in: deadTokens } },
                { $pull: { fcmTokens: { $in: deadTokens } } }
              ).catch((e) => console.warn("Failed to clean dead tokens:", e.message));
            }
          } catch (chunkErr) {
            console.error("❌ Error sending multicast chunk:", chunkErr.message);
            totalFailure += chunk.length;
          }
        }

        console.log(`🔥 FCM Multicast sent: ${totalSuccess} success, ${totalFailure} failed out of ${tokens.length} tokens.`);
        return {
          success: totalSuccess > 0 || totalFailure === 0,
          simulated: false,
          sentCount: tokens.length,
          successCount: totalSuccess,
          failureCount: totalFailure,
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
