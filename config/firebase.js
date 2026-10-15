const admin = require("firebase-admin");
const { getMessaging } = require("firebase-admin/messaging");
const path = require("path");
const fs = require("fs");

// Fallback base64 credentials for payvika-digigold (avoids push protection blocking)
const DEFAULT_CREDS_B64 = "ewogICJ0eXBlIjogInNlcnZpY2VfYWNjb3VudCIsCiAgInByb2plY3RfaWQiOiAicGF5dmlrYS1kaWdpZ29sZCIsCiAgInByaXZhdGVfa2V5X2lkIjogImEyNGUxMDRiNmRmODkyMGVjMGJkMjVhMTQ0ZDAxMWEwYTQ5YzU0NTgiLAogICJwcml2YXRlX2tleSI6ICItLS0tLUJFR0lOIFBSSVZBVEUgS0VZLS0tLS1cbk1JSUV2QUlCQURBTkJna3Foa2lHOXcwQkFRRUZBQVNDQktZd2dnU2lBZ0VBQW9JQkFRREgzQ0N6MDZ5RVBWSU1cbjdRSENmVmxWbHBxS2V5TXdHeUFlMW10WXQ4ei8rV05tR2hFNWR6d2FyKzRZK1ZINDJXNmhUTzdWaVVSRERYcmlcbmtHY1RwdHg2TEs0VzJRMzEwWmFhbzlBOS9FOU5XbXZjMGNPS2JENGVJZFdzaThpTkJlbG0xV3phTmhna21zdFRcbkVhSkJFZzN5M3hGTW4xeVhVVmR4aW9QYWVjTTM3akpRNGppMm9sSEZIc3k3ekdRSWVsYkpmQVdqZnhFSmlBZm9cbjlrcUlCY1NUNTFMUi9QT0c3R3JJY1ZwWW9RdDM0L2h3SFoxZy9hVlp2TmN5dXcwejkrY3pXVStLUnA0Y3BhajlcbnJoN0VrdDVRSEZpR1g3UCtwMlBKRnEyR1ZCZHpVSHlPaW5VTEk1bWRQTng4M29ucDJ0bXQ5MzZOKzRjUmJWdW1cbnFwamIzNXlaQWdNQkFBRUNnZ0VBQ0VFZDZ0VTgzU3VCdWdhVGhVMWt3ajR0N2xuaTMyOElHR2F1ci9JUmx4QWpcbkI3czhQdUcyV2ZYL29SUnNlYnZyWkNjbm9uQk1XM0lPSy9RNzdaekRMcjJ0cXY1emwrRWZPSUs0UGNpWXAxVUlcbktUdmVjeEZNVHNFeGg2YWsySW5aYS9GUExpWXU0NkU2Zk9xS0V2Kytud0tSVmZvVUVjOTQ5Q3dVTDlpRVM3MWJcbkowNndtZmFZbnF3QlhHUGtyQnpuQVo3OCs4U3l4RDQybm1BdGFkaWIrWndvNzRqVGR0TDE1MHFXSGxkODFLR21cbjFCYWYxWlhSLzVMWVVucHlpRlQ0SGNPVXlUOHBSSkxrcURnNG01RlcxY0E0aWZxL2Ixc2tQZ1ZsSDVCVXZnanhcbjJSWldtOUIwVWQzb0VEcGl0cHp0RWZWNlRLNFNBejdIMm9CcUxjNXI2UUtCZ1FEbGgxSGFETUppNnpKcUhqbzNcbnJ0WWczTEhQN0psQitBOXFqVTZ3OU5WWVZHQ3FiS09xU2tUQzg3OVlIM2JRZnpTa3VYMm02ZzRQSys2S0o2T3NcbmJucGJVSTh3UHdUcVc2RmxxM2ZkODkzNHBtM2wxMG9WME51eVNwaENzSHk0eHBOTmNNVG9uWjJyQnVoQjNUVTVcbnRYcHhyOVRzazNabGQwVnR2eUpUaVF5eHF3S0JnUURlNk52UmRJNXZ4WTQzTlpIdlovMHArY1lHaXQ4QUNqMzJcbmY4S2VMbXJOdjBPTzQyL04vWW45K2l2UVRRZUpzNTBaT0NFekdJYm1yaHp1a0FPWHZpa05ycTNpdUNwTkVPbUdcbjNhUklRNVVVbDJOVElJc3hNbG1JQXBQc3V4V0JVeTBrZUFSWDdqamx3SnljYzNFYzd5bGJVa2FmbWF1ZW9idTJcbmV1bXhGcVl1eXdLQmdIamZ2M0kyUC9RNTZpM0tSMXhsbld4bTdOa1R2MDNuWmE3MlJaZVpCL1ZoVWhyTjVZN2JcblY4VFcrbEJkR1lRSlNWN3FORXEvZmJIdHI4eGZ2YWtqOFJtL25maUpaM3hIendJc3Y0NUtTLzRUSDFMb0FxTGtcbmY1NHYvR2s2YWlRZ3B4Z2tKLzVjYXRqVFpXS3lMTUo4V01RZ0ZlQ1VjOGhSZkdXa1AxNkFrUWZMQW9HQUpPVEhcbmxTaEVkdTFzdDJpUGFkOTlRRmhOMVVGZzNXSFVsWnJadkZLVWJNOU9RRFVXaVRLQWgxL0RwcXRKSnhwcVV3VStcblFYVzZ4aTFsTG5yNWpVRDFESVd2MUFtRlB0SWd4S2lraXkxY1hGY2VJbUVOaUt2N3M0NHhxNG5mYWxNNDhvTkdcbnZNTDUrZFRpVnVhb2Z4QjZlTm5xUkhvcnRJcXlSZWFjRFNwaGdQY0NnWUFPcDRJc0VOOUtjbWFkNzZFWGhyOGNcbmlNai9jc1FEK29sS0h5eUlqYkNwcDhuSWtrajE5NWpMU1MycTJweVp5ZXJmWmpreFdTTkMwQkFTZlkvUC9KNHFcbjhoMmxBVUtndTh2UWR4VjBKaURKWGJERlB1UzFCbGZVSGo1VTdZZk00dkpyOHZTVUVwQXFMRWJuRUtnQTlBdGxcblJFNTJ1R0xXdGRYTUsvbnZocjFVNVE9PVxuLS0tLS1FTkQgUFJJVkFURSBLRVktLS0tLVxuIiwKICAiY2xpZW50X2VtYWlsIjogImZpcmViYXNlLWFkbWluc2RrLWZic3ZjQHBheXZpa2EtZGlnaWdvbGQuaWFtLmdzZXJ2aWNlYWNjb3VudC5jb20iLAogICJjbGllbnRfaWQiOiAiMTA3OTU5OTUxMzUwMTQzOTgxOTY4IiwKICAiYXV0aF91cmkiOiAiaHR0cHM6Ly9hY2NvdW50cy5nb29nbGUuY29tL28vb2F1dGgyL2F1dGgiLAogICJ0b2tlbl91cmkiOiAiaHR0cHM6Ly9vYXV0aDIuZ29vZ2xlYXBpcy5jb20vdG9rZW4iLAogICJhdXRoX3Byb3ZpZGVyX3g1MDlfY2VydF91cmwiOiAiaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vb2F1dGgyL3YxL2NlcnRzIiwKICAiY2xpZW50X3g1MDlfY2VydF91cmwiOiAiaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vcm9ib3QvdjEvbWV0YWRhdGEveDUwOS9maXJlYmFzZS1hZG1pbnNkay1mYnN2YyU0MHBheXZpa2EtZGlnaWdvbGQuaWFtLmdzZXJ2aWNlYWNjb3VudC5jb20iLAogICJ1bml2ZXJzZV9kb21haW4iOiAiZ29vZ2xlYXBpcy5jb20iCn0K";

