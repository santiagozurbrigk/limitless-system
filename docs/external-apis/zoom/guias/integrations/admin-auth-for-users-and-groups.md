---
title: "Admin authorization for users and groups"
source: "https://developers.zoom.us/docs/integrations/admin-auth-for-users-and-groups/"
capturado: "2026-11-23"
---

# Admin authorization for users and groups

The Admin-authorization-for-users-and-groups feature enables applications to retrieve access tokens for multiple users without requiring each user to authorize the application individually. Account admins can authorize the application for users or groups in advance, reducing adoption friction and simplifying deployment.

Each user receives a set of access and refresh tokens, which limits the app to accessing only resources that the user is authorized to access.

## Token request and exchange flow

This is an overview of the token request and exchange flow.

1. An administrator initiates the authorization request by adding an app with the _Admin-authorization-for-users-and-groups_ feature enabled.
2. Zoom sends the bulk authorization code to the [OAuth Redirect URL](/docs/build-flow/basic-info/oauth-info/) specified in your app configuration.
3. Your redirect page receives the bulk authorization code and sends a request to Zoom to exchange it for a bulk access token.
4. Your redirect page uses the bulk access token to retrieve user OAuth tokens in batches. Zoom generates user-specific access tokens for each authorized user, which they can then use to access Zoom resources.

## Implementation

Developers complete the following steps to create an Admin-authorization-for-users-and-groups enabled app, and handle token requests, and exchanges on their redirect page.

### Step 1: Enable non-interactive batch token retrieval

