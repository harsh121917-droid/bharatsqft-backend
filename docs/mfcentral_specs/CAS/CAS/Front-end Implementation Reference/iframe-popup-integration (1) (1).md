# Iframe / Popup Integration Guide

MFC CAS OAuth supports three integration modes. The mode is **auto-detected at runtime** — no configuration needed from the integrating client.

| Mode | Detection | Completion channel |
|------|-----------|-------------------|
| **Iframe** | `window.self !== window.top` | `window.parent.postMessage()` |
| **Popup** | `window.opener` exists | `window.opener.postMessage()` + `window.close()` |
| **Standalone** | Default | `window.location.href` redirect with query params |

---

## Iframe Integration

Embed the CAS OAuth flow in an `<iframe>` and listen for the completion message.

```html
<iframe
  id="cas-frame"
  src="https://cas-oauth.mfcentral.com/api/auth/start?data=<encrypted_payload>"
  width="500"
  height="700"
></iframe>

<script>
  window.addEventListener('message', (event) => {
    // Validate origin
    if (event.origin !== 'https://cas-oauth.mfcentral.com') return;

    if (event.data?.type === 'mfc-cas-complete') {
      const { status, reqId, type, code, message, traceId } = event.data.data;

      if (status === 'success') {
        // Flow completed — reqId and type are available
        console.log('CAS request completed:', reqId, type);
      } else {
        // Flow errored — code, message, and traceId are available
        console.error('CAS request failed:', code, message);
      }

      // Remove the iframe, update your UI, redirect, etc.
    }
  });
</script>
```

## Popup Integration

Open the flow via `window.open()` and listen for the same message.

```html
<button id="start-cas">Start CAS Request</button>

<script>
  document.getElementById('start-cas').addEventListener('click', () => {
    window.open(
      'https://cas-oauth.mfcentral.com/api/auth/start?data=<encrypted_payload>',
      'mfc-cas',
      'width=500,height=700'
    );
  });

  window.addEventListener('message', (event) => {
    if (event.origin !== 'https://cas-oauth.mfcentral.com') return;

    if (event.data?.type === 'mfc-cas-complete') {
      const { status, reqId, type } = event.data.data;
      // The popup closes itself automatically after sending the message.
      // Handle the result here.
    }
  });
</script>
```

## Standalone (Redirect) Integration

No changes needed. The existing redirect flow works as before — the user is redirected to `redirectUrl` with query params appended:

```
https://your-app.com/callback?status=success&reqId=12345&type=summary
```

---

## Message Shape

All iframe/popup messages follow this structure:

```json
{
  "type": "mfc-cas-complete",
  "data": {
    "status": "success | error",
    "reqId": "12345",
    "type": "summary | transactions",
    "code": "ERR_NETWORK",
    "message": "Human-readable error message",
    "traceId": "uuid"
  }
}
```

| Field | Present | Description |
|-------|---------|-------------|
| `status` | Always | `"success"` or `"error"` |
| `reqId` | Success | The CAS request ID |
| `type` | Success | `"summary"` or `"transactions"` |
| `code` | Error | Error code (e.g. `ERR_NETWORK`, `ERR_SESSION`) |
| `message` | Error | User-facing error message |
| `traceId` | Error (if available) | Server trace ID for debugging |

---

## How targetOrigin Works

`postMessage` requires a `targetOrigin` to prevent messages from leaking to unintended windows.

1. The app reads `document.referrer` (automatically set by the browser to the parent/opener page URL)
2. Parses the origin from it (e.g. `https://your-app.com`)
3. Uses that as the `targetOrigin` for `postMessage`
4. Falls back to the `redirectUrl` origin if `document.referrer` is empty (e.g. when `Referrer-Policy: no-referrer` is set)

**No configuration needed** — the parent's origin is detected automatically.

### Caveat

If your page sets `Referrer-Policy: no-referrer`, `document.referrer` will be empty and the app falls back to the `redirectUrl` origin. This works correctly when your page's origin matches the `redirectUrl` origin. If they differ, either:

- Relax the referrer policy to at least `origin` (recommended): `<meta name="referrer" content="origin">`
- Ensure your `redirectUrl` shares the same origin as the embedding page

---

## Security Notes

- `targetOrigin` is never `"*"` — messages are only delivered to the detected parent origin
- The message payload contains the same data that would be sent as URL query params in the redirect flow — no new data is exposed
- Always validate `event.origin` in your message listener to ignore messages from unexpected sources
- `postMessage` is a browser API, not a network request — no CSP changes are needed
