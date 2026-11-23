---
title: "OAuth 2.0"
source: "https://developers.zoom.us/docs/integrations/oauth/"
capturado: "2026-11-23"
---

# OAuth 2.0

OAuth 2.0 lets your app securely access Zoom APIs for users or accounts. Zoom supports industry-standard OAuth 2.0 ([RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749)) flows to handle authorization and access tokens.

Your app can request, refresh, and revoke tokens based on its type and authorization method. Tokens expire after a set time and may need renewal or refresh.

> **Note**
>
> Zoom API library for Rivet handles OAuth for you.
> For more information, go to [Zoom Rivet](/docs/rivet/) → **JavaScript** → **Get started** → **Initialize the client**.

## Request an access token

Zoom offers OAuth 2.0 flows and grant types for these four authorization use cases.

> **Call token endpoints from your server**
>
> Call the Zoom token and API endpoints from your server when the app is a confidential client. A browser call exposes your client secret and fails with a CORS error. If your app has no backend server, use [PKCE with a public client ID](/docs/integrations/PKCE/) instead.

### App Type: [Server to Server](/docs/internal-apps/create/)

Get an `access_token` to call APIs for your own Zoom account.

To request an access token, send a POST request to `https://zoom.us/oauth/token`. Include a basic authorization header and provide the following required parameters either as query parameters or in the request body using the `x-www-form-urlencoded` format.

| Key          | Value                                                               |
| ------------ | ------------------------------------------------------------------- |
| `grant_type` | `account_credentials`                                               |
| `account_id` | Your Zoom account ID, found on the Server to Server app build page. |

The basic authorization header is your Client ID and Client Secret with a colon `:` in between, Base64 Encoded.

### Example request

```plaintext
POST https://zoom.us/oauth/token?grant_type=account_credentials&account_id=Wk9PTV9BQ0NPVU5UX0lE
```

Request headers

```json
{ "Authorization": "Basic Wk9PTV9DTElFTlRfSUQ6Wk9PTV9DTElFTlRfU0VDUkVU" }
```

If successful, the response body is a JSON representation of the `access_token`.

```json
{
    "access_token": "<JWT_TOKEN>",
    "token_type": "bearer",
    "expires_in": 3600,
    "scope": "user:read:user:admin",
    "api_url": "https://api.zoom.us"
}
```

Access tokens expire after one hour. After your access token expires, you can request a new one. Zoom does not require a separate refresh flow.

### App Type: [General](/docs/integrations/create/)

Get an `access_token` to call APIs on behalf of a Zoom user or Zoom account.

#### Get a user authorization code

You can get a user authorization code by adding your app to your Zoom account. To do this, navigate to the **Local Test** page, and choose **Add App Now**.

Alternatively, construct the authorization URL using the following format:

```plaintext
https://zoom.us/oauth/authorize?response_type=code&client_id=ZOOM_CLIENT_ID&redirect_uri=REDIRECT_URI
```

