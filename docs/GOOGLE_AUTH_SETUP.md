# Google OAuth Setup for YouTube Detox Extension

This guide walks you through setting up Google Sign-In for the extension.

## 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a Project" → "New Project"
3. Name it something like "YouTube Detox"
4. Click "Create"

## 2. Enable the Required APIs

1. Go to **APIs & Services** → **Library**
2. Search for and enable:
   - **Google People API** (for profile info)

## 3. Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** (or Internal if using Google Workspace)
3. Fill in the required fields:
   - App name: `YouTube Detox`
   - User support email: your email
   - Developer contact: your email
4. Click "Save and Continue"
5. Add scopes:
   - `openid`
   - `email`
   - `profile`
6. Add test users (your email) while in testing mode
7. Complete the setup

## 4. Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Choose **Chrome Extension** as the application type
4. Fill in:
   - Name: `YouTube Detox Extension`
   - Item ID: Your extension's ID (see below)

### Getting Your Extension ID

**During Development:**
1. Load the extension in Chrome at `chrome://extensions/`
2. Enable "Developer mode"
3. Load the unpacked extension from `packages/extension/dist`
4. Copy the ID shown (e.g., `abcdefghijklmnopqrstuvwxyz123456`)

**For Published Extensions:**
- The ID will be assigned when you publish to Chrome Web Store

## 5. Update manifest.json

Replace the placeholder values in `packages/extension/manifest.json`:

```json
{
  "oauth2": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "scopes": [
      "openid",
      "email", 
      "profile"
    ]
  },
  "key": "YOUR_EXTENSION_KEY"
}
```

### Getting Your Extension Key

To keep the same extension ID during development:

1. Go to `chrome://extensions/`
2. Enable Developer mode
3. Click "Pack extension" on your unpacked extension
4. This generates a `.crx` file and a `.pem` file
5. Convert the public key from the `.pem` to the manifest key format:

```bash
openssl rsa -in extension.pem -pubout -outform DER | openssl base64 -A
```

Or use this simpler approach:
1. Load the extension unpacked
2. Note the ID
3. Add this to manifest.json to lock the ID:

```json
"key": "MIIBIjANBgkqhki..."  // Your public key
```

## 6. Test the Setup

1. Rebuild the extension: `pnpm build:ext`
2. Reload in Chrome
3. Open extension options
4. Go to "Sync" tab
5. Click "Sign in with Google"
6. Complete the OAuth flow

## Troubleshooting

### "This app isn't verified"
- Normal during development with test users
- Click "Advanced" → "Go to YouTube Detox (unsafe)"

### "Access blocked: Authorization Error"
- Check that your Google account is added as a test user
- Verify the OAuth consent screen is configured correctly

### "Invalid client_id"
- Ensure the client ID in manifest.json matches exactly
- Make sure you selected "Chrome Extension" as the app type

### Extension ID keeps changing
- Add the `key` field to manifest.json to lock the ID

## Production Deployment

Before publishing to Chrome Web Store:

1. Complete Google's OAuth verification process
2. Submit your app for review
3. Update OAuth consent screen from "Testing" to "In production"
4. Add privacy policy URL (required for OAuth)
