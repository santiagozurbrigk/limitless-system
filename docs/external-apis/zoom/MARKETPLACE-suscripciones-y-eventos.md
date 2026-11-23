---
title: "Zoom Marketplace API (recorte para Limitless)"
source: "https://developers.zoom.us/api/zoap/marketplace/methods/"
capturado: "2026-11-23"
---

# Zoom Marketplace API — suscripciones de eventos y logs de webhooks

Recorte de [`openapi/marketplace-methods.json`](./openapi/marketplace-methods.json): alta, baja y consulta de suscripciones de eventos por API (webhooks por usuario o cuenta sin tocar el build flow) y logs de entrega.

- Versión declarada: `2`
- Server: `https://api.zoom.us/v2`
- Auth `openapi_authorization`: http / bearer
- Spec original: [`https://developers.zoom.us/api/zoap/marketplace/methods/`](https://developers.zoom.us/api/zoap/marketplace/methods/)

## Descripción del proveedor

The Marketplace APIs allow developers to access data related to their app and its usage in the marketplace.

## Índice de endpoints

| Método | Path | Qué hace |
| --- | --- | --- |
| `DELETE` | [`/marketplace/app/event_subscription`](#delete-marketplace-app-event-subscription) | Unsubscribe to an app event subscription |
| `GET` | [`/marketplace/app/event_subscription`](#get-marketplace-app-event-subscription) | Get user or account event subscription |
| `PATCH` | [`/marketplace/app/event_subscription`](#patch-marketplace-app-event-subscription) | Update an event subscription |
| `POST` | [`/marketplace/app/event_subscription`](#post-marketplace-app-event-subscription) | Create an event subscription |
| `DELETE` | [`/marketplace/app/event_subscription/{eventSubscriptionId}`](#delete-marketplace-app-event-subscription-eventsubscriptionid) | Delete an event subscription |
| `PATCH` | [`/marketplace/app/event_subscription/{eventSubscriptionId}`](#patch-marketplace-app-event-subscription-eventsubscriptionid) | Subscribe to an event subscription |
| `GET` | [`/marketplace/apps/{appId}/webhook_logs`](#get-marketplace-apps-appid-webhook-logs) | Get webhook logs |
| `PATCH` | [`/marketplace/users/{userId}/apps/{appId}/subscription`](#patch-marketplace-users-userid-apps-appid-subscription) | Enable or disable user app subscription |

---

## `DELETE /marketplace/app/event_subscription`

**Unsubscribe to an app event subscription**

Use this API endpoint to unsubscribe an event subscription. **Prerequisites** - An existing, authorized application. - A valid access token obtained using the `client_credentials` authorization `grant_type`. See [documentation](/docs/api/webhooks/#step-1-request-an-access-token) for details. **Note** These endpoints use app-specific scopes that won't appear in your Marketplace build flow, but will be included in the access token payload. **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `MEDIUM`

`operationId`: `unSubscribeEventSubscription` · tags: `App` · seguridad: `openapi_authorization`

### Parámetros

- **event_subscription_id** (`query`) `string` _requerido_ — The event subscriptions' ID.
- **user_ids** (`query`) `string` — The user's ID list. The list's maximum size is 10, seperated by a comma.
- **account_id** (`query`) `string` _requerido_ — The account's ID.
- **team_ids** (`query`) `string` — The team's ID list. The list's maximum size is 10, seperated by a comma.
- **user_group_ids** (`query`) `string` — The user group's ID list. The maximum size of the list is 10, separated by a comma.

### Respuestas

**`204`** — **HTTP Status Code:** `204` User unsubscribed from the event subscription successfully.

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `1500` <br> The size of team_ids exceeds the maximum. <br> **Error Code:** `1500` <br> Team does not exist or does not belong to this account: {$teamId}. <br> **Error Code:** `1500` <br> User group does not exist or does not belong to this account: {$userGroupId}. <br> **Error Code:** `1500` <br> The size of user_group_ids exceeds the maximum. <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `1001` <br> User does not exist or does not belong to this account: {$userId}. <br> **Error Code:** `1601` <br> App event subscription is invalid: {$eventSubscriptionId} <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](https://developers.zoom.us/docs/api/rest/rate-limits/).

---

## `GET /marketplace/app/event_subscription`

**Get user or account event subscription**

Returns event subscriptions for users or accounts. **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `MEDIUM`

`operationId`: `getUserEventSubscriptions` · tags: `App` · seguridad: `openapi_authorization`

### Parámetros

- **page_size** (`query`) `number` — The number of records returned within a single API call.
- **next_page_token** (`query`) `string` — The next page token paginates through a large set of results. The API returns a next page token whenever the set of available results exceeds the current page size. The expiration period for this token is 15 minutes.
- **user_id** (`query`) `string` _requerido_ — The user ID.
- **subscription_scope** (`query`) `string` — The app event subscription's scope. * `user` &mdash; The app event subscription is for specific users. * `account` &mdash; The app event subscription is for all users in the account. * `master_account` &mdash; The app event subscription is for all users in the master account. * `team` &mdash; The app event subscription is for a team in the account. * `group` &mdash; The app event subscription is for specific user groups in the account. · valores: `user`, `account`, `master_account`, `team`, `group`
- **account_id** (`query`) `string` _requerido_ — The account ID.
- **team_id** (`query`) `string` — The team ID.
- **user_group_id** (`query`) `string` — The user group's ID.

### Respuestas

**`200`** — **HTTP Status Code:** `200` User's event subscriptions for application returned.

- **next_page_token** `string` — The next page token paginates through a large set of results. The API returns a next page token whenever the set of available results exceeds the current page size. The expiration period for this token is 15 minutes.
- **page_size** `number` — The number of records returned with a single API call.
- **event_subscriptions** `object[]`
  - `array` de:
    - **event_subscription_id** `string` — The app event subscription's ID.
    - **events** `string[]` — The list of the subscribed event subscriptions.
      - `array` de:
        - The event's name.
    - **event_subscription_name** `string` — The app event subscription's name.
    - **event_webhook_url** `string` — The event notification endpoint URL.
    - **subscription_scope** `string` — The app event subscription's scope. * `user` &mdash; The app event subscription is for specific users. * `account` &mdash; The app event subscription is for all users in the account. * `master_account` &mdash; The app event subscription is for all users in the master account. * `team` &mdash; The app event subscription is for a team in the account. * `group` &mdash; The app event subscription is for specific user groups in the account. · valores: `user`, `account`, `master_account`, `team`, `group`
    - **created_source** `string` — The app's created source: * `default` &mdash; The app event subscriptions created in build flow. * `openapi` &mdash; The app event subscriptions created in open API. · valores: `default`, `openapi`
    - **subscriber_id** `string` — The subscriber's ID.
    - **custom_header** `object` — Custom header configuration for event subscription webhook. This allows you to configure authentication headers that will be sent with webhook requests.
      - **custom_header_type** `integer` _requerido_ — The type of custom header to use for authentication. * `0` - Default (no custom header) * `1` - Basic Authentication (requires username and password) * `2` - OAuth2 Token Authentication (requires client_id, client_secret, and token_url) * `3` - Custom Key-Value Header (requires custom_header_key and custom_header_value) · valores: `0`, `1`, `2`, `3` · formato: `int8`
      - **username** `string` — The username for Basic Authentication. Required when `custom_header_type` is `1` (Basic Auth).
      - **password** `string` — The password for Basic Authentication. Required when `custom_header_type` is `1` (Basic Auth).
      - **client_id** `string` — The OAuth2 client ID. Required when `custom_header_type` is `2` (OAuth).
      - **client_secret** `string` — The OAuth2 client secret. Required when `custom_header_type` is `2` (OAuth).
      - **token_url** `string` — The OAuth2 token endpoint URL. Required when `custom_header_type` is `2` (OAuth). Must be a valid HTTPS URL. · formato: `uri`
      - **scope** `string` — The OAuth2 scope parameter for limiting access token permissions. Optional, only valid when `custom_header_type` is `2` (OAuth).
      - **state** `string` — The OAuth2 state parameter for CSRF protection and request tracking. Optional, only valid when `custom_header_type` is `2` (OAuth).
      - **client_authentication** `string` — The client authentication method for OAuth2 token requests. Only valid when `custom_header_type` is `2` (OAuth). * `header` - Send client credentials as Basic Auth header (default) * `body` - Send client credentials in request body · valores: `header`, `body` · default: `header`
      - **custom_header_key** `string` — The custom header key name. Required when `custom_header_type` is `3` (Custom Key-Value). Can only contain letters, numbers, and hyphens. Cannot contain spaces or line feeds.
      - **custom_header_value** `string` — The custom header value. Required when `custom_header_type` is `3` (Custom Key-Value). Cannot contain line feeds.

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `1500` <br> The subscription scope is invalid. <br> **Error Code:** `1500` <br> Team does not exist or does not belong to this account: {$teamId}. <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `1001` <br> User does not exist or does not belong to this account. <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](https://developers.zoom.us/docs/api/rest/rate-limits/).

---

## `PATCH /marketplace/app/event_subscription`

**Update an event subscription**

Update an event subscription. **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `LIGHT`

`operationId`: `updateEventSubscription` · tags: `App` · seguridad: `openapi_authorization`

### Request body — `application/json`

- **events** `string[]` — The webhook events.
  - `array` de:
    - The event's name.
- **event_subscription_name** `string` — The app event subscription's name.
- **event_webhook_url** `string` — The event notification endpoint URL.
- **custom_header** `object` — Custom header configuration for event subscription webhook. This allows you to configure authentication headers that will be sent with webhook requests.
  - **custom_header_type** `integer` _requerido_ — The type of custom header to use for authentication. * `0` - Default (no custom header) * `1` - Basic Authentication (requires username and password) * `2` - OAuth2 Token Authentication (requires client_id, client_secret, and token_url) * `3` - Custom Key-Value Header (requires custom_header_key and custom_header_value) · valores: `0`, `1`, `2`, `3` · formato: `int8` · default: `0`
  - **username** `string` — The username for Basic Authentication. Required when `custom_header_type` is `1` (Basic Auth).
  - **password** `string` — The password for Basic Authentication. Required when `custom_header_type` is `1` (Basic Auth).
  - **client_id** `string` — The OAuth2 client ID. Required when `custom_header_type` is `2` (OAuth).
  - **client_secret** `string` — The OAuth2 client secret. Required when `custom_header_type` is `2` (OAuth).
  - **token_url** `string` — The OAuth2 token endpoint URL. Required when `custom_header_type` is `2` (OAuth). Must be a valid HTTPS URL. · formato: `uri`
  - **scope** `string` — The OAuth2 scope parameter for limiting access token permissions. Optional, only valid when `custom_header_type` is `2` (OAuth).
  - **state** `string` — The OAuth2 state parameter for CSRF protection and request tracking. Optional, only valid when `custom_header_type` is `2` (OAuth).
  - **client_authentication** `string` — The client authentication method for OAuth2 token requests. Only valid when `custom_header_type` is `2` (OAuth). * `header` - Send client credentials as Basic Auth header (default) * `body` - Send client credentials in request body · valores: `header`, `body` · default: `header`
  - **custom_header_key** `string` — The custom header key name. Required when `custom_header_type` is `3` (Custom Key-Value). Can only contain letters, numbers, and hyphens. Cannot contain spaces or line feeds.
  - **custom_header_value** `string` — The custom header value. Required when `custom_header_type` is `3` (Custom Key-Value). Cannot contain line feeds.
- **event_subscription_id** `string` _requerido_ — The app event subscription's ID.

### Respuestas

**`204`** — **HTTP Status Code:** `204` user update event subscription successfully.

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `1602` <br> The event is not allowed for the app: {$eventName} <br> **Error Code:** `1500` <br> The events list is empty. <br> **Error Code:** `1500` <br> The event webhook url is empty. <br> **Error Code:** `1500` <br> The username is required. <br> **Error Code:** `1500` <br> The length of username exceeds the limit of 256 <br> **Error Code:** `1500` <br> The input value can't contain line feed. <br> **Error Code:** `1500` <br> The password is required. <br> **Error Code:** `1500` <br> The length of password exceeds the limit of 256 <br> **Error Code:** `1500` <br> The client id is required. <br> **Error Code:** `1500` <br> The length of client id exceeds the limit of 256. <br> **Error Code:** `1500` <br> The client secret is required. <br> **Error Code:** `1500` <br> The length of client secret exceeds the limit of 256. <br> **Error Code:** `1500` <br> The token url is required. <br> **Error Code:** `1500` <br> The length of token url exceeds the limit of 1000. <br> **Error Code:** `1500` <br> The length of scope exceeds the limit of 255. <br> **Error Code:** `1500` <br> The length of state exceeds the limit of 255. <br> **Error Code:** `1500` <br> Client authentication must be 'header' or 'body'. <br> **Error Code:** `1500` <br> The custom header key is required. <br> **Error Code:** `1500` <br> The length of header key exceeds the limit of 256. <br> **Error Code:** `1500` <br> The input value can't contain space. <br> **Error Code:** `1500` <br> The custom header key can only contain letters, numbers, and -. <br> **Error Code:** `1500` <br> The custom header key is reserved by Zoom. <br> **Error Code:** `1500` <br> The custom header value is required. <br> **Error Code:** `1500` <br> The length of header value exceeds the limit of 256 <br> **Error Code:** `1500` <br> The event subscription ID is required. <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `1601` <br> App event not exists: {$eventName} <br> **Error Code:** `1701` <br> The event webhook url validate failed: {eventWebhookUrl}. <br> **Error Code:** `1801` <br> The custom header type validate failed: {customHeaderType}. <br> **Error Code:** `1702` <br> The Oauth token url validate failed: {oauthTokenUrl}. <br> **Error Code:** `1601` <br> App event subscription is invalid: {$eventSubscriptionId} <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](https://developers.zoom.us/docs/api/rate-limits/).

---

## `POST /marketplace/app/event_subscription`

**Create an event subscription**

Programmatically create event subscriptions for an authorized application. **Prerequisites** - An existing, authorized application. - A valid access token obtained using the `client_credentials` authorization `grant_type`. See [documentation](/docs/api/webhooks/#step-1-request-an-access-token) for details. **Note** These endpoints use app-specific scopes that won't appear in your Marketplace build flow, but will be included in the access token payload. **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `HEAVY`

`operationId`: `createEventSubscription` · tags: `App` · seguridad: `openapi_authorization`

### Request body — `application/json`

- **events** `string[]` _requerido_
  - `array` de:
    - The event's name.
- **event_subscription_name** `string` — The app event subscription's name.
- **event_webhook_url** `string` _requerido_ — The event notification endpoint URL.
- **user_ids** `string[]`
  - `array` de:
    - The user's user ID list.
- **subscription_scope** `string` _requerido_ — The app event subscription's scope * `user` &mdash; The app event subscription is for specific users. * `account` &mdash; The app event subscription is for all users in the account. * `master_account` &mdash; The app event subscription is for all users in the master account. * `team` &mdash; The app event subscription is for team in the account, and only events from the contact center are supported. * `group` — The app event subscription is for specific user groups in the account. · valores: `user`, `account`, `master_account`, `team`, `group`, `division`
- **account_id** `string` — The account's ID.
- **custom_header** `object` — Custom header configuration for event subscription webhook. This allows you to configure authentication headers that will be sent with webhook requests.
  - **custom_header_type** `integer` _requerido_ — The type of custom header to use for authentication. * `0` - Default (no custom header) * `1` - Basic Authentication (requires username and password) * `2` - OAuth2 Token Authentication (requires client_id, client_secret, and token_url) * `3` - Custom Key-Value Header (requires custom_header_key and custom_header_value) · valores: `0`, `1`, `2`, `3` · formato: `int8` · default: `0`
  - **username** `string` — The username for Basic Authentication. Required when `custom_header_type` is `1` (Basic Auth).
  - **password** `string` — The password for Basic Authentication. Required when `custom_header_type` is `1` (Basic Auth).
  - **client_id** `string` — The OAuth2 client ID. Required when `custom_header_type` is `2` (OAuth).
  - **client_secret** `string` — The OAuth2 client secret. Required when `custom_header_type` is `2` (OAuth).
  - **token_url** `string` — The OAuth2 token endpoint URL. Required when `custom_header_type` is `2` (OAuth). Must be a valid HTTPS URL. · formato: `uri`
  - **scope** `string` — The OAuth2 scope parameter for limiting access token permissions. Optional, only valid when `custom_header_type` is `2` (OAuth).
  - **state** `string` — The OAuth2 state parameter for CSRF protection and request tracking. Optional, only valid when `custom_header_type` is `2` (OAuth).
  - **client_authentication** `string` — The client authentication method for OAuth2 token requests. Only valid when `custom_header_type` is `2` (OAuth). * `header` - Send client credentials as Basic Auth header (default) * `body` - Send client credentials in request body · valores: `header`, `body` · default: `header`
  - **custom_header_key** `string` — The custom header key name. Required when `custom_header_type` is `3` (Custom Key-Value). Can only contain letters, numbers, and hyphens. Cannot contain spaces or line feeds.
  - **custom_header_value** `string` — The custom header value. Required when `custom_header_type` is `3` (Custom Key-Value). Cannot contain line feeds.
- **team_ids** `string[]` — The team ID list.
  - `array` de:
    - The team's ID.
- **user_group_ids** `string[]` — The user group ID list.
  - `array` de:
    - The user group's ID.
- **division_ids** `string[]` — The list of user division IDs.
  - `array` de:
    - The user division ID.

### Respuestas

**`201`** — **HTTP Status Code:** `201` user create event subscription successfully.

- **event_subscription_id** `string` — The app event subscription's ID.

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `1003` <br> The user {$userId} missed permission to subscribe application events: {$eventName} <br> **Error Code:** `1300` <br> The user don't authorize the app: {$userId}. <br> **Error Code:** `1602` <br> The event is not allowed for the app: {$eventName} <br> **Error Code:** `1500` <br> The events list is empty. <br> **Error Code:** `1500` <br> The event webhook url is empty. <br> **Error Code:** `1500 ` <br> The subscription scope is invalid. <br> **Error Code:** `1500` <br> The username is required. <br> **Error Code:** `1500` <br> The length of username exceeds the limit of 256 <br> **Error Code:** `1500` <br> The input value can't contain line feed. <br> **Error Code:** `1500` <br> The password is required. <br> **Error Code:** `1500` <br> The length of password exceeds the limit of 256 <br> **Error Code:** `1500` <br> The client id is required. <br> **Error Code:** `1500` <br> The length of client id exceeds the limit of 256. <br> **Error Code:** `1500` <br> The client secret is required. <br> **Error Code:** `1500` <br> The length of client secret exceeds the limit of 256. <br> **Error Code:** `1500` <br> The token url is required. <br> **Error Code:** `1500` <br> The length of token url exceeds the limit of 1000. <br> **Error Code:** `1500` <br> The length of scope exceeds the limit of 255. <br> **Error Code:** `1500` <br> The length of state exceeds the limit of 255. <br> **Error Code:** `1500` <br> Client authentication must be 'header' or 'body'. <br> **Error Code:** `1500` <br> The custom header key is required. <br> **Error Code:** `1500` <br> The length of header key exceeds the limit of 256. <br> **Error Code:** `1500` <br> The input value can't contain space. <br> **Error Code:** `1500` <br> The custom header key can only contain letters, numbers, and -. <br> **Error Code:** `1500` <br> The custom header key is reserved by Zoom. <br> **Error Code:** `1500` <br> The custom header value is required. <br> **Error Code:** `1500` <br> The length of header value exceeds the limit of 256 <br> **Error Code:** `1500` <br> Team does not exist or does not belong to this account. <br> **Error Code:** `1500` <br> The size of team_ids exceed maximum. <br> **Error Code:** `1500` <br> Team does not exist or does not belong to this account: {$teamId}. <br> **Error Code:** `1500` <br> User group does not exist or does not belong to this account: {$userGroupId}. <br> **Error Code:** `1500` <br> The size of user_group_ids exceed maximum <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `1001` <br> User does not exist or does not belong to this account: {$userId}. <br> **Error Code:** `1601` <br> App event not exists: {$eventName} <br> **Error Code:** `1701` <br> The event webhook url validate failed: {eventWebhookUrl}. <br> **Error Code:** `1801` <br> The custom header type validate failed: {customHeaderType}. <br> **Error Code:** `1702` <br> The Oauth token url validate failed: {oauthTokenUrl}. <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](https://developers.zoom.us/docs/api/rest/rate-limits/).

---

## `DELETE /marketplace/app/event_subscription/{eventSubscriptionId}`

**Delete an event subscription**

Delete an event subscription. **Prerequisites** - An existing, authorized application. - A valid access token obtained using the client_credentials authorization grant_type. See [documentation](/docs/api/webhooks/#step-1-request-an-access-token) for details. **Note:** These endpoints use app-specific scopes that won't appear in your Marketplace build flow, but will be included in the access token payload. **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `MEDIUM`

`operationId`: `deleteEventSubscription` · tags: `App` · seguridad: `openapi_authorization`

### Parámetros

- **eventSubscriptionId** (`path`) `string` _requerido_ — The app event subscription's ID.

### Respuestas

**`204`** — **HTTP Status Code:** `204` delete event subscription successfully.

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `1601` <br> App event subscription is invalid: {$eventSubscriptionId} <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](https://developers.zoom.us/docs/api/rest/rate-limits/).

---

## `PATCH /marketplace/app/event_subscription/{eventSubscriptionId}`

**Subscribe to an event subscription**

Subscribe to an event subscription. **Prerequisites** - An existing, authorized application. - A valid access token obtained using the `client_credentials` authorization `grant_type`. See [documentation](https://developers.zoom.us/docs/api/webhooks/#step-1-request-an-access-token) for details. **Note** These endpoints use app-specific scopes that won't appear in your Marketplace build flow, but will be included in the access token payload. **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `MEDIUM`

`operationId`: `subscribeEventSubscription` · tags: `App` · seguridad: `openapi_authorization`

### Parámetros

- **eventSubscriptionId** (`path`) `string` _requerido_ — The app event subscription's ID.

### Request body — `application/json`

- **user_ids** `string[]`
  - `array` de:
    - The user ID list for the user.
- **account_id** `string` _requerido_ — The account's ID.
- **team_ids** `string[]` — The team ID list.
  - `array` de:
    - The team's ID.
- **user_group_ids** `string[]` — The user group ID list.
  - `array` de:
    - The user group's ID.

### Respuestas

**`204`** — **HTTP Status Code:** `204` user subscribe event subscription successfully.

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `1003` <br> The user: {$userId} missed permission to subscribe event subscriptions: {$eventSubscriptionId} <br> **Error Code:** `1002` <br> The user don't authorize the app: {$userId}. <br> **Error Code:** `1500` <br> The size of team_ids exceed maximum. <br> **Error Code:** `1500` <br> Team does not exist or does not belong to this account: {$teamId}. <br> **Error Code:** `1500` <br> User group does not exist or does not belong to this account: {$userGroupId}. <br> **Error Code:** `1500` <br> The size of user_group_ids exceed maximum <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `1001` <br> User does not exist or does not belong to this account: {$userId} . <br> **Error Code:** `1601` <br> App event subscription is invalid: {$eventSubscriptionId} <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](https://developers.zoom.us/docs/api/rest/rate-limits/).

---

## `GET /marketplace/apps/{appId}/webhook_logs`

**Get webhook logs**

Get users' webhook call logs and query records from the past 7 days. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `marketplace_app:read`,`marketplace_app:read:admin` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `MEDIUM`

`operationId`: `getWebhookLogs` · tags: `App` · seguridad: `openapi_authorization`

### Parámetros

- **appId** (`path`) `string` _requerido_ — The app's ID.
- **next_page_token** (`query`) `string` — The next page token is used to paginate through large result sets. The API returns a next page token whenever the set of available results exceeds the current page size. The expiration period for this token is 15 minutes.
- **page_size** (`query`) `integer` — The number of records returned within a single API call. · default: `30`
- **from** (`query`) `string` — Start date in format: `yyyy-MM-dd'T'HH:mm:ss'Z'`. The &quot;from&quot; and &quot;to&quot; date range must be within 7 days.
- **to** (`query`) `string` — End date.
- **event** (`query`) `string` — The event name. All types of events are queried if the parameter is not passed.
- **type** (`query`) `integer` — The query type: * `1` &mdash; Query all webhook logs. * `2` &mdash; Only query failed webhook logs. * `3` &mdash; Only query successful webhook logs. · valores: `1`, `2`, `3` · default: `2`
- **retry_num** (`query`) `integer` — The `retry_num` is used to filter webhook logs based on retry attempts. If not provided, all webhook logs are returned regardless of retry status. * `0` &mdash; Filters logs for initial deliveries (non-retry requests). * `1` &mdash; Filters logs for the first retry of webhook requests. * `2` &mdash; Filters logs for the second retry of webhook requests. * `3` &mdash; Filters logs for the third retry of webhook requests.

### Respuestas

**`200`** — **HTTP Status Code:** `200` Webhook logs info returned.

- **next_page_token** `string` — The API uses the next page token to paginate through large result sets. It returns a next page token whenever the set of available results exceeds the current page size. The expiration period for this token is 15 minutes.
- **page_size** `integer` — The page size of the result
- **webhook_logs** `object[]` — A list of webhook logs that match the specified query conditions.
  - `array` de:
    - **event** `string` — The event's name.
    - **status** `integer` — The http code returned from the endpoint. If the webhook is not sent to the endpoint due to an internal error, the status is `-1`
    - **failed_reason_type** `integer` — The reason type for connection error messages: * `1` &mdash; read time out. * `2` &mdash; connection refused. * `3` &mdash; hystrix fallback. * `4` &mdash; hystrix timeout. * `5` &mdash; async error. * `6` &mdash; DNS forbidden. * `7` &mdash; remote error. * `8` &mdash; in delegate white list. * `9` &mdash; cert error. * `10` &mdash; need instant retry. * `11` &mdash; host name verify failed. * `12` &mdash; TLS verify failed. * `13` &mdash; DNS resolve time out. * `14` &mdash; no client. * `15` &mdash; resource not found. * `16` &mdash; too many requests. · valores: `1`, `2`, `3`, `4`, `5`, `6`, `7`, `8`, `9`, `10`, `11`, `12`, `13`, `14`, `15`, `16`
    - **user_id** `string` — The user's unique id.
    - **endpoint** `string` — The webhook callback url.
    - **subscription_id** `string` — The subscription's unique id.
    - **request_headers** `string` — The request header.
    - **request_body** `string` — The request body
    - **response_headers** `string` — The response headers.
    - **response_body** `string` — The response body.
    - **date_time** `string` — The recorded time of the log.
    - **trace_id** `string` — A distributed tracing identifier used in this webhook request context, commonly used for troubleshooting. When multiple webhook events are triggered within the same context, they may share the same `trace_id`.
    - **request_id** `string` — The unique identifier for a webhook request, which remains unchanged across retry attempts.
    - **retry_num** `integer` — The number of retry attempts for this webhook request. A value of 0 signifies that the request is the initial send and not a retry. · valores: `0`, `1`, `2`, `3`

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `1506` <br> The 'retry_num' value must be an integer within the range of 0 to 3. <br>

**`401`** — **HTTP Status Code:** `401` <br> Unauthorized **Error Code:** `201` <br> You do not have permission to access the targeted resource. <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `1401` <br> APP ID does not exist: {$appId}. <br> **Error Code:** `1501` <br> The 'to' date must be after the 'from' date. <br> **Error Code:** `1502` <br> The date range must be within the last seven days. <br> **Error Code:** `1503` <br> The dates must follow the format: `yyyy-MM-dd'T'HH:mm:ss'Z'`. <br> **Error Code:** `1504` <br> The 'from' date must be before the current date(UTC). <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](https://developers.zoom.us/docs/api/rest/rate-limits/).

---

## `PATCH /marketplace/users/{userId}/apps/{appId}/subscription`

**Enable or disable user app subscription**

Enable or disable a user's app subscription. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `marketplace_app:write:admin` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `marketplace:write:app:admin` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `LIGHT`

`operationId`: `Enable/Disableuserappsubscription` · tags: `App` · seguridad: `openapi_authorization`

### Parámetros

- **appId** (`path`) `string` _requerido_ — Application ID.
- **userId** (`path`) `string` _requerido_ — User ID.

### Request body — `application/json`

- **action** `string` _requerido_ — Enable or disable a user's app subscription. · valores: `enable`, `disable`

### Respuestas

**`204`** — **HTTP Status Code:** `204` App subscription status updated.

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `1001` <br> User does not exist or does not belong to this account. <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](https://developers.zoom.us/docs/api/rate-limits/).


# Zoom Marketplace — eventos de la app (desautorización, pedidos de autorización)

- Versión declarada: `1.0.0`
- Server: `https://{your-endpoint-url}`
- Spec original: [`https://developers.zoom.us/api/zoap/marketplace/events/`](https://developers.zoom.us/api/zoap/marketplace/events/)

## Descripción del proveedor

The Marketplace webhooks allow developers to receive events related to their app in the marketplace.

## Eventos de webhook

| Evento | Método | Qué lo dispara |
| --- | --- | --- |
| `app.authorization_request_approved` | `POST` | app.authorization_request_approved |
| `app.authorization_request_created` | `POST` | app.authorization_request_created |
| `app.authorization_request_declined` | `POST` | app.authorization_request_declined |
| `app_deauthorized` | `POST` | app_deauthorized |

---

## `POST app.authorization_request_approved`

**app.authorization_request_approved**

Zoom triggers the **App Request Approved** event when an administrator approves a user's request to install an app. ## Prerequisites * **Event Subscriptions** must be enabled for your [Marketplace app](https://marketplace.zoom.us/user/build) with the following configurations: * A valid **Event Notification Endpoint URL**. * The **App Request Approved** subscription enabled under the **Marketplace** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `marketplace_app:read:admin` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `marketplace:read:app_request:admin`

`operationId`: `App.authorization_request_approvedWebhook` · tags: `webhook`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The name of the event.
- **event_ts** `integer` _requerido_ — A timestamp at which the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **request_id** `string` _requerido_ — The unique ID for this app installation request.
  - **app_id** `string` _requerido_ — The unique identifier for the app.
  - **app_name** `string` _requerido_ — The app's name.
  - **app_type** `string` _requerido_ — The app's type.
  - **app_status** `string` _requerido_ — The app's status: * `published` * `unpublished` · valores: `published`, `unpublished`
  - **app_description** `string` — The app's description.
  - **scope** `string` _requerido_ — The scope of the admin's review action: * `all_users_on_account` — The admin approved the request for all users on the account. * `specific_users` — The admin approved the request for specific selected users. · valores: `all_users_on_account`, `specific_users`
  - **reviewer_name** `string` _requerido_ — The display name of the administrator who approved the request.
  - **reviewer_email** `string` _requerido_ — The email address of the administrator who approved the request. · formato: `email`
  - **reviewed_requests** `object[]` — A list of user requests that were approved. When `scope` is `all_users_on_account`, this might be absent. When `scope` is `specific_users`, this includes the approved users.
    - `array` de:
      - **requester_name** `string` _requerido_ — The name of the user who requested to install the app.
      - **requester_email** `string` _requerido_ — The email of the user who requested to install the app. · formato: `email`

```json
{
  "event": "app.authorization_request_approved",
  "event_ts": 1641884378841,
  "payload": {
    "request_id": "wEVg-VQOTgGVCWWhuJRxCg",
    "app_id": "wFhhvfBnSP6EtmebqXZCPQ",
    "app_name": "My Test App",
    "app_type": "SDK OAuth App",
    "app_status": "published",
    "app_description": "This is a test app.",
    "scope": "specific_users",
    "reviewer_name": "Admin User",
    "reviewer_email": "admin@example.com",
    "reviewed_requests": [
      {
        "requester_name": "Jill Chill",
        "requester_email": "jill.chill@example.com"
      },
      {
        "requester_name": "Alex Morgan",
        "requester_email": "alex.morgan@example.com"
      }
    ]
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST app.authorization_request_created`

**app.authorization_request_created**

The **App Request Approval** event is triggered any time a user requests to install an app. ## Prerequisites * **Event Subscriptions** must be enabled for your [Marketplace app](https://marketplace.zoom.us/user/build) with the following configurations: * A valid **Event Notification Endpoint URL**. * The **App Request Approval** subscription enabled under the **Marketplace** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `marketplace_app:read:admin` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `marketplace:read:app_request:admin`

`operationId`: `App.authorization_request_createdWebhook` · tags: `webhook`

### Request body — `application/json` (requerido)

- **event** `string` — The name of the event.
- **event_ts** `integer` — A timestamp at which the event occurred. · formato: `int64`
- **payload** `object`
  - **app_name** `string` — The app's name.
  - **app_type** `string` — The app's type.
  - **app_status** `string` — The app's status: * `published` * `development` · valores: `published`, `development`
  - **app_description** `string` — The app's description.
  - **app_link** `object` — Information about the app's developer documentation URLs.
    - **developer_documentation** `string` — The app's documentation URL. · formato: `url`
    - **developer_privacy_policy** `string` — The app's privacy policy URL. · formato: `url`
    - **developer_support** `string` — The app's support URL. · formato: `url`
    - **developer_terms_of_use** `string` — The app's Terms of Use URL. · formato: `url`

```json
{
  "event": "app.authorization_request_created",
  "event_ts": "1641884378841",
  "payload": {
    "app_name": "DevSlackBot",
    "app_type": "SDK OAuth App",
    "app_status": "published",
    "app_description": "This is DevSlackBot.",
    "app_link": {
      "developer_documentation": "https://devslackbot.example.com/docs",
      "developer_privacy_policy": "https://devslackbot.example.com/policy",
      "developer_support": "https://devslackbot.example.com/support",
      "developer_terms_of_use": "https://devslackbot.example.com/toc"
    },
    "app_permissions": {
      "View": [
        "Product Usage"
      ],
      "Manage": [
        "Registration & Scheduling",
        "Content",
        "Participants"
      ]
    },
    "install_requirements": {
      "min_client": "5.7.3",
      "user_role": "Any User",
      "account_eligibility": {
        "premium_events": [
          "Meeting Participant QoS",
          "Webinar Participant QoS",
          "Meeting Participant Advanced Data",
          "Webinar Participant Advanced Data",
          "Meeting Participant QoS Summary",
          "Webinar Participant QoS Summary"
        ],
        "account_types": [
          "On Prem",
          "Education",
          "Pro",
          "VIP"
        ]
      }
    },
    "app_scopes": [
      "meeting:write"
    ],
    "requester_name": "Jill Chill",
    "requester_department": "Development",
    "requester_user_groups": [
      "preappoval"
    ],
    "request_reason": "I need to install this app."
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST app.authorization_request_declined`

**app.authorization_request_declined**

Zoom triggers the **App Request Declined** event when an administrator declines a user's request to install an app. ## Prerequisites * **Event Subscriptions** must be enabled for your [Marketplace app](https://marketplace.zoom.us/user/build) with the following configurations: * A valid **Event Notification Endpoint URL**. * The **App Request Declined** subscription enabled under the **Marketplace** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `marketplace_app:read:admin` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `marketplace:read:app_request:admin`

`operationId`: `App.authorization_request_declinedWebhook` · tags: `webhook`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The name of the event.
- **event_ts** `integer` _requerido_ — A timestamp at which the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **request_id** `string` _requerido_ — The unique ID for this app installation request.
  - **app_id** `string` _requerido_ — The unique identifier for the app.
  - **app_name** `string` _requerido_ — The app's name.
  - **app_type** `string` _requerido_ — The app's type.
  - **app_status** `string` _requerido_ — The app's status: * `published` * `unpublished` · valores: `published`, `unpublished`
  - **app_description** `string` — The app's description.
  - **scope** `string` _requerido_ — The scope of the admin's review action: * `all_users_on_account` — The admin declined the request for all users on the account. * `specific_users` — The admin declined the request for specific selected users. · valores: `all_users_on_account`, `specific_users`
  - **reviewer_name** `string` _requerido_ — The display name of the administrator who declined the request.
  - **reviewer_email** `string` _requerido_ — The email address of the administrator who declined the request. · formato: `email`
  - **reviewed_requests** `object[]` — A list of user requests that were declined. When `scope` is `all_users_on_account`, this might be absent. When `scope` is `specific_users`, this includes the declined users.
    - `array` de:
      - **requester_name** `string` _requerido_ — The name of the user who requested to install the app.
      - **requester_email** `string` _requerido_ — The email of the user who requested to install the app. · formato: `email`

```json
{
  "event": "app.authorization_request_declined",
  "event_ts": 1641884378841,
  "payload": {
    "request_id": "wEVg-VQOTgGVCWWhuJRxCg",
    "app_id": "wFhhvfBnSP6EtmebqXZCPQ",
    "app_name": "My Test App",
    "app_type": "SDK OAuth App",
    "app_status": "published",
    "app_description": "This is a test app.",
    "scope": "specific_users",
    "reviewer_name": "Admin User",
    "reviewer_email": "admin@example.com",
    "reviewed_requests": [
      {
        "requester_name": "Jill Chill",
        "requester_email": "jill.chill@example.com"
      },
      {
        "requester_name": "Alex Morgan",
        "requester_email": "alex.morgan@example.com"
      }
    ]
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST app_deauthorized`

**app_deauthorized**

A user or an account admin who installed your app can uninstall it at any time. The **App Deauthorization** event is triggered every time a user uninstalls or deauthorizes your app. ## Prerequisites * You have configured a valid deauthorization notification URL for your app. The field is located at the bottom of the **Information** tab of the [app configuration page](https://marketplace.zoom.us/develop/create). For more information, see [Deauthorization URLs](https://marketplace.zoom.us/docs/guides/auth/deauthorization/) See <a href="https://developers.zoom.us/docs/api/rest/webhook-reference/#verify-webhook-events">Webhook verification</a> for securing your webhook endpoint.

`operationId`: `App_deauthorizedWebhook` · tags: `webhook`

### Request body — `application/json` (requerido)

- **event** `string` — The name of the event.
- **payload** `object`
  - **user_id** `string` — The user's ID.
  - **account_id** `string` — The user's account ID.
  - **client_id** `string` — The app's client ID.
  - **deauthorization_time** `string` — The date and time at which the user uninstalled the app. · formato: `date-time`
  - **signature** `string` — A unique ID for each instance of app deauthorization and uninstallation by the user.
  - **event_ts** `number` — The timestamp of the webhook event.

```json
{
  "event": "app_deauthorized",
  "payload": {
    "account_id": "AAAAAABBBB",
    "user_id": "abcD3ojfdbjfg",
    "signature": "827edc3452044f0bc86bdd5684afb7d1e6becfa1a767f24df1b287853cf73000",
    "deauthorization_time": "2020-06-17T13:52:28.632Z",
    "client_id": "ABCDEFGHIJKLMNOPQRST!V",
    "event_ts": "2024-09-08 15:58:40"
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.