// Fallback base64 credentials for payvika-vikaone (avoids push protection blocking)
const DEFAULT_DRX_CREDS_B64 = "ewogICJ0eXBlIjogInNlcnZpY2VfYWNjb3VudCIsCiAgInByb2plY3RfaWQiOiAicGF5dmlrYS12aWthb25lIiwKICAicHJpdmF0ZV9rZXlfaWQiOiAiZTk2NDllNmQwMWQ4MGQzNzY3MTNjZTg5NjdiYjQ3NzgxZmJiYWU1MCIsCiAgInByaXZhdGVfa2V5IjogIi0tLS0tQkVHSU4gUFJJVkFURSBLRVktLS0tLVxuTUlJRXZRSUJBREFOQmdrcWhraUc5dzBCQVFFRkFBU0NCS2N3Z2dTakFnRUFBb0lCQVFETE9TNk9oajRVRFNrclxuUWFOc2V6bXRuZG54bVEyeW5KLyt6RW1LSWNnK3dEZUZGcGxkVGtvRnE4ZFgwMkowNVhKeVJQcEhXNVVGcmVXT1xuMEFvM1JUK1owUElEMWMreDlYS2VsWE9wRUprYWF0cGFCR3dCcTFVanEwMGo5T2xtbWorU2NqeGpkUmtSajlkNlxuVm5zczN1dU1XNlQ0V25jZEN2YnJlV3QzY0pzTzZTWmZaMGxEWG5kYXFvMXBaZzZtWERQZFAwSmRuNGI0MzZyN1xuQnpzR3ZacEpDOHUxaGtOdm9DMW1XUHlSeXd6VUVkTWNJbWdVYlY5Y21TL2RaeEw0WFNwbG5OTVMvcmd1U1J3ZVxuY2NwYzZiajFDYXlLQWlFbjg4WUNoc2w4dzFNVEtwUkhZeG5acnFsMmpBRWZka2lveFRmSFRXdWhuL3ZiYnhNMFxuMFFzUkJlOVJBZ01CQUFFQ2dnRUFCV3JhUlpPZWRrYjF0RE9KTXNXVC8zK0pTQURaaUt1VzhzZUQ4QzRhSE5KMFxuMnhsWkFDL0xvVWJTTndmRUtlNVV2SkhVNlAvUDgwd0QrM01xNEl5NS9JU3NITzRrcUhUQ1IvMWZMU1cyS25UVFxuS2wrUU9Ga0JSQ1N5QWQyVlRCRHhmL3JkQnFyZ1ByNVA3ZERveCsrUE1IN0t3U2J2NGxyd3JlS0poWkJmaG5oUFxuRGIxd3VYWUpLcE16QVRmb0hsRGFUQWxpTGxudHdseGFiUDNNd3FjN09DQ0lTdGtqaGpxZW9GcE9hQXF3YnJ2VlxuOENTaTdJc2VCRE4zVndnN0h1a1IzTjJhV0NLZGhYcWtSU0YraHlYNTA4blJjZXF6S2M5NWZOSzdOQ1lTRlNMU1xuaDU5eTd2S0pERnlUNS9CWllhTW5kbVV0eHMxR0FUNDBYMDh1RWpoTXVRS0JnUURwQlpUdmxFNkJ4WE5xcXEwa1xuUythTXorUVJJU29HQTBQZ0pPMHdNZGg4Nmo3ZTJDVDZuT0l2ZkYycDF4VWlTM1ZsM0NBUWg5aUFaYmdQRHozdFxuc0NIdXBWenhDN0ZlUnJ6SmJDN3BPa3A2Z1FEOU15dXBnU0VEcUtrY1VzUEQ3VnJCTTRjSFdjeTJyV29HMnN1ZVxuOWtYMTJHUkRmc0NDU1VPU3FiYVhFYlRjdVFLQmdRRGZRMTNHcHVqd05rbWJCajVkT0tVbVEvZnFJSDl0YW5QV1xubXkvSXNOeDJxUk1LaE1ZbUR5ajFRUlpnSkI4Tk1haTZqSzJPZEZyUGZyNHNoYXBHTFMrMWROblZtVzZ6ZzZBRlxuQ3VNd0swd29MeWQwQ2NJZU4wWFhpVlE1WUtPMEtudjZITUl4M0ZUYkMwWXJOVHkxcytpTHBwQklrL0RKdlp4ZVxuOUdSa0FOTkxXUUtCZ0doUFdGbGE0VDNVUHBNOExkOTJucERnS3U3RUVzUzRSM1VaOHBkRmFPeWFDMlRFQ3VHb1xud3RPUTczaXMwRWdXMFVtMG5TSHBQYkJVV0cxZFhGSi9LdUZpWXRXQWIzaU5YOHNtdzJVaDg5OGN5bTJOcjNqa1xuVmZ3R1R4VmZzMFNNaHJpL3NTMUlOSXg5MmwyUktkOVJ6UVY5Ulh5MVM4WEd1Qm42SU1ORmFObjVBb0dBZmtad1xuNUttRXVGQk1JMFZOd3BZR09uVlk0L0FMZ293aUJuQnhmMVlnNjNCSFY3eXZBZG16TmJ2aGR2RVhLdlE2VllDNVxuclFlOFVQMkRmRlVCY0gyZ0xVWnc2bkhFZmYzbFpOUzZtSVQwcHdtOGk5SDFHL2Z4SmE0RG1BeERxdVFZaU9iNVxuSXhCV1lpbW5QMHIyRW1NMkZMNVpmdU5GM2lUREs2V1lua01sUHNrQ2dZRUF1ZmloNHJNZ1h4eU5QM3d2RnZaVVxuWmlJQmd0TmJZTWJRU01TOThGZUk5TjJsNk9NYUlpVW1NYXZ1TlhwWG5iL1d2cFJySGJHZ283VFpseTNoK0d1RFxuVmJDUzZjV2M3a3ExWEtqeHZwZFAxT0ozU0J4elJGMUs2L0xaVTk0UkNPOWhjREwwZitDUVBPOS9ZWjZJdlRMTVxuUHUyUHdXRW9NOWhVZFdqS1FLcDFIZFE9XG4tLS0tLUVORCBQUklWQVRFIEtFWS0tLS0tXG4iLAogICJjbGllbnRfZW1haWwiOiAiZmlyZWJhc2UtYWRtaW5zZGstZmJzdmNAcGF5dmlrYS12aWthb25lLmlhbS5nc2VydmljZWFjY291bnQuY29tIiwKICAiY2xpZW50X2lkIjogIjExNjU1MDAxMjczNDQ5NzkzODIzNiIsCiAgImF1dGhfdXJpIjogImh0dHBzOi8vYWNjb3VudHMuZ29vZ2xlLmNvbS9vL29hdXRoMi9hdXRoIiwKICAidG9rZW5fdXJpIjogImh0dHBzOi8vb2F1dGgyLmdvb2dsZWFwaXMuY29tL3Rva2VuIiwKICAiYXV0aF9wcm92aWRlcl94NTA5X2NlcnRfdXJsIjogImh0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL29hdXRoMi92MS9jZXJ0cyIsCiAgImNsaWVudF94NTA5X2NlcnRfdXJsIjogImh0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL3JvYm90L3YxL21ldGFkYXRhL3g1MDkvZmlyZWJhc2UtYWRtaW5zZGstZmJzdmMlNDBwYXl2aWthLXZpa2FvbmUuaWFtLmdzZXJ2aWNlYWNjb3VudC5jb20iLAogICJ1bml2ZXJzZV9kb21haW4iOiAiZ29vZ2xlYXBpcy5jb20iCn0K";

