---
title: "Server-to-Server OAuth"
source: "https://developers.zoom.us/docs/internal-apps/s2s-oauth/"
capturado: "2026-11-23"
---

# Server-to-Server OAuth

Use server-to-server OAuth account credentials to authenticate with Zoom when [making API requests](/docs/api/using-zoom-apis/#api-requests). This is also known as two-legged OAuth as it uses a two step process flow that does not require user interaction for authentication or authorization. Here's the flow.

1. Your server-to-server OAuth client requests an access token from the Zoom authorization server.
2. Your client uses the access token to make API requests or modify resources.

Here are the steps.

1. [Get app credentials](#get-app-credentials)
2. [Generate access token](#generate-access-token)
3. [Make API requests](#make-api-requests)

## Prerequisites

-   [A server-to-server OAuth app](/docs/internal-apps/create/)

## Get app credentials

**App credentials** are the client credentials, including the **account ID**, **client ID**, and **client secret**, which Zoom provides to app developers to access the Zoom platform. Get your app credentials on your [app details](/docs/internal-apps/create/) page on the [Zoom App Marketplace](https://marketplace.zoom.us/).

## Generate access token

Use the `account_credentials` grant type to generate an access token. The features of this grant type are:

-   The token is the owner's access token.
-   The token's time to live is one hour (3600 seconds).
-   There is no refresh token.
-   You can generate and use multiple access tokens.
-   Tokens stop working when the app is deactivated.
-   Server-to-Server OAuth apps can be deleted.
-   Account administrators authorize the scopes available to developers building these app types.

### To generate an access token

Follow these steps once you've gotten your [app credentials](#get-app-credentials) (your account ID, client ID, and client secret).

1. Encode the client ID and client secret in base64 format (with a colon between them, e.g. `client_id:client_secret`).

    For example, on your local system, open a terminal and run the command:

    ```shell
    echo -n client_id:client_secret | base64
    ```

2. Set up your API request header and include your encoded client ID and client secret using the ['Basic' HTTP Authentication Scheme](https://datatracker.ietf.org/doc/html/rfc7617) (replace `HHHHH0000011111` with your encoded credentials).

    ```json
    {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Basic HHHHH0000011111"
    }
    ```

3. Set up the body of the access token request using the `account_credentials` `grant_type` and your `account_id` (replace `1234` with your account ID).

    ```json
    {
        "grant_type": "account_credentials",
        "account_id": 1234
    }
    ```

4. Send the header and body as a POST request to the token API at `https://zoom.us/oauth/token` to get an access token.
5. The successful response will be the access token, a Bearer token type that expires in an hour, with the scopes that you chose in your app settings screen.

    | Key            | Value                                                                                                            |
    | -------------- | ---------------------------------------------------------------------------------------------------------------- |
    | `access_token` | Your access token.                                                                                               |
    | `token_type`   | The token type (`bearer`)                                                                                        |
    | `expires_in`   | Expires in one hour (`3600` seconds).                                                                            |
    | `scope`        | The scopes that you chose in your app settings page on the [Zoom App Marketplace](https://marketplace.zoom.us/). |
    | `api_url`      | The cluster URL the backend services can connect to.                                                             |

    Here's an example.

    ```json
    {
        "access_token": "<JWT_TOKEN>",
        "token_type": "bearer",
        "expires_in": 3599,
        "scope": "user:read:admin",
        "api_url": "https://api.zoom.us"
    }
    ```

## Code samples

See the following [samples](#samples) on Github, code samples using [curl](#terminal-command-line-curl-method) and [PowerShell](#powershell), and [Postman](#postman) request for examples. See the previous step for an example of a successful response.

### Samples on Github

-   [Server-to-server OAuth starter API](https://github.com/zoom/server-to-server-oauth-starter-api)
-   [Server-to-server OAuth token generation](https://github.com/zoom/server-to-server-oauth-token)

### Terminal command line curl method

**Syntax:**

```shell
curl -X POST https://zoom.us/oauth/token -d 'grant_type=account_credentials' -d 'account_id={accountID}' -H 'Host: zoom.us' -H 'Authorization: Basic Base64Encoded(clientId:clientSecret)'
```

**Example:**

```shell
curl -X POST https://zoom.us/oauth/token -d 'grant_type=account_credentials' -d 'account_id=5yiPLwmTTpQVBnMxOlf32q' -H 'Host: zoom.us' -H 'Authorization: Basic aGwbwxOgK6eGHEO0W1DOCv5WCODeVxoet7DFEON7bR23gP5qEW7cmeWCbCEO3ApBEWlRwCVpDWB=='
```

### PowerShell

Note that the following syntax and example shows the Powershell widget version installed on macOS. Windows users may need to add the `-UseBasicParsing` tagline within the request.

**Syntax:**

```shell
Invoke-WebRequest -Method POST -Uri https://zoom.us/oauth/token -ContentType 'application/x-www-form-urlencoded' -Body @{ grant_type='account_credentials'; account_id='ACCOUNT_ID' } -Headers @{ Host='zoom.us'; Authorization='Basic BASE64ENCODED_CLIENTID:CLIENTSECRET' }
```

**Example:**

```shell
Invoke-WebRequest -Method POST -Uri https://zoom.us/oauth/token -ContentType 'application/x-www-form-urlencoded' -Body @{ grant_type='account_credentials'; account_id='5yiPLwmTTpQVBnMxOlf32q' } -Headers @{ Host='zoom.us'; Authorization='Basic aGwbwxOgK6eGHEO0W1DOCv5WCODeVxoet7DFEON7bR23gP5qEW7cmeWCbCEO3ApBEWlRwCVpDWB==' }
```

### Postman

See [Zoom's Postman Public Workspace](https://www.postman.com/zoom-developer) for details.

**Syntax:**

```plaintext
POST https://zoom.us/oauth/token?grant_type=account_credentials&account_id={accountId}
HTTP/1.1
Host: zoom.us
Authorization: Basic Base64Encoder(clientId:clientSecret)
```

## Get a new access token

There are no refresh tokens for this grant type. To get a new access token, your app should call the `/oauth/token` endpoint again with the `account_credentials` grant. Follow the steps [to generate a new access token](#to-generate-an-access-token).

## Make API requests

Use OAuth 2.0 to [make API requests](/docs/api/using-zoom-apis/#api-requests) to Zoom endpoints. For example, follow the steps below to get information about your Zoom account.

1. Send the access token in the Authorization header as a Bearer token (replace `ABCDE12345` with your access token).

```json
{
    "Content-Type": "application/x-www-form-urlencoded",
    "Authorization": "Bearer ABCDE12345"
}
```

2. Send a GET request with this header to `https://api.zoom.us/v2/users/me` ([Get a user](/docs/api/users/#tag/users/GET/users/{userId})) to get details about your Zoom account.

3. Receive response. If successful, you'll receive details about your account.

```json
{
    "id": "ZXY333",
    "first_name": "Joe",
    "last_name": "Chill",
    "display_name": "Joe Chill",
    "email": "jchill@example.com",
    "type": 1
    // ...
}
```

See [Using Zoom APIs: API requests](/docs/api/using-zoom-apis/#api-requests) for more information about making requests to Zoom APIs.

## Access token best practices

You can generate multiple access tokens for a server-to-server OAuth app without invalidating the previous tokens. Each token will expire an hour after creation. With that in mind, here are some best practices:

-   Create a unique server-to-server OAuth app for each service to best monitor permissions, usage, and logs.
-   App owners should only have permissions necessary for required scopes.
-   Request only the scopes required for a single app or integration.
-   Share access tokens within a single app rather than across multiple apps.
-   Monitor call logs on a per-app basis.