Contact [Zoom support](https://support.zoom.com/hc/en) or post in the [Zoom Developer Forum](https://devforum.zoom.us/) to request they enable the _non-interactive batch token retrieval_ feature for your app. In the future, you will be able to enable this yourself, and we will update this document accordingly.

### Step 2: Create and configure your app

Sign in to the Zoom Marketplace and create a user-managed general app. For more information, see the [Quick Start Guide](/docs/build-flow/quick-start-guide/).

### Step 3: Obtain the bulk authorization code

Once an administrator initiates the authorization request by adding the Admin-authorization-for-users-and-groups enabled app, Zoom sends the _bulk authorization code_ to the [OAuth Redirect URL](/docs/build-flow/basic-info/oauth-info/) specified in your app configuration.

Set up your redirect page to handle the bulk authorization code. Zoom sends:

-   An authorization code (`code` parameter).
-   A code type identifier (`code_type=bulk`).

**Example redirect URL sent by Zoom:**

```http
https://app.example.com/oauth/callback?code=BULK_CODE&code_type=bulk
```

> **Routing bulk authorization code**
>
> The `code_type=bulk` parameter indicates that this authorization code should be exchanged for a **bulk access token** rather than a standard single-user token. Your redirect handler should branch on this value to route the code into the bulk token retrieval flow.

### Step 4: Exchange authorization code for bulk access token

Once your redirect page receives the authorization code, exchange it for a bulk access token by making a `POST` request to `https://zoom.us/oauth/token` with the authorization-code grant.

**Example request:**

```bash
curl -X POST "[https://zoom.us/oauth/token](https://zoom.us/oauth/token)" \
  -H "Authorization: Basic $(echo -n 'YOUR_CLIENT_ID:YOUR_CLIENT_SECRET' | base64)" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=BULK_CODE" \
  -d "redirect_uri=https://your-app.example.com/oauth/callback"
```

Because the authorization code was issued through the non-interactive bulk flow, the token endpoint returns a _bulk access token_ instead of a standard single-user token. Use the bulk access token as the `subject_token` in the retrieval requests.

**Example response:**

```json
{
    "access_token": "bt_xxx",
    "token_type": "bulk_access_token",
    "expires_in": 3600
}
```

### Step 5: Generate user-specific access tokens

Send a token-exchange request containing your bulk access token.

Make a `POST` request to `https://zoom.us/oauth/token`. Include a `Basic Authorization` header, and pass the following parameters in the request body as `application/x-www-form-urlencoded`.

#### Required Parameters

| Parameter            | Value                                                | Description                                                                                        |
| -------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `grant_type`         | `urn:ietf:params:oauth:grant-type:token-exchange`    | Indicates a token exchange operation (RFC 8693).                                                   |
| `subject_token`      | Your bulk access token string                        | The bulk access token issued to your application.                                                  |
| `subject_token_type` | `urn:ietf:params:oauth:token-type:bulk_access_token` | Tells the endpoint to route this request into the bulk retrieval flow.                             |
| `batch_size`         | Integer (default: `100`, max: `500`) — _optional_    | Number of user tokens to return per page. Must remain consistent across all requests in a session. |

**Example request:**

```bash
curl -X POST "[https://zoom.us/oauth/token](https://zoom.us/oauth/token)" \
  -H "Authorization: Basic $(echo -n 'YOUR_CLIENT_ID:YOUR_CLIENT_SECRET' | base64)" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "subject_token=YOUR_BULK_ACCESS_TOKEN" \
  -d "subject_token_type=urn:ietf:params:oauth:token-type:bulk_access_token" \
  -d "batch_size=100"
```

#### Response fields:

| Field                   | Description                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `api_url`               | API base URL associated with the returned user tokens. Returned at the response level.                                        |
| `items`                 | Array of user token results for the current batch.                                                                            |
| `items[].token_type`    | Token type — always `bearer`.                                                                                                 |
| `items[].access_token`  | OAuth access token for the user.                                                                                              |
| `items[].refresh_token` | OAuth refresh token for the user, when one is issued.                                                                         |
| `items[].id_token`      | Present only when the application is configured with OIDC scopes.                                                             |
| `items[].scope`         | Space-separated list of scopes granted to the token.                                                                          |
| `items[].expires_in`    | Access token lifetime in seconds.                                                                                             |
| `items[].email`         | Email address of the user associated with this token.                                                                         |
| `has_more`              | When `true`, additional results are available and another request should be made. When `false`, all pages have been consumed. |

**Example response:**

```json
{
    "api_url": "[https://api.example.com](https://api.example.com)",
    "items": [
        {
            "token_type": "bearer",
            "access_token": "user_access_token_xxx",
            "refresh_token": "user_refresh_token_xxx",
            "id_token": "oidc_user_id_token_xxx",
            "scope": "scope1 scope2",
            "expires_in": 3600,
            "email": "user@example.com"
        }
    ],
    "has_more": true
}
```

Because user-token preparation may be asynchronous, repeat the request with the same bulk access token when the response indicates that more results are available (`has_more: true`).

The service retrieves all users covered by your user, group, and account grants, removes duplicates, and caches the list for the session. The response contains the first page of results, with up to 100 user access tokens. If more than 100 users are covered, send additional token-exchange requests with the same bulk access token to get the remaining pages.

Each page is a JSON object with an `items` array. Each item represents one user and includes that user's `access_token` and `refresh_token`.

## Subsequent page requests

If `has_more` is `true`, call the same endpoint again with the same bulk access token and the same `batch_size`. Continue until `has_more` is `false`.

> **Batch_size**
>
> Keep `batche_size` consistent across all requests in a retrieval session. Changing it mid-session will cause the cursor to be rejected.

## Testing

To test the end-to-end authorization flow for your app in your development environment, you must be able to perform admin tasks such as adding the app and assigning it to multiple users. This requires Marketplace admin access.

1. To assign yourself Marketplace admin access, sign in to your account at zoom.us, go to **User Management**, and assign your role **View** and **Edit** admin permissions for Marketplace. For more information, see [User Role Management](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0064983).
2. To access your app's listing page and users in your development environment:

    a. In your app's build flow, navigate to the [Local Test](/docs/build-flow/local-test/) tab. Under **Preview app**, select **Preview your app listing page**.

    b. On the app's listing page, select **Add for others**.

    c. Select **Users and groups**, add the appropriate users, and select **Allow**.

3. To test users' access, sign in as one or more users, and confirm they have authorization to use the app and access the data successfully.

## Best practices

-   **Token scope:** A bulk access token represents an administrator-authorized batch, not an individual user. Do not use it directly to call user-scoped APIs.
-   **Security:** Keep the bulk access token confidential and use HTTPS for all requests.
-   **Retry logic:** Implement retry logic in your client. User tokens may not be immediately available after creating a bulk access token due to asynchronous processing. Wait 1–2 minutes before attempting to exchange the bulk access token for user access tokens.
-   **Pagination consistency:** Keep `batch_size` consistent across all requests in a session. Changing it mid-session will invalidate the pagination cursor.
-   **Code handling:** Treat bulk authorization codes with the same security controls as standard authorization codes. Do not reuse bulk codes and store all returned tokens securely.