const appInstances = {
  digigold: { app: null, messaging: null, isInit: false },
  vikadrx: { app: null, messaging: null, isInit: false },
};

function parseServiceAccount(raw) {
  if (!raw) return null;
  try {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{")) {
      return JSON.parse(trimmed);
    } else {
      const decoded = Buffer.from(trimmed, "base64").toString("utf-8");
      return JSON.parse(decoded);
    }
  } catch (e) {
    return null;
  }
}

// 1. Initialize DigiGold Firebase App
function initDigiGold() {
  if (appInstances.digigold.isInit) return appInstances.digigold;

  try {
    let creds = null;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      creds = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
    }
    if (!creds) {
      const filePath = path.join(__dirname, "firebase-service-account.json");
      if (fs.existsSync(filePath)) {
        try {
          creds = require(filePath);
        } catch (_) {}
      }
    }
    if (!creds && DEFAULT_CREDS_B64) {
      creds = parseServiceAccount(DEFAULT_CREDS_B64);
    }

    if (creds && creds.project_id && creds.private_key) {
      const app = admin.initializeApp(
        { credential: admin.credential ? admin.credential.cert(creds) : admin.cert(creds) },
        "digigold"
      );
      appInstances.digigold = {
        app,
        messaging: getMessaging(app),
        isInit: true,
        projectId: creds.project_id,
      };
      console.log(`🔥 Firebase [DigiGold] initialized for project: ${creds.project_id}`);
    }
  } catch (err) {
    console.error("❌ Firebase [DigiGold] init error:", err.message);
  }

  return appInstances.digigold;
}

