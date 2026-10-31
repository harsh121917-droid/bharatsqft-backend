## File Downloads in WebViews

Android WebView and iOS WKWebView do not have built-in download managers. When the CAS flow triggers a QR code download, the WebView will silently ignore it unless the native app handles the download.

### Download Behaviour Matrix

| Platform                   | Download Method                                    | Works?  |
|----------------------------|----------------------------------------------------|---------|
| Desktop browsers           | Standard browser download                          | Yes     |
| iOS Safari / Custom Tab    | Native share sheet (Web Share API)                 | Yes     |
| React Native WebView       | Message bridge to native app                       | Yes     |
| Android WebView            | `data:` URI triggers native `DownloadListener`     | Yes*    |
| iOS WKWebView (iOS 15+)    | Native share sheet (Web Share API)                 | Yes     |
| iOS WKWebView (older)      | Image opened in new tab for long-press save        | Partial |

*Requires native app to implement `DownloadListener` (see below).

---

### Android WebView: Implementing the Download Handler

The CAS flow detects Android WebView and triggers downloads using `data:` URIs, which fire the WebView's `DownloadListener`. The hosting app **must** implement this listener.

**Why is this needed?** WebView's `DownloadListener` fires for `http:`, `https:`, and `data:` URLs but **not** for `blob:` URLs (which is what browsers normally use).

```java
import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Environment;
import android.util.Base64;
import android.webkit.DownloadListener;
import android.webkit.URLUtil;

// Set up the download listener on your WebView
webView.setDownloadListener(new DownloadListener() {
    @Override
    public void onDownloadStart(String url, String userAgent,
            String contentDisposition, String mimetype, long contentLength) {

        String filename = URLUtil.guessFileName(url, contentDisposition, mimetype);

        // Handle data: URIs (QR code images)
        if (url.startsWith("data:")) {
            handleDataUriDownload(url, filename);
            return;
        }

        // Handle regular HTTP(S) downloads via DownloadManager
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        request.setMimeType(mimetype);
        request.addRequestHeader("User-Agent", userAgent);

        request.setTitle(filename);
        request.setNotificationVisibility(
                DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setDestinationInExternalPublicDir(
                Environment.DIRECTORY_DOWNLOADS, filename);

        DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
        dm.enqueue(request);
    }
});
```

**Data URI handler** (for QR code image downloads):

```java
private void handleDataUriDownload(String dataUri, String filename) {
    try {
        // data:[<mediatype>][;base64],<data>
        String base64Data = dataUri.substring(dataUri.indexOf(",") + 1);
        byte[] fileData = Base64.decode(base64Data, Base64.DEFAULT);

        File downloadsDir = Environment.getExternalStoragePublicDirectory(
                Environment.DIRECTORY_DOWNLOADS);
        File outputFile = new File(downloadsDir, filename);

        FileOutputStream fos = new FileOutputStream(outputFile);
        fos.write(fileData);
        fos.close();
    } catch (Exception e) {
        Log.e("Download", "Data URI download failed", e);
    }
}
```

**Required Android permissions:**

```xml
<uses-permission android:name="android.permission.INTERNET" />
<!-- Only needed for Android 9 (API 28) and below -->
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"
    android:maxSdkVersion="28" />
```

---

### iOS WKWebView: Download Handling

**iOS 15+ (most common):** The CAS flow uses the Web Share API (`navigator.share`), which opens the native iOS share sheet with "Save Image" and "Save to Files" options. This works in most WKWebView configurations without any native-side changes.

**Older iOS versions:** If the Web Share API is not available, the flow opens the QR image in a new tab. The user can long-press the image and select "Save to Photos" or "Save to Files".

On platforms where download functionality is not supported, the hosting app can register a JavaScript message handler to receive the QR image data in postMessage.

```swift
// Native side (Swift) — register the handler
let contentController = webView.configuration.userContentController
contentController.add(self, name: "downloadHandler")

// Implement WKScriptMessageHandler
func userContentController(_ controller: WKUserContentController,
                           didReceive message: WKScriptMessage) {
    guard let body = message.body as? [String: Any],
          let type = body["type"] as? String,
          type == "mfc-cas-download",
          let data = body["data"] as? [String: String],
          let base64 = data["base64"],
          let filename = data["filename"] else { return }

    // Decode and save the file
    if let imageData = Data(base64Encoded: base64) {
        // Save to Photos, Files, or your app's storage
    }
}
```