Optionally, add a `state` parameter to the authorization URL. Zoom returns the same `state` value on the redirect, so your app can confirm that the response matches its request and prevent [cross-site request forgery](https://datatracker.ietf.org/doc/html/rfc6749#section-10.12).

See [section 4.1.1 of _The OAuth 2.0 Authorization Framework RFC_](https://datatracker.ietf.org/doc/html/rfc6749#section-4.1.1) for details.

#### User authorization flow

1. When the user visits this URL, Zoom prompts them to sign in (if not already signed in) and to grant the requested permissions. If this is the user's first time authorizing your app, or if you've updated scopes or webhook settings, Zoom will prompt the user to authorize again before issuing a new authorization code.
2. After the user authorizes the app, Zoom redirects the user’s browser to the specified `redirect_uri` and includes an authorization code. For example, `https://example.com/callback?code=AUTH_CODE`.
3. Your application should capture this authorization code from the redirect request and exchange it for an `access_token` using the OAuth token endpoint.

#### Exchange authorization code for access token

Once you have the authorization code from the user in the redirect URI, request an access token by sending a POST request to `https://zoom.us/oauth/token` with a Basic Authorization header.

Include the following required parameters either as query parameters or in the request body using the `x-www-form-urlencoded` format.

| Key            | Value                                                                       |
| -------------- | --------------------------------------------------------------------------- |
| `grant_type`   | `authorization_code`                                                        |
| `code`         | The `code` in the redirect URI after a successful user authorization.       |
| `redirect_uri` | Your redirect URI. Use the same OAuth Redirect URL in your Marketplace app. |

The Basic Authorization header is your Client ID and Client Secret separated by a colon (`:`) and Base64 encoded. Use PKCE to enable user authorization with a public client ID and no client secret, without the need for a backend server. See [Using Proof Key for Code Exchange (PKCE)](/docs/integrations/PKCE/) for details.

#### Example request

```plaintext
POST https://zoom.us/oauth/token?grant_type=authorization_code&code=Wk9PTV9BVVRIT1JJWkFUSU9OX0NPREU&redirect_uri=https://example.com
```

Request headers

```json
{
    "Authorization": "Basic Wk9PTV9DTElFTlRfSUQ6Wk9PTV9DTElFTlRfU0VDUkVU"
}
```

If successful, the response body contains a JSON representation of the `access_token`.

```json
{
    "access_token": "<JWT_TOKEN>",
    "token_type": "bearer",
    "refresh_token": "<JWT_TOKEN>",
    "expires_in": 3600,
    "scope": "user:read:user",
    "api_url": "https://api.zoom.us"
}
```

Access tokens expire after one hour. After your access token expires, you can follow the refresh flow to get a new one.

### App Type: [General](/docs/integrations/create/)

Get an `access_token` from a device flow to call APIs on behalf of a Zoom user or Zoom account.

In your app build flow settings, navigate to **Features** > **Embed** > **Enable Meeting SDK** > **Enable Use App on Device**.

To request a device code, user code, and verification URI, make a POST request with a basic authorization header to:

`https://zoom.us/oauth/devicecode?client_id=ZOOM_CLIENT_ID`

The basic authorization header is your Client ID and Client Secret with a colon `:` in between, Base64 Encoded.

### Example request

```plaintext
POST https://zoom.us/oauth/devicecode?client_id=Wk9PTV9DTElFTlRfSUQ
```

If successful, the response body is a JSON representation of the device code, user code, and verification URI.

```json
{
    "device_code": "Wk9PTV9ERVZJQ0VfQ09ERQ",
    "user_code": "abcd1234",
    "verification_uri": "https://zoom.us/oauth_device",
    "verification_uri_complete": "https://zoom.us/oauth/device/complete/Wk9PTV9WRVJJRklDQVRJT05fVVJJX0NPTVBMRVRF",
    "expires_in": 900,
    "interval": 5
}
```

Ask the user to navigate to the verification URI and display the user code. Alternatively, direct the user to the complete verification URI, which contains prefilled user code. Prompt the user to sign in if the user is not signed in to Zoom.

---

After entering the code, the user receives a prompt to allow the app. Once allowed, the app's landing page appears. The user receives a notification that the process can continue on the device.

You can now request an access token.

---

To request an access token, send a POST request to `https://zoom.us/oauth/token` with a basic authorization header. Include the following required parameters either as query parameters or in the request body using the `x-www-form-urlencoded` format.

| Key           | Value                                            |
| ------------- | ------------------------------------------------ |
| `grant_type`  | `urn:ietf:params:oauth:grant-type:device_code`   |
| `device_code` | The `device_code` returned in the previous step. |

The basic authorization header is your Client ID and Client Secret with a colon `:` in between, Base64 Encoded.

### Example request

```plaintext
POST https://zoom.us/oauth/token?grant_type=urn:ietf:params:oauth:grant-type:device_code&device_code=Wk9PTV9ERVZJQ0VfQ09ERQ
```

Request headers

```json
{ "Authorization": "Basic Wk9PTV9DTElFTlRfSUQ6Wk9PTV9DTElFTlRfU0VDUkVU" }
```

If successful, the response body is a JSON representation of the `access_token`.

```json
{
    "access_token": "<JWT_TOKEN>",
    "token_type": "bearer",
    "refresh_token": "<JWT_TOKEN>",
    "expires_in": 3599,
    "scope": "user:read:user user:read:token",
    "api_url": "https://api.zoom.us"
}
```

Access tokens expire after one hour. After your access token expires, you can follow the refresh flow to get a new one.

### App Type: [General](/docs/integrations/create/)

Get an `access_token` to send, edit, and delete Chatbot messages.

To install your Chatbot to your Zoom account, navigate to the **Local Test** page, and choose **Add App Now**.

You can also construct and navigate to the authorization URL yourself following this format:

```plaintext
https://zoom.us/oauth/authorize?response_type=code&client_id=ZOOM_CLIENT_ID&redirect_uri=ZOOM_REDIRECT_URI
```

If this is the first time you are authorizing your app or if you have made webhook or scope changes, Zoom prompts you to authorize.

---

If authorized, you redirect to the `redirect_uri` with the authorization code in the code query parameter. You can use the `code` in the redirect URL for User Authorization OAuth to call additional API endpoints. If you only call Chatbot API endpoints, you do not need it.

```plaintext
https://example.com/?code=Wk9PTV9BVVRIT1JJWkFUSU9OX0NPREU
```

---

To request a chatbot token, send a POST request to `https://zoom.us/oauth/token` with a basic authorization header. Include the following query parameters or provide them in the request body using the `x-www-form-urlencoded` format.

| Key          | Value                |
| ------------ | -------------------- |
| `grant_type` | `client_credentials` |

The basic authorization header is your Client ID and Client Secret with a colon `:` in between, Base64 Encoded.

### Example request

```plaintext
POST https://zoom.us/oauth/token?grant_type=client_credentials
```

Request headers

```json
{ "Authorization": "Basic Wk9PTV9DTElFTlRfSUQ6Wk9PTV9DTElFTlRfU0VDUkVU" }
```

If successful, the response body is a JSON representation of the Chatbot token.

```json
{
    "access_token": "<JWT_TOKEN>",
    "token_type": "bearer",
    "expires_in": 3600,
    "scope": "imchat:bot",
    "api_url": "https://api.zoom.us"
}
```

Chatbot tokens expire after one hour. After your chatbot token expires, you can request a new one. Zoom does not require a separate refresh flow.

## Refresh an access token

Here are the ways to refresh access tokens for these four authorization use cases.

### App Type: [Server to Server](/docs/internal-apps/create/)

Access tokens expire after one hour. After your access token expires, you can request a new one. Zoom does not require a separate refresh flow.

### App Type: [General](/docs/integrations/create/)

Access tokens expire after one hour. After your access token expires, you can follow the refresh flow to get a new one.

To refresh an access token, send a POST request to `https://zoom.us/oauth/token` with a basic authorization header. Include the following query parameters or provide them in the request body using the `x-www-form-urlencoded` format.

| Key             | Value                 |
| --------------- | --------------------- |
| `grant_type`    | `refresh_token`       |
| `refresh_token` | Your `refresh_token`. |

The basic authorization header is your Client ID and Client Secret with a colon `:` in between, Base64 Encoded. If you use PKCE with a public client ID, see [Refresh and revoke tokens](/docs/integrations/PKCE/#refresh-and-revoke-tokens) instead.

### Example request

```plaintext
POST https://zoom.us/oauth/token?grant_type=refresh_token&refresh_token=<JWT_TOKEN>
```

Request headers

```json
{ "Authorization": "Basic Wk9PTV9DTElFTlRfSUQ6Wk9PTV9DTElFTlRfU0VDUkVU" }
```

If successful, the response body is a JSON representation of the refreshed `access_token`.

```json
{
    "access_token": "<JWT_TOKEN>",
    "token_type": "bearer",
    "refresh_token": "<JWT_TOKEN>",
    "expires_in": 3600,
    "scope": "user:read:user",
    "api_url": "https://api.zoom.us"
}
```

Refresh tokens expire after 90 days. You should always use the latest refresh token for the next refresh request. If your refresh token expires, you can direct the user to the authorize URL to restart the User OAuth flow.

### App Type: [General](/docs/integrations/create/)

Access tokens expire after one hour. After your access token expires, you can follow the refresh flow to get a new one.

To refresh an access token, send a POST request to `https://zoom.us/oauth/token` with a basic authorization header. Include the required parameters as query strings or in the request body using the `x-www-form-urlencoded` format.

| Key             | Value                 |
| --------------- | --------------------- |
| `grant_type`    | `refresh_token`       |
| `refresh_token` | Your `refresh_token`. |

The basic authorization header is your Client ID and Client Secret with a colon `:` in between, Base64 Encoded.

### Example request

```plaintext
POST https://zoom.us/oauth/token?grant_type=refresh_token&refresh_token=<JWT_TOKEN>
```

Request headers

```json
{ "Authorization": "Basic Wk9PTV9DTElFTlRfSUQ6Wk9PTV9DTElFTlRfU0VDUkVU" }
```

If successful, the response body is a JSON representation of the refreshed `access_token`.

```json
{
    "access_token": "<JWT_TOKEN>",
    "token_type": "bearer",
    "refresh_token": "<JWT_TOKEN>",
    "expires_in": 3600,
    "scope": "user:read:user user:read:token",
    "api_url": "https://api.zoom.us"
}
```

Refresh tokens expire after 90 days. You should always use the latest refresh token for the next refresh request. If the refresh token expires, request a new device code, user code, and verification URI, then direct the user to the verification URI to restart the Device OAuth flow.

### App Type: [General](/docs/integrations/create/)

Chatbot tokens expire after one hour. After your chatbot token expires, you can request a new one. Zoom does not require a separate refresh flow.

## Revoke an access token

To revoke an access token for all app types, send a POST request to `https://zoom.us/oauth/revoke` with a basic authorization header. Include the required parameters as query strings or in the request body using the `x-www-form-urlencoded` format.

| Key     | Value                |
| ------- | -------------------- |
| `token` | Your `access_token`. |

The basic authorization header is your Client ID and Client Secret with a colon `:` in between, Base64 Encoded. If you use PKCE with a public client ID, see [Refresh and revoke tokens](/docs/integrations/PKCE/#refresh-and-revoke-tokens) instead.

### Example request

```plaintext
POST https://zoom.us/oauth/revoke?token=<JWT_TOKEN>
```

Request headers

```json
{ "Authorization": "Basic Wk9PTV9DTElFTlRfSUQ6Wk9PTV9DTElFTlRfU0VDUkVU" }
```

If successful, the response body is a JSON representation of the revoked token.

```json
{
    "status": "success"
}
```

## Use an access token

To call a [Zoom API endpoint](/docs/api/), make a request with a `Bearer` access token.

### Example request

```plaintext
GET https://api.zoom.us/v2/users/me
```

Request header

```json
{ "Authorization": "Bearer <JWT_TOKEN>" }
```

If successful, the response body is a JSON representation of your user.

```json
{
    "id": "Wk9PTV9VU0VSX0lE",
    "first_name": "Jane",
    "last_name": "Dev",
    "display_name": "Jane Dev",
    "email": "jane.dev@example.com",
    "type": 2,
    "role_name": "Owner",
    "pmi": 1234567890,
    "use_pmi": false,
    "personal_meeting_url": "https://janedev.zoom.us/j/1234567890?pwd=Wk9PTV9QTUlfUEFTU0NPREU",
    "timezone": "America/Denver",
    "verified": 1,
    "dept": "",
    "created_at": "2019-04-05T15:24:32Z",
    "last_login_time": "2025-03-19T22:42:47Z",
    "last_client_version": "6.4.0.51205(mac)",
    "pic_url": "https://janedev.zoom.us/p/v2/Wk9PTV9QSUNfVVJM/Wk9PTV9QSUNfVVJM",
    "cms_user_id": "",
    "jid": "Wk9PTV9VU0VSX0lE@xmpp.zoom.us",
    "group_ids": ["Wk9PTV9HUk9VUF9JRA"],
    "im_group_ids": ["Wk9PTV9HUk9VUF9JRA"],
    "account_id": "Wk9PTV9BQ0NPVU5UX0lE",
    "language": "en-US",
    "phone_country": "US",
    "phone_number": "+1 1234567890",
    "status": "active",
    "job_title": "",
    "cost_center": "",
    "company": "Zoom",
    "location": "",
    "custom_attributes": [
        {
            "key": "Wk9PTV9DVVNUT01fQVRUUklCVVRFX0tFWQ",
            "name": "Test",
            "value": "set from API"
        }
    ],
    "login_types": [1, 100],
    "role_id": "0",
    "account_number": 12345678,
    "cluster": "aw1",
    "phone_numbers": [
        {
            "country": "US",
            "code": "+1",
            "number": "1234567890",
            "verified": false,
            "label": ""
        }
    ],
    "user_created_at": "2019-04-05T15:23:55Z"
}
```

## Me context

You can replace the `userID` path parameter with `me` to target the user associated with the token. This approach lets you use user-specific endpoints without the need to look up or store the user ID for each token.
For example:

| URL                     | Methods        |
| ----------------------- | -------------- |
| `/v2/users/me`          | `GET`, `PATCH` |
| `/v2/users/me/token`    | `GET`          |
| `/v2/users/me/meetings` | `GET`, `POST`  |

## Deauthorization

### App Type: [General](/docs/integrations/create/)

When a user deauthorizes or removes a **production** app, your app receives an HTTP POST request. The request goes to the deauthorization notification endpoint URL you specified on the App Listing page.

After receiving a [deauthorization webhook event](/docs/api/marketplace/events/#tag/app_deauthorized/POSTapp_deauthorized), apps must delete all associated user data.

An unsecured deauthorization notification endpoint URL leaves your server vulnerable to denial of service attacks. We recommend you verify the requests sent to your deauthorization notification endpoint URL with our [supported webhook verification methods](/docs/api/webhooks/#verify-webhook-events).

Here is an example deauthorization webhook event.

```json
{
    "event": "app_deauthorized",
    "event_ts": 1740439732278,
    "payload": {
        "account_id": "Wk9PTV9BQ0NPVU5UX0lE",
        "user_id": "Wk9PTV9VU0VSX0lE",
        "signature": "Wk9PTV9TSUdOQVRVUkU",
        "deauthorization_time": "2019-06-17T13:52:28.632Z",
        "client_id": "XO8c5xFdQVqGAgGB3utlRA"
    }
}
```

## Supporting concurrent logins

With confidential clients, a backend server can negotiate access tokens across multiple clients of the same end user account, if the developer wishes to support this concurrent client use case. When using a public client, there is no backend server to manage these tokens, since the clients communicate directly with the authentication APIs.

To address this use case, **Multiple-auth token** mode allows any valid access token for that user to call Zoom APIs, not just the most recently issued one. PKCE public clients support this mode too.

To turn on this mode, request the **Support Multi Auth** option from [Support](/support/). One request covers both the confidential client (development or production) and the PKCE public client in your app. Turning on **Use Public Client OAuth** does not enable the mode by itself.