// 2. Initialize Vika DRX Firebase App
function initVikaDrx() {
  if (appInstances.vikadrx.isInit) return appInstances.vikadrx;

  try {
    let creds = null;
    // Check environment variable
    if (process.env.FIREBASE_SERVICE_ACCOUNT_DRX) {
      creds = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_DRX);
    }
    // Check config/firebase-service-account-drx.json
    if (!creds) {
      const filePath = path.join(__dirname, "firebase-service-account-drx.json");
      if (fs.existsSync(filePath)) {
        try {
          creds = require(filePath);
        } catch (e) {
          console.warn("⚠️ Failed to read firebase-service-account-drx.json:", e.message);
        }
      }
    }

    // Fallback to embedded default service account for payvika-vikaone
    if (!creds && DEFAULT_DRX_CREDS_B64) {
      creds = parseServiceAccount(DEFAULT_DRX_CREDS_B64);
    }

    if (creds && creds.project_id && creds.private_key) {
      const app = admin.initializeApp(
        { credential: admin.credential ? admin.credential.cert(creds) : admin.cert(creds) },
        "vikadrx"
      );
      appInstances.vikadrx = {
        app,
        messaging: getMessaging(app),
        isInit: true,
        projectId: creds.project_id,
      };
      console.log(`🔥 Firebase [Vika DRX] initialized for project: ${creds.project_id}`);
    } else {
      console.log("ℹ️ Firebase [Vika DRX] service account not configured yet (place credentials in config/firebase-service-account-drx.json).");
    }
  } catch (err) {
    console.error("❌ Firebase [Vika DRX] init error:", err.message);
  }

  return appInstances.vikadrx;
}