The download message has this shape:

```json
{
    "type": "mfc-cas-download",
    "data": {
        "base64": "<base64-encoded PNG image>",
        "filename": "cas-request-qr.png"
    }
}
```

> The CAS flow auto-detects `window.webkit.messageHandlers.downloadHandler`.
---

## Flow Completion & Redirects

When the CAS flow completes (success or error), the app delivers the result back to the hosting context. The delivery mechanism is auto-detected based on the runtime environment:

### Completion Behaviour Matrix

| Context              | Delivery Method                                       | Host App Action Required         |
|----------------------|-------------------------------------------------------|----------------------------------|
| Standalone (direct)  | `window.location.href` redirect with query params     | Parse query params on landing    |
| Iframe               | `window.parent.postMessage()`                         | Listen for `message` event       |
| Popup (`window.open`)| `window.opener.postMessage()` + `window.close()`      | Listen for `message` event       |
| React Native WebView | `window.ReactNativeWebView.postMessage()`             | Handle `onMessage` prop          |

### Completion Message Shape

For iframe, popup, and React Native WebView contexts, the message is:

```json
{
    "type": "mfc-cas-complete",
    "data": {
        "status": "success",
        "reqId": "12345",
        "type": "full"
    }
}
```

On error:

```json
{
    "type": "mfc-cas-complete",
    "data": {
        "status": "error",
        "code": "ERR_SESSION",
        "message": "Your session has expired.",
        "traceId": "abc-123-def"
    }
}
```

### Standalone Redirect

For top-level (non-embedded) flows, the result is appended as query parameters to the `redirectUrl` provided during session initialization:

```
https://your-app.com/callback?status=success&reqId=12345&type=full
```

### Iframe / Popup: Listening for Completion

The host page must listen for the `message` event and filter by `type`:

```javascript
window.addEventListener("message", (event) => {
    // Validate origin matches the CAS domain
    if (event.origin !== "https://cas.mfcentral.com") return;

    const { type, data } = event.data;
    if (type === "mfc-cas-complete") {
        if (data.status === "success") {
            // Flow completed — reqId and type are available in data
        } else {
            // Error — code, message, and traceId are available in data
        }
    }
});
```

### React Native WebView: Handling Completion

```jsx
<WebView
    source={{ uri: casFlowUrl }}
    onMessage={(event) => {
        const message = JSON.parse(event.nativeEvent.data);
        if (message.type === "mfc-cas-complete") {
            // Handle completion
        }
        if (message.type === "mfc-cas-download") {
            // Handle QR code download (see Download section above)
        }
    }}
/>
```

---

## Integrator Checklist

### Android WebView

- [ ] Enable JavaScript: `settings.setJavaScriptEnabled(true)`
- [ ] Enable DOM storage: `settings.setDomStorageEnabled(true)`
- [ ] Implement `DownloadListener` for file downloads (see code above)
- [ ] Handle `data:` URIs in the download listener for QR code saves
- [ ] Add `WRITE_EXTERNAL_STORAGE` permission for Android 9 and below

### iOS WKWebView

- [ ] Ensure JavaScript is enabled (default)
- [ ] Verify `navigator.share` works in your WKWebView configuration (iOS 15+)
- [ ] Register `WKScriptMessageHandler` where QR download is not supported

### Iframe / Popup

- [ ] Listen for `message` events with `type: "mfc-cas-complete"` (see code above)
- [ ] Validate `event.origin` matches the CAS domain
- [ ] Handle both `success` and `error` statuses in the completion payload

### React Native WebView

- [ ] Handle `mfc-cas-download` messages for QR code downloads
- [ ] Handle `mfc-cas-complete` messages for flow completion
- [ ] See the [Iframe / Popup Integration Guide](./iframe-popup-integration.md) for full integration examples