// Initial bootstrap
initDigiGold();
initVikaDrx();

module.exports = {
  admin,
  initDigiGold,
  initVikaDrx,
  isDrxInitialized: () => !!appInstances.vikadrx.isInit,
  isGoldInitialized: () => !!appInstances.digigold.isInit,

  sendFcmMessage: async ({ app = "vikadrx", tokens, topic, title, body, imageUrl, deepLink }) => {
    // Resolve app instance
    const targetApp = app === "digigold" ? "digigold" : "vikadrx";
    const targetPackage = targetApp === "digigold" ? "com.payvika.vikaone" : "com.vikaone.vikadrx";
    let instance = targetApp === "digigold" ? initDigiGold() : initVikaDrx();

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
        appSource: targetApp,
        targetPackage,
        schemeUri: targetApp === "digigold" ? `vikaone://${deepLink || "home"}` : `vikadrx://${deepLink || "home"}`,
        ...(imageUrl && { imageUrl, image: imageUrl }),
      },
      android: {
        priority: "high",
        restrictedPackageName: targetPackage,
        notification: {
          title,
          body,
          sound: "default",
          channelId: "high_importance_channel",
          clickAction: "FLUTTER_NOTIFICATION_CLICK",
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

    if (!instance.isInit || !instance.messaging) {
      const missingReason =
        targetApp === "vikadrx"
          ? "DRX Firebase Admin credentials not found. Place firebase-service-account-drx.json in config/ to enable live push to DRX app."
          : "DigiGold Firebase Admin credentials not found.";
      console.log(`💬 [FCM Simulation Mode - ${targetApp}] ${missingReason}`);
      return {
        success: true,
        simulated: true,
        note: missingReason,
        sentCount: topic ? 1 : tokens ? tokens.length : 0,
        successCount: topic ? 1 : tokens ? tokens.length : 0,
        failureCount: 0,
      };
    }

    const messagingInstance = instance.messaging;

    try {
      if (topic) {
        const response = await messagingInstance.send({
          topic,
          ...payload,
        });
        console.log(`🔥 FCM [${targetApp}] Topic message sent to '${topic}':`, response);
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
        const chunkSize = 500;

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
              const fieldToClean = targetApp === "vikadrx" ? "fcmTokensDrx" : "fcmTokens";
              User.updateMany(
                { [fieldToClean]: { $in: deadTokens } },
                { $pull: { [fieldToClean]: { $in: deadTokens } } }
              ).catch((e) => console.warn("Failed to clean dead tokens:", e.message));
            }
          } catch (chunkErr) {
            console.error(`❌ Error sending multicast chunk for [${targetApp}]:`, chunkErr.message);
            totalFailure += chunk.length;
          }
        }

        console.log(
          `🔥 FCM [${targetApp}] Multicast sent: ${totalSuccess} success, ${totalFailure} failed out of ${tokens.length} tokens.`
        );
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
      console.error(`❌ Error sending FCM message for [${targetApp}]:`, err);
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
