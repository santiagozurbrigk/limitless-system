---
title: "Zoom Meetings API (recorte para Limitless)"
source: "https://developers.zoom.us/api/zoap/meetings/methods/"
capturado: "2026-11-23"
---

# Zoom Meetings API — webinars, registrantes y reportes de participantes

Recorte del spec oficial [`openapi/meetings-methods.json`](./openapi/meetings-methods.json): sólo webinars, registrantes, participantes pasados y reportes (y sus equivalentes de reunión). Cada descripción trae, tal como la publica Zoom, el plan requerido, los **scopes**, los **granular scopes** y el **Rate Limit Label**. Para el resto de la API, el spec completo.

- Versión declarada: `2`
- Server: `https://api.zoom.us/v2`
- Auth `openapi_authorization`: http / bearer
- Spec original: [`https://developers.zoom.us/api/zoap/meetings/methods/`](https://developers.zoom.us/api/zoap/meetings/methods/)

## Descripción del proveedor

The Zoom Meeting APIs allow developers to interface with Zoom Meetings and Webinars programmatically.

## Índice de endpoints

| Método | Path | Qué hace |
| --- | --- | --- |
| `POST` | [`/meetings/{meetingId}/batch_registrants`](#post-meetings-meetingid-batch-registrants) | Perform batch registration |
| `GET` | [`/meetings/{meetingId}/registrants`](#get-meetings-meetingid-registrants) | List meeting registrants |
| `POST` | [`/meetings/{meetingId}/registrants`](#post-meetings-meetingid-registrants) | Add a meeting registrant |
| `GET` | [`/past_meetings/{meetingId}/instances`](#get-past-meetings-meetingid-instances) | List past meeting instances |
| `GET` | [`/past_meetings/{meetingId}/participants`](#get-past-meetings-meetingid-participants) | Get past meeting participants |
| `GET` | [`/past_webinars/{webinarId}/absentees`](#get-past-webinars-webinarid-absentees) | Get webinar absentees |
| `GET` | [`/past_webinars/{webinarId}/instances`](#get-past-webinars-webinarid-instances) | List past webinar instances |
| `GET` | [`/past_webinars/{webinarId}/participants`](#get-past-webinars-webinarid-participants) | List webinar participants |
| `GET` | [`/report/meetings/{meetingId}/participants`](#get-report-meetings-meetingid-participants) | Get meeting participant reports |
| `GET` | [`/report/webinars/{webinarId}`](#get-report-webinars-webinarid) | Get webinar detail reports |
| `GET` | [`/report/webinars/{webinarId}/participants`](#get-report-webinars-webinarid-participants) | Get webinar participant reports |
| `GET` | [`/users/{userId}/webinars`](#get-users-userid-webinars) | List webinars |
| `POST` | [`/users/{userId}/webinars`](#post-users-userid-webinars) | Create a webinar |
| `DELETE` | [`/webinars/{webinarId}`](#delete-webinars-webinarid) | Delete a webinar |
| `GET` | [`/webinars/{webinarId}`](#get-webinars-webinarid) | Get a webinar |
| `PATCH` | [`/webinars/{webinarId}`](#patch-webinars-webinarid) | Update a webinar |
| `POST` | [`/webinars/{webinarId}/batch_registrants`](#post-webinars-webinarid-batch-registrants) | Perform batch registration |
| `GET` | [`/webinars/{webinarId}/registrants`](#get-webinars-webinarid-registrants) | List webinar registrants |
| `POST` | [`/webinars/{webinarId}/registrants`](#post-webinars-webinarid-registrants) | Add a webinar registrant |
| `GET` | [`/webinars/{webinarId}/registrants/questions`](#get-webinars-webinarid-registrants-questions) | List registration questions |
| `PATCH` | [`/webinars/{webinarId}/registrants/questions`](#patch-webinars-webinarid-registrants-questions) | Update registration questions |
| `PUT` | [`/webinars/{webinarId}/registrants/status`](#put-webinars-webinarid-registrants-status) | Update registrant's status |
| `DELETE` | [`/webinars/{webinarId}/registrants/{registrantId}`](#delete-webinars-webinarid-registrants-registrantid) | Delete a webinar registrant |
| `GET` | [`/webinars/{webinarId}/registrants/{registrantId}`](#get-webinars-webinarid-registrants-registrantid) | Get a webinar registrant |
| `PUT` | [`/webinars/{webinarId}/status`](#put-webinars-webinarid-status) | Update webinar status |
| `GET` | [`/webinars/{webinarId}/tracking_sources`](#get-webinars-webinarid-tracking-sources) | Get webinar tracking sources |

---

## `POST /meetings/{meetingId}/batch_registrants`

**Perform batch registration**

Register up to 30 registrants at once for a meeting that requires [registration](https://support.zoom.us/hc/en-us/articles/211579443-Registration-for-Meetings). **Prerequisites:** * The meeting host must be a Licensed user. * The meeting must require registration and should be of type `2`, i.e., they should be scheduled meetings. Instant meetings and Recurring meetings are not supported by this API. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `meeting:write`,`meeting:write:admin` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `meeting:write:batch_registrants`,`meeting:write:batch_registrants:admin` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `HEAVY`

`operationId`: `addBatchRegistrants` · tags: `Invitation & Registration` · seguridad: `openapi_authorization`

### Parámetros

- **meetingId** (`path`) `string` _requerido_ — Unique identifier of the meeting (Meeting Number).

### Request body — `application/json`

- **auto_approve** `boolean` — If a meeting was scheduled with approval_type `1` (manual approval), but you would like to automatically approve the registrants that are added via this API, you can set the value of this field to `true`. You **cannot** use this field to change approval setting for a meeting that was originally scheduled with approval_type `0` (automatic approval).
- **registrants_confirmation_email** `boolean` — Send confirmation Email to Registrants
- **registrants** `object[]`
  - `array` de:
    - **email** `string` _requerido_ — Email address of the registrant. · formato: `email`
    - **first_name** `string` _requerido_ — First name of the registrant.
    - **last_name** `string` — Last name of the registrant.

### Respuestas

**`201`** — **HTTP Status Code:** `200` **OK** Registrants added.

- **registrants** `object[]`
  - `array` de:
    - **email** `string` — Email address of the registrant.
    - **join_url** `string` — Unique URL using which registrant can join the meeting.
    - **registrant_id** `string` — Unique identifier of the registrant.
    - **participant_pin_code** `integer` — The participant PIN code is used to authenticate audio participants before they join the meeting. · formato: `int64`

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `3038` <br> Meeting is over, you can not register now. If you have any questions, please contact the Meeting host. <br> **Error Code:** `303` <br> This API can only be used for scheduled meeting(meeting type: 2). Batch registration is not supported for other meeting types. <br> **Error Code:** `3161` <br> Meeting hosting and scheduling capabilities are not allowed for your user account. <br> **Error Code:** `3043` <br> Meeting has reached maximum attendee capacity. <br> **Error Code:** `404` <br> Registration has not been enabled for this meeting: {meetingId}. <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `3001` <br> Meeting does not exist: {meetingId}. <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](/docs/api/rest/rate-limits/).

---

## `GET /meetings/{meetingId}/registrants`

**List meeting registrants**

List users that have registered for a meeting. A host or a user with admin permission can require [registration for a Zoom meeting](https://support.zoom.us/hc/en-us/articles/211579443-Registration-for-Meetings). **Prerequisites**: * Host user type must be **Pro** or higher plan. * Registration must be enabled for the meeting. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `meeting:read:admin`,`meeting:read` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `meeting:read:list_registrants`,`meeting:read:list_registrants:admin` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `MEDIUM`

`operationId`: `meetingRegistrants` · tags: `Invitation & Registration` · seguridad: `openapi_authorization`

### Parámetros

- **meetingId** (`path`) `integer` _requerido_ — The meeting's ID. When storing this value in your database, store it as a long format integer, not an integer. Meeting IDs can exceed 10 digits.
- **occurrence_id** (`query`) `string` — The meeting or webinar occurrence ID.
- **status** (`query`) `string` — Query by the registrant's status. * `pending` - The registration is pending. * `approved` - The registrant is approved. * `denied` - The registration is denied. · valores: `pending`, `approved`, `denied` · default: `approved`
- **page_size** (`query`) `integer` — The number of records returned within a single API call. · default: `30`
- **page_number** (`query`) `integer` — **Deprecated.** We will no longer support this field in a future release. Instead, use the `next_page_token` for pagination. · default: `1`
- **next_page_token** (`query`) `string` — Use the next page token to paginate through large result sets. A next page token is returned whenever the set of available results exceeds the current page size. This token's expiration period is 15 minutes.

### Respuestas

**`200`** — **HTTP Status Code:** `200` Successfully listed meeting registrants.

- **next_page_token** `string` — Use the next page token to paginate through large result sets. A next page token is returned whenever the set of available results exceeds the current page size. This token's expiration period is 15 minutes.
- **page_count** `integer` — The number of pages returned for the request made.
- **page_number** `integer` — **Deprecated.** We will no longer support this field in a future release. Instead, use the `next_page_token` for pagination. · default: `1`
- **page_size** `integer` — The number of records returned with a single API call. · default: `30`
- **total_records** `integer` — The total number of all the records available across pages.
- **registrants** `object | object | object[]` — List of registrant objects.
  - `array` de:
    - **id** `string` — Registrant ID.
    - **address** `string` — The registrant's address.
    - **city** `string` — The registrant's city.
    - **comments** `string` — The registrant's questions and comments.
    - **country** `string` — The registrant's two-letter [country code](/docs/api/rest/other-references/abbreviation-lists/#countries).
    - **custom_questions** `object[]` — Information about custom questions.
      - `array` de:
        - _(anidamiento truncado)_
    - **email** `string` _requerido_ — The registrant's email address. See [Email address display rules](https://developers.zoom.us/docs/api/rest/using-zoom-apis/#email-address-display-rules) for return value details. · formato: `email`
    - **first_name** `string` _requerido_ — The registrant's first name.
    - **industry** `string` — The registrant's industry.
    - **job_title** `string` — The registrant's job title.
    - **last_name** `string` — The registrant's last name.
    - **no_of_employees** `string` — The registrant's number of employees. * `1-20` * `21-50` * `51-100` * `101-250` * `251-500` * `501-1,000` * `1,001-5,000` * `5,001-10,000` * `More than 10,000` · valores: ``, `1-20`, `21-50`, `51-100`, `101-250`, `251-500`, `501-1,000`, `1,001-5,000`, `5,001-10,000`, `More than 10,000`
    - **org** `string` — The registrant's organization.
    - **phone** `string` — The registrant's phone number.
    - **purchasing_time_frame** `string` — The registrant's purchasing time frame. * `Within a month` * `1-3 months` * `4-6 months` * `More than 6 months` * `No timeframe` · valores: ``, `Within a month`, `1-3 months`, `4-6 months`, `More than 6 months`, `No timeframe`
    - **role_in_purchase_process** `string` — The registrant's role in the purchase process. * `Decision Maker` * `Evaluator/Recommender` * `Influencer` * `Not involved` · valores: ``, `Decision Maker`, `Evaluator/Recommender`, `Influencer`, `Not involved`
    - **state** `string` — The registrant's state or province.
    - **status** `string` — The registrant's status. * `approved` - Registrant is approved. * `denied` - Registrant is denied. * `pending` - Registrant is waiting for approval. · valores: `approved`, `denied`, `pending`
    - **zip** `string` — The registrant's ZIP or postal code.
    - **create_time** `string` — The time when the registrant registered. · formato: `date-time`
    - **join_url** `string` — The URL that an approved registrant can use to join the meeting or webinar. · formato: `string`
    - **status** `string` — The status of the registrant's registration. `approved` - User has been successfully approved for the webinar. `pending` - The registration is still pending. `denied` - User has been denied from joining the webinar.
    - **participant_pin_code** `integer` — The participant PIN code is used to authenticate audio participants before they join the meeting. · formato: `int64`

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `300` <br> Cannot access webinar info. <br> **Error Code:** `3161` <br> Meeting hosting and scheduling capabilities are not allowed for your user account. <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `3001` <br> Meeting does not exist: {meetingId}. <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](/docs/api/rest/rate-limits/).

---

## `POST /meetings/{meetingId}/registrants`

**Add a meeting registrant**

Create and submit a user's registration to a meeting. See [Customizing webinar registration](https://support.zoom.us/hc/en-us/articles/202835649-Customizing-webinar-registration) for details on how to set the requirements for these fields. Note that there is a maximum limit of 4,999 registrants per meeting and users will see an error if the meeting's capacity is reached. **Prerequisites:** * The host must be a **Licensed** user type. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `meeting:write:admin`,`meeting:write` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `meeting:write:registrant`,`meeting:write:registrant:admin` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `LIGHT`

`operationId`: `meetingRegistrantCreate` · tags: `Invitation & Registration` · seguridad: `openapi_authorization`

### Parámetros

- **meetingId** (`path`) `integer` _requerido_ — The meeting's ID. When storing this value in your database, you must store it as a long format integer and **not** an integer. Meeting IDs can exceed 10 digits.
- **occurrence_ids** (`query`) `string` — A comma-separated list of meeting occurrence IDs. You can get this value with the [Get a meeting](/docs/api-reference/zoom-api/methods#operation/meeting) API.

### Request body — `application/json`

- **first_name** `string` _requerido_ — The registrant's first name.
- **last_name** `string` — The registrant's last name.
- **email** `string` _requerido_ — The registrant's email address. · formato: `email`
- **address** `string` — The registrant's address.
- **city** `string` — The registrant's city.
- **state** `string` — The registrant's state or province.
- **zip** `string` — The registrant's ZIP or postal code.
- **country** `string` — The registrant's two-letter [country code](https://marketplace.zoom.us/docs/api-reference/other-references/abbreviation-lists#countries).
- **phone** `string` — The registrant's phone number.
- **comments** `string` — The registrant's questions and comments.
- **custom_questions** `object[]` — Information about custom questions.
  - `array` de:
    - **title** `string` — The title of the custom question.
    - **value** `string` — The custom question's response value. This has a limit of 128 characters.
- **industry** `string` — The registrant's industry.
- **job_title** `string` — The registrant's job title.
- **no_of_employees** `string` — The registrant's number of employees: * `1-20` * `21-50` * `51-100` * `101-500` * `500-1,000` * `1,001-5,000` * `5,001-10,000` * `More than 10,000` · valores: ``, `1-20`, `21-50`, `51-100`, `101-500`, `500-1,000`, `1,001-5,000`, `5,001-10,000`, `More than 10,000`
- **org** `string` — The registrant's organization.
- **purchasing_time_frame** `string` — The registrant's purchasing time frame: * `Within a month` * `1-3 months` * `4-6 months` * `More than 6 months` * `No timeframe` · valores: ``, `Within a month`, `1-3 months`, `4-6 months`, `More than 6 months`, `No timeframe`
- **role_in_purchase_process** `string` — The registrant's role in the purchase process: * `Decision Maker` * `Evaluator/Recommender` * `Influencer` * `Not involved` · valores: ``, `Decision Maker`, `Evaluator/Recommender`, `Influencer`, `Not involved`
- **language** `string` — The registrant's language preference for confirmation emails: * `en-US` &mdash; English (US) * `de-DE` &mdash; German (Germany) * `es-ES` &mdash; Spanish (Spain) * `fr-FR` &mdash; French (France) * `jp-JP` &mdash; Japanese * `pt-PT` &mdash; Portuguese (Portugal) * `ru-RU` &mdash; Russian * `zh-CN` &mdash; Chinese (PRC) * `zh-TW` &mdash; Chinese (Taiwan) * `ko-KO` &mdash; Korean * `it-IT` &mdash; Italian (Italy) * `vi-VN` &mdash; Vietnamese * `pl-PL` &mdash; Polish * `Tr-TR` &mdash; Turkish · valores: `en-US`, `de-DE`, `es-ES`, `fr-FR`, `jp-JP`, `pt-PT`, `ru-RU`, `zh-CN`, `zh-TW`, `ko-KO`, `it-IT`, `vi-VN`, `pl-PL`, `Tr-TR`
- **auto_approve** `boolean` — If a meeting was scheduled with the `approval_type` field value of `1` (manual approval) but you want to automatically approve meeting registrants, set the value of this field to `true`. **Note:** You cannot use this field to change approval setting for a meeting originally scheduled with the `approval_type` field value of `0` (automatic approval).

### Respuestas

**`201`** — **HTTP Status Code:** `201` Meeting registration created.

- **id** `integer` — The meeting ID. · formato: `int64`
- **join_url** `string` — The URL the registrant can use to join the meeting. The API will not return this field if the meeting was [created](/docs/api-reference/zoom-api/methods#operation/meetingCreate) with the `approval_type` field value of `1` (manual approval).
- **registrant_id** `string` — The registrant's ID.
- **start_time** `string` — The meeting's start time. · formato: `date-time`
- **topic** `string` — The meeting's topic.
- **occurrences** `object[]` — Array of occurrence objects.
  - `array` de:
    - **duration** `integer` — Duration.
    - **occurrence_id** `string` — Occurrence ID: Unique Identifier that identifies an occurrence of a recurring webinar. [Recurring webinars](https://support.zoom.us/hc/en-us/articles/216354763-How-to-Schedule-A-Recurring-Webinar) can have a maximum of 50 occurrences.
    - **start_time** `string` — Start time. · formato: `date-time`
    - **status** `string` — Occurrence status.
- **participant_pin_code** `integer` — The participant PIN code is used to authenticate audio participants before they join the meeting. · formato: `int64`

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `3043` <br> Meeting has reached maximum attendee capacity. <br> **Error Code:** `3000` <br> Cannot access meeting info. <br> **Error Code:** `3161` <br> Meeting hosting and scheduling capabilities are not allowed for your user account. <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `1001` <br> Meeting does not exist: {meetingId}. <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](https://developers.zoom.us/docs/api/rest/rate-limits/).

---

## `GET /past_meetings/{meetingId}/instances`

**List past meeting instances**

Return a list of past meeting instances. **Prerequisites** * The meeting must have already occurred at least once. This endpoint only returns instances of meetings that have ended. * You cannot retrieve instances for meetings that occurred more than 15 months ago. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `meeting:read:admin`,`meeting:read` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `meeting:read:list_past_instances`,`meeting:read:list_past_instances:admin` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `MEDIUM`

`operationId`: `pastMeetings` · tags: `Meetings` · seguridad: `openapi_authorization`

### Parámetros

- **meetingId** (`path`) `integer` _requerido_ — The past meeting's ID.
- **from** (`query`) `string` — Start date in UTC, in yyyy-MM-dd format. This parameter only takes effect when used together with to. For best performance, we recommend querying within a one-month range.
- **to** (`query`) `string` — End date in UTC, in yyyy-MM-dd format. This parameter only takes effect when used together with from.

### Respuestas

**`200`** — **HTTP Status Code:** `200` List of ended meeting instances returned.

- **meetings** `object[]` — List of ended meeting instances.
  - `array` de:
    - **start_time** `string` — Start time · formato: `date-time`
    - **uuid** `string` — Meeting UUID. Unique meeting ID. Each meeting instance will generate its own Meeting UUID. After a meeting ends, a new UUID will be generated for the next instance of that recurring meeting. [Double encode](https://marketplace.zoom.us/docs/api-reference/using-zoom-apis/#meeting-id-and-uuid) your UUID when using it for API calls if the UUID begins with a '/'or contains '//' in it.
    - **occurrence_id** `string` — Occurrence ID. The unique identifier for an occurrence of a recurring meeting.

**`401`** — **HTTP Status Code:** `401` <br> Unauthorized

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `3001` <br> Meeting does not exist: {meetingId}. <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](https://developers.zoom.us/docs/api/rate-limits/). **Error Code:** `4001` <br> You have reached the maximum per-second rate limit for this API. Try again later. <br>

---

## `GET /past_meetings/{meetingId}/participants`

**Get past meeting participants**

Retrieve participant information for a past meeting. **Prerequisites:** * A paid account with a Pro plan or higher. * If the meeting UUID contains any `/` characters, you must double-encode the UUID before sending the request. * The meeting must be within the last 15 months. Participant data is not available for meetings older than 15 months. * By default, this endpoint does not return participant data for meetings with only one participant. To include one-participant meetings, enable the account setting **Show one person meetings and webinars on Dashboard and Reports**. * For meetings with hundreds of participants, attendance data may take time to generate. If participant durations are returned as `0`, the request may have been made before processing completed. Wait briefly and retry. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `meeting:read:admin`,`meeting:read` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `meeting:read:list_past_participants`,`meeting:read:list_past_participants:admin` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `MEDIUM`

`operationId`: `pastMeetingParticipants` · tags: `Meetings` · seguridad: `openapi_authorization`

### Parámetros

- **meetingId** (`path`) `string` _requerido_ — The meeting's ID or universally unique ID (UUID). * If you provide a meeting ID, the API returns a response for the latest meeting instance. * If you provide a meeting UUID that contains any `/` characters, you **must** double-encode the meeting UUID before making an API request.
- **page_size** (`query`) `integer` — The number of records returned within a single API call. · default: `30`
- **next_page_token** (`query`) `string` — Use the next page token to paginate through large result sets. A next page token is returned whenever the set of available results exceeds the current page size. This token's expiration period is 15 minutes.

### Respuestas

**`200`** — **HTTP Status Code:** `200` Past meeting participants returned.

- **next_page_token** `string` — Use the next page token to paginate through large result sets. A next page token is returned whenever the set of available results exceeds the current page size. The expiration period for this token is 15 minutes.
- **page_count** `integer` — The number of pages returned for the request made.
- **page_size** `integer` — The number of records returned within a single API call. · default: `30`
- **total_records** `integer` — The total number of records available across all pages.
- **participants** `object[]` — An array of meeting participant objects.
  - `array` de:
    - **id** `string` — The participant's universally unique identifier (UUID). This is the same as the user ID if the participant joins the meeting by logging into Zoom. If the participant joins the meeting without logging in, this field returns an empty value.
    - **name** `string` — The participant's display name.
    - **user_id** `string` — The participant's ID. This is a unique ID assigned to the participant joining a meeting and is valid for that meeting only.
    - **registrant_id** `string` — The participant's unique registrant ID. This field only returns if you pass the `registrant_id` value for the `include_fields` query parameter. This field does not return if the `type` query parameter is the `live` value.
    - **user_email** `string` — The participant's email address. If the participant is **not** part of the host's account, this returns an empty string value, with some exceptions. See [Email address display rules](https://developers.zoom.us/docs/api/rest/using-zoom-apis/#email-address-display-rules) for details.
    - **join_time** `string` — The participant's join time. · formato: `date-time`
    - **leave_time** `string` — The participant's leave time. · formato: `date-time`
    - **duration** `integer` — The participant's duration in the meeting, in seconds, calculated by subtracting the `leave_time` from the `join_time` for the `user_id`. If the participant leaves and rejoins the same meeting, they are assigned a different `user_id`, and Zoom displays their new duration in a separate object. Because of this, the duration may not reflect the total time the user was in the meeting.
    - **failover** `boolean` — Whether a failover occurred during the meeting.
    - **status** `string` — The participant's status. * `in_meeting` — In a meeting. * `in_waiting_room` — In a waiting room. · valores: `in_meeting`, `in_waiting_room`
    - **internal_user** `boolean` — Whether the meeting participant is an internal user. · default: `False`

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `200` <br> Only available for paid account: {accountId} <br> **Error Code:** `12702` <br> Can not access a meeting a year ago. <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `3001` <br> Meeting does not exist: {meetingId}. <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](/docs/api/rest/rate-limits/).

---

## `GET /past_webinars/{webinarId}/absentees`

**Get webinar absentees**

List absentees of a webinar. **Prerequisites** * A Pro or higher plan with a [Webinar plan](https://zoom.us/webinar) add-on. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:read` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:list_absentees`,`webinar:read:list_absentees:admin` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `HEAVY`

`operationId`: `webinarAbsentees` · tags: `Webinars` · seguridad: `openapi_authorization`

### Parámetros

- **webinarId** (`path`) `string` _requerido_ — The webinar's ID or universally unique ID (UUID). * If you provide a webinar ID, the API will return a response for the latest webinar instance. * If you provide a webinar UUID that begins with a `/` character or contains the `//` characters, you **must** [double encode](https://developers.zoom.us/docs/api/rest/using-zoom-apis/#meeting-id-and-uuid) the webinar UUID before making an API request.
- **occurrence_id** (`query`) `string` — The meeting or webinar occurrence ID.
- **page_size** (`query`) `integer` — The number of records returned within a single API call. · default: `30`
- **next_page_token** (`query`) `string` — Use the next page token to paginate through large result sets. A next page token is returned whenever the set of available results exceeds the current page size. This token's expiration period is 15 minutes.

### Respuestas

**`200`** — **HTTP Status Code:** `200` Success. **Error Code:** `200` Webinar plan subscription is missing. Enable webinar for this user once the subscription is added:{userId}.

- **next_page_token** `string` — Use the next page token to paginate through large result sets. A next page token is returned whenever the set of available results exceeds the current page size. This token's expiration period is 15 minutes.
- **page_count** `integer` — The number of pages returned for the request made.
- **page_number** `integer` — **Deprecated.** This field is deprecated. We will no longer support this field in a future release. Instead, use the `next_page_token` for pagination. · default: `1`
- **page_size** `integer` — The number of records returned with a single API call. · default: `30`
- **total_records** `integer` — The total number of all the records available across pages.
- **registrants** `object | object | object[]` — List of registrant objects.
  - `array` de:
    - **id** `string` — Registrant ID.
    - **address** `string` — The registrant's address.
    - **city** `string` — The registrant's city.
    - **comments** `string` — The registrant's questions and comments.
    - **country** `string` — The registrant's two-letter ISO [country code](https://developers.zoom.us/docs/api/rest/other-references/abbreviation-lists/#countries).
    - **custom_questions** `object[]` — Information about custom questions.
      - `array` de:
        - **title** `string` — The title of the custom question.
        - **value** `string` — The custom question's response value. This has a limit of 128 characters.
    - **email** `string` _requerido_ — The registrant's email address. See [Email address display rules](https://developers.zoom.us/docs/api/rest/using-zoom-apis/#email-address-display-rules) for return value details. · formato: `email`
    - **first_name** `string` _requerido_ — The registrant's first name.
    - **industry** `string` — The registrant's industry.
    - **job_title** `string` — The registrant's job title.
    - **last_name** `string` — The registrant's last name.
    - **no_of_employees** `string` — The registrant's number of employees. * `1-20` * `21-50` * `51-100` * `101-250` * `251-500` * `501-1,000` * `1,001-5,000` * `5,001-10,000` * `More than 10,000` · valores: ``, `1-20`, `21-50`, `51-100`, `101-250`, `251-500`, `501-1,000`, `1,001-5,000`, `5,001-10,000`, `More than 10,000`
    - **org** `string` — The registrant's organization.
    - **phone** `string` — The registrant's phone number.
    - **purchasing_time_frame** `string` — The registrant's purchasing time frame. * `Within a month` * `1-3 months` * `4-6 months` * `More than 6 months` * `No timeframe` · valores: ``, `Within a month`, `1-3 months`, `4-6 months`, `More than 6 months`, `No timeframe`
    - **role_in_purchase_process** `string` — The registrant's role in the purchase process. * `Decision Maker` * `Evaluator/Recommender` * `Influencer` * `Not involved` · valores: ``, `Decision Maker`, `Evaluator/Recommender`, `Influencer`, `Not involved`
    - **state** `string` — The registrant's state or province.
    - **status** `string` — The registrant's status. * `approved` - Registrant is approved. * `denied` - Registrant is denied. * `pending` - Registrant is waiting for approval. · valores: `approved`, `denied`, `pending`
    - **zip** `string` — The registrant's ZIP or postal code.
    - **create_time** `string` — The time when the registrant registered. · formato: `date-time`
    - **join_url** `string` — The URL that an approved registrant can use to join the meeting or webinar. · formato: `string`
    - **status** `string` — The status of the registrant's registration. `approved` - User has been successfully approved for the webinar. `pending` - The registration is still pending. `denied` - User has been denied from joining the webinar.

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `300` <br> The request could not be completed because you have provided an invalid occurrence ID: {occurrenceId}.<br> <br> **Error Code:** `1010` <br> User does not belong to this account: {accountId}.<br> <br> **Error Code:** `3000` <br> This webinar doesn't have registration required: {webinarUUID}. <br> **Error Code:** `200` <br> No permission. <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `3001` <br> Webinar {webinarUUID} not found or expired. <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](https://developers.zoom.us/docs/api/rate-limits/).

---

## `GET /past_webinars/{webinarId}/instances`

**List past webinar instances**

List past webinar instances. **Prerequisites** * A Pro or higher plan with a [Webinar plan](https://zoom.us/webinar) add-on. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:read` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:list_past_instances`,`webinar:read:list_past_instances:admin` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `LIGHT`

`operationId`: `pastWebinars` · tags: `Webinars` · seguridad: `openapi_authorization`

### Parámetros

- **webinarId** (`path`) `integer` _requerido_ — The webinar's ID.

### Respuestas

**`200`** — **HTTP Status Code:** `200` List of past webinar instances returned.

- **webinars** `object[]` — List of ended webinar instances.
  - `array` de:
    - **start_time** `string` — Start time. · formato: `date-time`
    - **uuid** `string` — Webinar UUID.
    - **occurrence_id** `string` — Occurrence ID. The unique identifier for an occurrence of a recurring webinar.

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `300` <br> Invalid webinar ID. <br> **Error Code:** `200` <br> No permission. <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](https://developers.zoom.us/docs/api/rest/rate-limits/).

---

## `GET /past_webinars/{webinarId}/participants`

**List webinar participants**

Retrieve a list of all the participants who attended a webinar hosted in the past. **Prerequisites:** * A Pro or higher plan with a webinar add-on. **NOTE:** After meetings with hundreds of participants, the attendance data takes some time to be generated. If you receive a duration of 0 for users' time in the meeting, you may have called the endpoint before the data is fully processed. Implement a short delay or retry logic before fetching participant data. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:read` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:list_past_participants:admin`,`webinar:read:list_past_participants` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `MEDIUM`

`operationId`: `listWebinarParticipants` · tags: `Webinars` · seguridad: `openapi_authorization`

### Parámetros

- **webinarId** (`path`) `string` _requerido_ — The webinar's ID or universally unique ID (UUID). * If you provide a webinar ID, the API returns a response for the latest webinar instance. * If you provide a webinar UUID that begins with a `/` character or contains the `//` characters, you **must** [double encode](https://developers.zoom.us/docs/api/rest/using-zoom-apis/#meeting-id-and-uuid) the webinar UUID before making an API request.
- **page_size** (`query`) `integer` — The number of records returned within a single API call. · default: `30`
- **next_page_token** (`query`) `string` — Use the next page token to paginate through large result sets. A next page token is returned whenever the set of available results exceeds the current page size. This token's expiration period is 15 minutes.

### Respuestas

**`200`** — **HTTP Status Code:** `200` **OK** Participants list returned.

- **next_page_token** `string` — Use the next page token to paginate through large result sets. A next page token is returned whenever the set of available results exceeds the current page size. This token's expiration period is 15 minutes.
- **page_count** `integer` — The number of pages returned for this request.
- **page_size** `integer` — The total number of records returned from a single API call. · default: `30`
- **participants** `object[]` — Array of webinar participant objects.
  - `array` de:
    - **id** `string` — The participant's unique identifier.
    - **name** `string` — The participant's name.
    - **user_id** `string` — The participant's ID. This ID is assigned to the participant upon joining the webinar and is only valid for that webinar.
    - **registrant_id** `string` — The participant's unique registrant ID. This field only returns if you pass the `registrant_id` value for the `include_fields` query parameter. This field does not return if the `type` query parameter is the `live` value.
    - **user_email** `string` — Email address of the participant. If the participant is **not** part of the host's account, this returns an empty string value, with some exceptions. See [Email address display rules](https://developers.zoom.us/docs/api/rest/using-zoom-apis/#email-address-display-rules) for details. · formato: `email`
    - **join_time** `string` — The participant's join time. · formato: `date-time`
    - **leave_time** `string` — The participant's leave time. · formato: `date-time`
    - **duration** `integer` — Participant duration, in seconds, calculated by subtracting the `leave_time` from the `join_time` for the `user_id`. If the participant leaves and rejoins the same meeting, they will be assigned a different `user_id` and Zoom displays their new duration in a separate object. Note that because of this, the duration may not reflect the total time the user was in the meeting.
    - **failover** `boolean` — Whether failover occurred during the webinar.
    - **status** `string` — The participant's status. * `in_meeting` - In a meeting. * `in_waiting_room` - In a waiting room. · valores: `in_meeting`, `in_waiting_room`
    - **internal_user** `boolean` — Whether the webinar participant is an internal user. · default: `False`
- **total_records** `integer` — The total number of records available across all pages.

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `200` <br> No permission. <br> **Error Code:** `300` <br> The next page token is invalid or expired. <br> **Error Code:** `200` <br> Only available for Paid or ZMP account: {accountId}. <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `3001` <br> Webinar does not exist. <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](https://developers.zoom.us/docs/api/rest/rate-limits/).

---

## `GET /report/meetings/{meetingId}/participants`

**Get meeting participant reports**

Return a report of a past meeting with two or more participants, including the host. To return a report for past meeting with only **one** participant, use the [**List meeting participants**](/docs/api/accounts/#tag/dashboards/GET/metrics/meetings/{meetingId}/participants) API. **Note:** This API may return empty values for participants' `user_name`, `ip_address`, `location`, and `email` responses when the account calling this API: * Is a [**legacy** HIPAA BAA account](/docs/api/references/legacy-business-associate-agreements/). **Prerequisites:** * A Pro or a higher plan. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `report:read:admin` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `report:read:list_meeting_participants:admin` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `HEAVY`

`operationId`: `reportMeetingParticipants` · tags: `Reports` · seguridad: `openapi_authorization`

### Parámetros

- **meetingId** (`path`) `string` _requerido_ — The meeting's ID or universally unique ID (UUID). * If you provide a meeting ID, the API will return a response for the latest meeting instance. * If you provide a meeting UUID that begins with a `/` character or contains the `//` characters, you **must** double-encode the meeting UUID before making an API request.
- **page_size** (`query`) `integer` — The number of records returned within a single API call. · default: `30`
- **next_page_token** (`query`) `string` — Use the next page token to paginate through large result sets. A next page token is returned whenever the set of available results exceeds the current page size. This token's expiration period is 15 minutes.
- **include_fields** (`query`) `string` — Provide `registrant_id` as the value for this field if you would like to see the registrant ID attribute in the response of this API call. A registrant ID is a unique identifier of a [meeting registrant](/docs/api-reference/zoom-api/methods#operation/meetingRegistrants). · valores: `registrant_id`

### Respuestas

**`200`** — **HTTP Status Code:** `200` Meeting participants report returned. Only available for Paid or ZMP account: {accountId}.

- **next_page_token** `string` — The next page token is used to paginate through large result sets. A next page token will be returned whenever the set of available results exceeds the current page size. The expiration period for this token is 15 minutes.
- **page_count** `integer` — The number of pages returned for the request made.
- **page_size** `integer` — The number of records returned within a single API call. · default: `30`
- **total_records** `integer` — The number of all records available across pages.
- **participants** `object[]` — Array of meeting participant objects.
  - `array` de:
    - **customer_key** `string` — The participant's SDK identifier. This value can be alphanumeric, up to a maximum length of 35 characters.
    - **duration** `integer` — Participant duration, in seconds, calculated by subtracting the `leave_time` from the `join_time` for the `user_id`. If the participant leaves and rejoins the same meeting, they are assigned a different `user_id` and Zoom displays their new duration in a separate object. Because of this, the duration may not reflect the total time the user was in the meeting.
    - **failover** `boolean` — Indicates if failover happened during the meeting.
    - **id** `string` — The participant's universally unique ID (UUID). * If the participant joins the meeting by logging into Zoom, this value is the `id` value in the [**Get a user**](/docs/api-reference/zoom-api/methods#operation/user) API response. * If the participant joins the meeting **without** logging into Zoom, this returns an empty string value. **Note:** Use the `participant_user_id` value instead of this value. We will remove this response in a future release.
    - **join_time** `string` — Participant join time. · formato: `date-time`
    - **leave_time** `string` — Participant leave time. · formato: `date-time`
    - **name** `string` — Participant display name. This returns an empty string value if the account calling the API is a BAA account.
    - **registrant_id** `string` — Unique identifier of the registrant. This field is only returned if you entered &quot;registrant_id&quot; as the value of `include_fields` query parameter.
    - **status** `string` — The participant's status. * `in_meeting` - In a meeting. * `in_waiting_room` - In a waiting room. · valores: `in_meeting`, `in_waiting_room`
    - **user_email** `string` — Participant email. If the participant is **not** part of the host's account, this returns an empty string value, with some exceptions. See [Email address display rules](/docs/api-reference/using-zoom-apis#email-address) for details. This returns an empty string value if the account calling the API is a BAA account.
    - **user_id** `string` — Participant ID. This is a unique ID assigned to the participant joining a meeting and is valid for that meeting only.
    - **bo_mtg_id** `string` — The [breakout room](https://support.zoom.us/hc/en-us/articles/206476313-Managing-breakout-rooms) ID. Each breakout room is assigned a unique ID.
    - **participant_user_id** `string` — The participant's universally unique ID (UUID). * If the participant joins the meeting by logging into Zoom, this value is the `id` value in the [**Get a user**](/docs/api-reference/zoom-api/methods#operation/user) API response. * If the participant joins the meeting **without** logging into Zoom, this returns an empty string value.

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `1010` <br> User does not belong to this account:{accountId}.<br> <br> **Error Code:** `12702` <br> Can not access meeting a year ago.<br> <br> **Error Code:** `200` <br> No permission.<br> <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `3001` <br> Meeting {MeetingId} not found or has expired.<br> <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](/docs/api/rate-limits/).

---

## `GET /report/webinars/{webinarId}`

**Get webinar detail reports**

Retrieve a [report](https://support.zoom.us/hc/en-us/articles/201393719-Webinar-Reporting) containing past webinar details. **Prerequisites:** * Pro or higher plan with Webinar add-on. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `report:read:admin` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `report:read:webinar:admin` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `Heavy`

`operationId`: `reportWebinarDetails` · tags: `Reports` · seguridad: `openapi_authorization`

### Parámetros

- **webinarId** (`path`) `string` _requerido_ — The webinar's ID or universally unique ID (UUID). * If you provide a webinar ID, the API will return a response for the latest webinar instance. * If you provide a webinar UUID that begins with a `/` character or contains the `//` characters, you **must** [double encode](https://marketplace.zoom.us/docs/api-reference/using-zoom-apis/#meeting-id-and-uuid) the webinar UUID before making an API request.

### Respuestas

**`200`** — **HTTP Status Code:** `200` Webinar details returned. This is only available for paid account:{accountId}.

- **custom_keys** `object[]` — Custom keys and values assigned to the meeting.
  - `array` de:
    - **key** `string` — Custom key associated with the user.
    - **value** `string` — Value of the custom key associated with the user.
- **dept** `string` — Department of the host.
- **duration** `integer` — Meeting duration.
- **end_time** `string` — Meeting end time. · formato: `date-time`
- **id** `integer` — [Meeting ID](https://support.zoom.us/hc/en-us/articles/201362373-What-is-a-Meeting-ID-): Unique identifier of the meeting in &quot;**long**&quot; format(represented as int64 data type in JSON), also known as the meeting number. · formato: `int64`
- **participants_count** `integer` — Number of meeting participants.
- **start_time** `string` — Meeting start time. · formato: `date-time`
- **topic** `string` — Meeting topic.
- **total_minutes** `integer` — Number of Webinar minutes. This represents the total amount of Webinar minutes attended by each participant including the host, for a Webinar hosted by the user. For instance if there were one host(named A) and one participant(named B) in a Webinar, the value of total_minutes would be calculated as below: **total_minutes** = Total Webinar Attendance Minutes of A + Total Webinar Attendance Minutes of B
- **tracking_fields** `object[]` — Tracking fields.
  - `array` de:
    - **field** `string` — Tracking fields type.
    - **value** `string` — Tracking fields value.
- **type** `integer` — Meeting type.
- **user_email** `string` — User email.
- **user_name** `string` — User display name.
- **uuid** `string` — Webinar UUID. Each webinar instance will generate its own UUID(i.e., after a meeting ends, a new UUID will be generated when the next instance of the webinar starts). [double encode](https://marketplace.zoom.us/docs/api-reference/using-zoom-apis/#meeting-id-and-uuid) the UUID when using it for API calls if the UUID begins with a '/' or contains '//' in it.

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `1010` <br> User does not belong to this account:{accountId}.<br> **Error Code:** `12702` <br> Can not access a webinar a year ago.<br> **Error Code:** `200` <br> No permission.<br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `3001` <br> Meeting {meetingId} not found or has expired.<br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](https://developers.zoom.us/docs/api/rest/rate-limits/).

---

## `GET /report/webinars/{webinarId}/participants`

**Get webinar participant reports**

Get a detailed report on each webinar attendee. You can get webinar participant reports for the last 6 months. **Prerequisites:** * A Pro or a higher plan with Webinar add-on enabled. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `report:read:admin` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `report:read:list_webinar_participants:admin` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `HEAVY`

`operationId`: `reportWebinarParticipants` · tags: `Reports` · seguridad: `openapi_authorization`

### Parámetros

- **webinarId** (`path`) `string` _requerido_ — The webinar's ID or universally unique ID (UUID). * If you provide a webinar ID, the API will return a response for the latest webinar instance. * If you provide a webinar UUID that begins with a `/` character or contains the `//` characters, you **must** double-encode the webinar UUID before making an API request.
- **page_size** (`query`) `integer` — The number of records returned within a single API call. · default: `30`
- **next_page_token** (`query`) `string` — Use the next page token to paginate through large result sets. A next page token is returned whenever the set of available results exceeds the current page size. This token's expiration period is 15 minutes.
- **include_fields** (`query`) `string` — The additional query parameters to include. * `registrant_id` - Include the registrant's ID in the API response. The registrant ID is the webinar participant's unique ID. · valores: `registrant_id`

### Respuestas

**`200`** — **HTTP Status Code:** `200` * Meeting participants report returned. Only available for Paid or ZMP account: {accountId}.

- **next_page_token** `string` — Use the next page token to paginate through large result sets. A next page token is returned whenever the set of available results exceeds the current page size. This token's expiration period is 15 minutes.
- **page_count** `integer` — The number of pages returned for the request made.
- **page_size** `integer` — The number of records returned within a single API call. · default: `30`
- **total_records** `integer` — The number of all records available across pages.
- **participants** `object[]` — Information about the webinar participant.
  - `array` de:
    - **customer_key** `string` — The participant's SDK identifier. This value can be alphanumeric, up to a maximum length of 35 characters.
    - **duration** `integer` — Participant duration, in seconds, calculated by subtracting the `leave_time` from the `join_time` for the `user_id`. If the participant leaves and rejoins the same meeting, they will be assigned a different `user_id` and Zoom displays their new duration in a separate object. Note that because of this, the duration may not reflect the total time the user was in the meeting.
    - **failover** `boolean` — Whether failover occurred during the webinar.
    - **id** `string` — The participant's universally unique ID (UUID). * If the participant joins the meeting by logging into Zoom, this value is the `id` value in the [**Get a user**](/docs/api-reference/zoom-api/methods#operation/user) API response. * If the participant joins the meeting **without** logging into Zoom, this returns an empty string value. **Note:** Use the `participant_user_id` value instead of this value. We will remove this response in a future release.
    - **join_time** `string` — The participant's join time. · formato: `date-time`
    - **leave_time** `string` — The participant's leave time. · formato: `date-time`
    - **name** `string` — The participant's display name. This returns an empty string value if the account calling the API is a BAA account.
    - **registrant_id** `string` — The registrant's ID. This field only returns if you provide the `registrant_id` value for the `include_fields` query parameter.
    - **status** `string` — The participant's status. * `in_meeting` - In a meeting. * `in_waiting_room` - In a waiting room. · valores: `in_meeting`, `in_waiting_room`
    - **user_email** `string` — The participant's email address. If the participant is **not** part of the host's account, this returns an empty string value, with some exceptions. See [Email address display rules](/docs/api-reference/using-zoom-apis#email-address) for details. This returns an empty string value if the account calling the API is a BAA account.
    - **user_id** `string` — The participant's ID. This ID is assigned to the participant upon joining the webinar and is only valid for that webinar.
    - **participant_user_id** `string` — The participant's universally unique ID (UUID). * If the participant joins the meeting by logging into Zoom, this value is the `id` value in the [**Get a user**](/docs/api-reference/zoom-api/methods#operation/user) API response. * If the participant joins the meeting **without** logging into Zoom, this returns an empty string value.
    - **bo_mtg_id** `string` — The [breakout room](https://support.zoom.us/hc/en-us/articles/206476313-Managing-breakout-rooms) ID. Each breakout room is assigned a unique ID.

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `1010` <br> User does not belong to this account: {accountId} <br> **Error Code:** `12702` <br> Can not access a webinar a year ago.<br> <br> **Error Code:** `200` <br> No permission.<br> <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `3001` <br> Webinar "{webinarId}" not found or has expired <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](https://developers.zoom.us/docs/api/rest/rate-limits/).

---

## `GET /users/{userId}/webinars`

**List webinars**

List all the webinars scheduled by or on behalf a webinar host. For user-level apps, pass [the `me` value](https://developers.zoom.us/docs/api/rest/using-zoom-apis/#the-me-keyword) instead of the `userId` parameter. Zoom users with a [webinar plan](https://zoom.us/webinar) have access to creating and managing webinars. Webinars let a host broadcast a Zoom meeting to up to 10,000 attendees. **Note** This API only returns a user's [unexpired webinars](https://support.zoom.us/hc/en-us/articles/201362373-Meeting-ID#h_c73f9b08-c1c0-4a1a-b538-e01ebb98e844). **Prerequisites** * A Pro or higher plan with the webinar add-on. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:read` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:list_webinars`,`webinar:read:list_webinars:admin` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `MEDIUM`

`operationId`: `webinars` · tags: `Webinars` · seguridad: `openapi_authorization`

### Parámetros

- **userId** (`path`) `string` _requerido_ — The user's user ID or email address. For user-level apps, pass the `me` value.
- **type** (`query`) `string` — The type of webinar. * `scheduled` - All valid previous (unexpired) webinars, live webinars, and upcoming scheduled webinars. * `upcoming` - All upcoming webinars, including live webinars. · valores: `scheduled`, `upcoming` · default: `scheduled`
- **page_size** (`query`) `integer` — The number of records returned within a single API call. · default: `30`
- **page_number** (`query`) `integer` — **Deprecated** We will no longer support this field in a future release. Instead, use the `next_page_token` for pagination. · default: `1`
- **include_events_webinar** (`query`) `boolean` — Include Zoom events webinar in searches. The default is `true`.

### Respuestas

**`200`** — **HTTP Status Code:** `200` List of webinar objects returned.

- **next_page_token** `string` — Use the next page token to paginate through large result sets. A next page token is returned whenever the set of available results exceeds the current page size. This token's expiration period is 15 minutes.
- **page_count** `integer` — The number of pages returned for the request made.
- **page_number** `integer` — **Deprecated** We will no longer support this field in a future release. Instead, use the `next_page_token` for pagination. · default: `1`
- **page_size** `integer` — The number of records returned with a single API call. · default: `30`
- **total_records** `integer` — The total number of all the records available across pages.
- **webinars** `object[]` — List of webinar objects.
  - `array` de:
    - **agenda** `string` — Webinar description. The agenda length gets truncated to 250 characters when you list all webinars for a user. To view the complete agenda, retrieve details for a single webinar, use the [**Get a webinar**](/docs/api-reference/zoom-api/methods#operation/webinar) API.
    - **created_at** `string` — The webinar's creation time. · formato: `date-time`
    - **duration** `integer` — The webinar's duration, in minutes.
    - **host_id** `string` — The host's ID.
    - **id** `integer` — The webinar ID. · formato: `int64`
    - **join_url** `string` — The URL to join the webinar.
    - **start_time** `string` — The webinar's start time. · formato: `date-time`
    - **timezone** `string` — The webinar's [timezone](https://developers.zoom.us/docs/api/rest/other-references/abbreviation-lists/#timezones).
    - **topic** `string` — The webinar's topic.
    - **type** `integer` — The webinar type. * `5` - A webinar. * `6` - A recurring webinar without a fixed time. * `9` - A recurring webinar with a fixed time. · valores: `5`, `6`, `9` · default: `5`
    - **uuid** `string` — The webinar's universally unique identifier (UUID). Each webinar instance generates a webinar UUID.
    - **is_simulive** `boolean` — Whether the webinar is `simulive`.
    - **is_events_webinar** `boolean` — The webinar is created from zoom events

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `200` <br> No permission. <br> **Error Code:** `200` <br> Webinar plan is missing. You must subscribe to the webinar plan and enable webinars for this user in order to perform this action. <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `1001` <br> User does not exist: {userId}. <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](https://developers.zoom.us/docs/api/rest/rate-limits/).

---

## `POST /users/{userId}/webinars`

**Create a webinar**

Schedule a webinar for a user who is a webinar host. For user-level apps, pass [the `me` value](/docs/api/using-zoom-apis/#the-me-keyword) instead of the `userId` parameter. Webinars allow a host to broadcast a Zoom meeting to up to 10,000 attendees. **Rate limit** Up to a maximum of **100 requests per day**. The rate limit is applied to the `userId` of the **webinar host** used to make the request. **Prerequisites** * A Pro or higher plan with a [Webinar plan](https://zoom.us/webinar) add-on. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:write`,`webinar:write:admin` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:write:webinar`,`webinar:write:webinar:admin` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `LIGHT`

`operationId`: `webinarCreate` · tags: `Webinars` · seguridad: `openapi_authorization`

### Parámetros

- **userId** (`path`) `string` _requerido_ — The user ID or email address of the user. For user-level apps, pass the `me` value.

### Request body — `application/json`

- **agenda** `string` — Webinar description.
- **duration** `integer` — Webinar duration, in minutes. Used for scheduled webinars only.
- **password** `string` — The webinar passcode. By default, it can be up to 10 characters in length and may contain alphanumeric characters as well as special characters like !, @, #, and others. **Note** - If the account owner or administrator has configured [Passcode Requirement](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0063160#h_a427384b-e383-4f80-864d-794bf0a37604), the passcode **must** meet those requirements. You can retrieve the requirements using the [**Get user settings**](/docs/api/users/#tag/users/GET/users/{userId}/settings) API or the [**Get account settings**](/docs/api/accounts/#tag/accounts/GET/accounts/{accountId}/settings) API. - If the **Passcode** user setting is enabled and `default_passcode` is not explicitly set to `false`, a passcode will be automatically generated when one is not provided. - If the **Passcode** setting is enabled and [locked](https://support.zoom.us/hc/en-us/articles/115005269866-Using-Tiered-Settings#locked) for the user, a passcode will be automatically generated when one is not provided.
- **default_passcode** `boolean` — Determines whether to automatically generate a passcode for the webinar when no passcode is provided and the user's **Passcode** setting is enabled. Defaults to `true`. When set to `false`, webinars will only have a passcode if one is explicitly provided. · default: `True`
- **recurrence** `object` — Recurrence object. Use this object only for a webinar of type `9`, a recurring webinar with fixed time.
  - **end_date_time** `string` — Select a date when the webinar will recur before it is canceled. Should be in UTC time, such as `2017-11-25T12:00:00Z`. Cannot be used with `end_times`. · formato: `date-time`
  - **end_times** `integer` — Select how many times the webinar will recur before it is canceled. The maximum number of recurring is 60. Cannot be used with `end_date_time`. · default: `1`
  - **monthly_day** `integer` — Use this field **only if you're scheduling a recurring webinar of type `3`** to state which day in a month the webinar should recur. The value range is from 1 to 31. For instance, if you would like the webinar to recur on 23rd of each month, provide `23` as the value of this field and `1` as the value of the `repeat_interval` field. Instead, if you would like the webinar to recur once every three months, on 23rd of the month, change the value of the `repeat_interval` field to `3`.
  - **monthly_week** `integer` — Use this field **only if you're scheduling a recurring webinar of type `3`** to state the week of the month when the webinar should recur. If you use this field, **you must also use the `monthly_week_day` field to state the day of the week when the webinar should recur.** `-1` - Last week of the month. `1` - First week of the month. `2` - Second week of the month. `3` - Third week of the month. `4` - Fourth week of the month. · valores: `-1`, `1`, `2`, `3`, `4`
  - **monthly_week_day** `integer` — Use this field **only if you're scheduling a recurring webinar of type `3`** to state a specific day in a week when the monthly webinar should recur. To use this field, you must also use the `monthly_week` field. `1` - Sunday. `2` - Monday. `3` - Tuesday. `4` - Wednesday. `5` - Thursday. `6` - Friday. `7` - Saturday. · valores: `1`, `2`, `3`, `4`, `5`, `6`, `7`
  - **repeat_interval** `integer` — Define the interval when the webinar should recur. For instance, to schedule a webinar that recurs every two months, you must set the value of this field as `2` and the value of the `type` parameter as `3`. For a daily webinar, the maximum interval you can set is `90` days. For a weekly webinar, the maximum interval that you can set is `12` weeks. For a monthly webinar, the maximum interval that you can set is `3` months.
  - **type** `integer` _requerido_ — Recurrence webinar types. `1` - Daily. `2` - Weekly. `3` - Monthly. · valores: `1`, `2`, `3`
  - **weekly_days** `string` — Use this field **only if you're scheduling a recurring webinar of type** `2` to state which day(s) of the week the webinar should repeat. The value for this field could be a number between `1` to `7` in string format. For instance, if the webinar should recur on Sunday, provide `1` as the value of this field. **Note:** If you would like the webinar to occur on multiple days of a week, you should provide comma separated values for this field. For instance, if the webinar should recur on Sundays and Tuesdays, provide `1,3` as the value of this field. `1` - Sunday. `2` - Monday. `3` - Tuesday. `4` - Wednesday. `5` - Thursday. `6` - Friday. `7` - Saturday.
- **schedule_for** `string` — The email address or user ID of the user to schedule a webinar for.
- **settings** `object` — Create webinar settings.
  - **additional_data_center_regions** `string[]` — Add additional webinar [data center regions](https://support.zoom.us/hc/en-us/articles/360042411451-Selecting-data-center-regions-for-hosted-meetings-and-webinars). Provide this value as an array of [country codes](/docs/api/references/abbreviations/#countries) for the countries available as data center regions in the [**Account Profile**](https://zoom.us/account/setting) interface but have been opted out of in the [user settings](https://zoom.us/profile). For example, the data center regions selected in your [**Account Profile**](https://zoom.us/account) are `Europe`, `Hong Kong SAR`, `Australia`, `India`, `Japan`, `China`, `United States`, and `Canada`. However, in the [**My Profile**](https://zoom.us/profile) settings, you did **not** select `India` and `Japan` for meeting and webinar traffic routing. To include `India` and `Japan` as additional data centers, use the `[IN, TY]` value for this field.
    - `array` de:
  - **allow_multiple_devices** `boolean` — Allow attendees to join from multiple devices.
  - **alternative_hosts** `string` — Alternative host emails or IDs. Multiple values separated by comma.
  - **alternative_host_update_polls** `boolean` — Whether the **Allow alternative hosts to add or edit polls** feature is enabled. This requires Zoom version 5.8.0 or higher.
  - **approval_type** `integer` — The default value is `2`. To enable registration required, set the approval type to `0` or `1`. Values include: `0` - Automatically approve. `1` - Manually approve. `2` - No registration required. · valores: `0`, `1`, `2` · default: `2`
  - **attendees_and_panelists_reminder_email_notification** `object` — Send reminder email to attendees and panelists.
    - **enable** `boolean` — * `true` - Send reminder email to attendees and panelists. * `false` - Do not send reminder email to attendees and panelists.
    - **type** `integer` — `0` - No plan. `1` - Send 1 hour before webinar. `2` - Send 1 day before webinar. `3` - Send 1 hour and 1 day before webinar. `4` - Send 1 week before webinar. `5` - Send 1 hour and 1 week before webinar. `6` - Send 1 day and 1 week before webinar. `7` - Send 1 hour, 1 day and 1 week before webinar. · valores: `0`, `1`, `2`, `3`, `4`, `5`, `6`, `7`
  - **audio** `string` — Determine how participants can join the audio portion of the meeting.(Not supported for simulive webinar.) · valores: `both`, `telephony`, `voip`, `thirdParty` · default: `both`
  - **audio_conference_info** `string` — Third party audio conference information.
  - **authentication_domains** `string` — Meeting authentication domains. This option allows you to specify the rule so that Zoom users whose email address contains a certain domain can join the webinar. You can either provide multiple comma-separated domains, use a wildcard for listing domains, or use both methods.
  - **authentication_option** `string` — Specify the authentication type for users to join a webinar with `meeting_authentication` setting set to `true`. The value of this field can be retrieved from the `id` field within `authentication_options` array in the response of [**Get user settings**](/docs/api/rest/reference/zoom-api/methods#operation/userSettings) API.
  - **auto_recording** `string` — Automatic recording. Not supported for simulive webinar. `local` - Record on local. `cloud` - Record on cloud. `none` - Disabled. · valores: `local`, `cloud`, `none` · default: `none`
  - **close_registration** `boolean` — Close registration after event date.
  - **contact_email** `string` — Contact email for registration
  - **contact_name** `string` — Contact name for registration
  - **email_language** `string` — Set the email language. `en-US`,`de-DE`,`es-ES`,`fr-FR`,`id-ID`,`jp-JP`,`nl-NL`,`pl-PL`,`pt-PT`,`ru-RU`,`tr-TR`,`zh-CN`, `zh-TW`, `ko-KO`, `it-IT`, `vi-VN`.
  - **enforce_login** `boolean` — Only signed-in users can join this meeting. **This field is deprecated and will not be supported in future.** Instead of this field, use the `meeting_authentication`, `authentication_option`, or `authentication_domains` fields to establish the authentication mechanism for this Webinar.
  - **enforce_login_domains** `string` — Only signed-in users with specified domains can join meetings. **This field is deprecated and will not be supported in future.** Instead of this field, use the `authentication_domains` field for this webinar.
  - **follow_up_absentees_email_notification** `object` — Send follow-up email to absentees.
    - **enable** `boolean` — * `true` - Send follow-up email to absentees. * `false` - Do not send follow-up email to absentees.
    - **type** `integer` — `0` - No plan. `1` - Send 1 days after the scheduled end date. `2` - Send 2 days after the scheduled end date. `3` - Send 3 days after the scheduled end date. `4` - Send 4 days after the scheduled end date. `5` - Send 5 days after the scheduled end date. `6` - Send 6 days after the scheduled end date. `7` - Send 7 days after the scheduled end date. · valores: `0`, `1`, `2`, `3`, `4`, `5`, `6`, `7`
  - **follow_up_attendees_email_notification** `object` — Send follow-up email to attendees.
    - **enable** `boolean` — * `true`: Send follow-up email to attendees. * `false`: Do not send follow-up email to attendees.
    - **type** `integer` — `0` - No plan. `1` - Send 1 day after the scheduled end date. `2` - Send 2 days after the scheduled end date. `3` - Send 3 days after the scheduled end date. `4` - Send 4 days after the scheduled end date. `5` - Send 5 days after the scheduled end date. `6` - Send 6 days after the scheduled end date. `7` - Send 7 days after the scheduled end date. · valores: `0`, `1`, `2`, `3`, `4`, `5`, `6`, `7`
  - **global_dial_in_countries** `string[]` — List of global dial-in countries
    - `array` de:
  - **hd_video** `boolean` — Default to HD video. Not supported for simulive webinar. · default: `False`
  - **hd_video_for_attendees** `boolean` — Whether HD video for attendees is enabled. This value defaults to `false`. Not supported for simulive webinar. · default: `False`
  - **host_video** `boolean` — Start video when host joins webinar. Not supported for simulive webinar.
  - **language_interpretation** `object` — The webinar's [language interpretation settings](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0064768). Make sure to add the language in the web portal in order to use it in the API. See link for details. **Note:** This feature is only available for certain Webinar add-on, Education, and Business and higher plans. If this feature is not enabled on the host's account, this setting will **not** be applied to the webinar. This is not supported for simulive webinars.
    - **enable** `boolean` — Whether to enable [language interpretation](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0064768) for the webinar. If not provided, the default value will be based on the user's setting.
    - **interpreters** `object[]` — Information about the webinar's language interpreters.
      - `array` de:
        - **email** `string` — The interpreter's email address. · formato: `email`
        - **languages** `string` — A comma-separated list of the interpreter's languages. The string must contain exactly two country IDs. Only system-supported languages are allowed: `US` (English), `CN` (Chinese), `JP` (Japanese), `DE` (German), `FR` (French), `RU` (Russian), `PT` (Portuguese), `ES` (Spanish), and `KR` (Korean). For example, to set an interpreter translating from English to Chinese, use `US,CN`.
        - **interpreter_languages** `string` — A comma-separated list of the interpreter's languages. The string must contain exactly two languages. To get this value, use the `language_interpretation` object's `languages` and `custom_languages` values in the [**Get user settings**](/docs/api/users/#tag/users/GET/users/{userId}/settings) API response. **languages**: System-supported languages include `English`, `Chinese`, `Japanese`, `German`, `French`, `Russian`, `Portuguese`, `Spanish`, and `Korean`. **custom_languages**: User-defined languages added by the user. For example, an interpreter translating between English and French should use `English,French`.
  - **sign_language_interpretation** `object` — The webinar's [sign language interpretation settings](https://support.zoom.us/hc/en-us/articles/9644962487309-Using-sign-language-interpretation-in-a-meeting-or-webinar). Make sure to add the language in the web portal in order to use it in the API. See link for details. **Note:** If this feature is not enabled on the host's account, this setting will **not** be applied to the webinar.
    - **enable** `boolean` — Whether to enable [sign language interpretation](https://support.zoom.us/hc/en-us/articles/9644962487309-Using-sign-language-interpretation-in-a-meeting-or-webinar) for the webinar. If not provided, the default value will be based on the user's setting.
    - **interpreters** `object[]` — Information about the webinar's sign language interpreters.
      - `array` de:
        - **email** `string` — The interpreter's email address. · formato: `email`
        - **sign_language** `string` — The interpreter's sign language. To get this value, use the `sign_language_interpretation` object's `languages` and `custom_languages` values in the [**Get user settings**](/docs/api/rest/reference/zoom-api/methods#operation/userSettings) API response.
  - **panelist_authentication** `boolean` — Require panelists to authenticate to join. If not provided, the default value will be based on the user's setting.
  - **meeting_authentication** `boolean` — Only [authenticated](https://support.zoom.us/hc/en-us/articles/360037117472-Authentication-Profiles-for-Meetings-and-Webinars) users can join meeting if the value of this field is set to `true`.
  - **add_watermark** `boolean` — Add watermark that identifies the viewing participant. Not supported for simulive webinar. If not provided, the default value will be based on the user's setting.
  - **add_audio_watermark** `boolean` — Add audio watermark that identifies the participants. Not supported for simulive webinar. If not provided, the default value will be based on the user's setting.
  - **on_demand** `boolean` — Make the webinar on-demand. Not supported for simulive webinar. · default: `False`
  - **panelists_invitation_email_notification** `boolean` — Send invitation email to panelists. If `false`, do not send invitation email to panelists.
  - **panelists_video** `boolean` — Start video when panelists join webinar. Not supported for simulive webinar.
  - **post_webinar_survey** `boolean` — Zoom will open a survey page in attendees' browsers after leaving the webinar
  - **practice_session** `boolean` — Enable practice session. · default: `False`
  - **question_and_answer** `object` — [Q&amp;A](https://support.zoom.us/hc/en-us/articles/203686015-Using-Q-A-as-the-webinar-host#:~:text=Overview,and%20upvote%20each%20other's%20questions.) for webinar.
    - **allow_submit_questions** `boolean` — * `true` - Allow participants to submit questions. * `false` - Do not allow submit questions.
    - **allow_anonymous_questions** `boolean` — * `true` - Allow participants to send questions without providing their name to the host, co-host, and panelists.. * `false` - Do not allow anonymous questions.(Not supported for simulive webinar.)
    - **answer_questions** `string` — Indicate whether you want attendees to be able to view answered questions only or view all questions. * `only` - Attendees are able to view answered questions only. * `all` - Attendees are able to view all questions submitted in the Q&amp;A. · valores: `only`, `all`
    - **attendees_can_comment** `boolean` — * `true` - Attendees can answer questions or leave a comment in the question thread. * `false` - Attendees can not answer questions or leave a comment in the question thread
    - **attendees_can_upvote** `boolean` — * `true` - Attendees can click the thumbs up button to bring popular questions to the top of the Q&amp;A window. * `false` - Attendees can not click the thumbs up button on questions.
    - **allow_auto_reply** `boolean` — If simulive webinar, * `true` - allow auto-reply to attendees. * `false` - don't allow auto-reply to the attendees.
    - **auto_reply_text** `string` — If `allow_auto_reply` = true, the text to be included in the automatic response.
    - **enable** `boolean` — * `true` - Enable [Q&amp;A](https://support.zoom.us/hc/en-us/articles/203686015-Using-Q-A-as-the-webinar-host#:~:text=Overview,and%20upvote%20each%20other's%20questions.) for webinar. * `false` - Disable Q&amp;A for webinar. If not provided, the default value will be based on the user's setting.
  - **registrants_confirmation_email** `boolean` — Send confirmation email to registrants.
  - **registrants_email_notification** `boolean` — Send email notifications to registrants about approval, cancellation, denial of the registration. The value of this field must be set to true in order to use the `registrants_confirmation_email` field.
  - **registrants_restrict_number** `integer` — Restrict number of registrants for a webinar. By default, it is set to `0`. A `0` value means that the restriction option is disabled. Provide a number higher than 0 to restrict the webinar registrants by the that number. · default: `0`
  - **registration_type** `integer` — Registration types. Only used for recurring webinars with a fixed time. `1` - Attendees register once and can attend any of the webinar sessions. `2` - Attendees need to register for each session in order to attend. `3` - Attendees register once and can choose one or more sessions to attend. · valores: `1`, `2`, `3` · default: `1`
  - **send_1080p_video_to_attendees** `boolean` — Whether to always send 1080p video to attendees. This value defaults to `false`.(Not supported for simulive webinar.) · default: `False`
  - **show_share_button** `boolean` — Show social share buttons on the registration page.
  - **show_join_info** `boolean` — Whether to show the webinar's join information on the registration confirmation page. This setting is only applied to webinars with registration enabled.
  - **survey_url** `string` — Survey URL for post webinar survey.
  - **enable_session_branding** `boolean` — Whether the **Webinar Session Branding** setting is enabled. This setting lets hosts visually customize a webinar by setting a session background. This also lets hosts set Virtual Background and apply name tags to hosts, alternative hosts, panelists, interpreters, and speakers.
  - **request_permission_to_unmute_participants** `boolean` — Whether to enable the [**Request permission to unmute participants**](https://support.zoom.us/hc/en-us/articles/203435537-Muting-and-unmuting-participants-in-a-meeting) setting. Not supported for simulive webinar. This option cannot be used together with `allow_host_control_participant_mute_state`, only one of the two can be enabled at a time. · default: `False`
  - **allow_host_control_participant_mute_state** `boolean` — Whether to allow the host and cohosts to fully control the mute state of participants. Not supported for simulive webinar. If not provided, the default value will be based on the user's setting. This option cannot be used together with `request_permission_to_unmute_participants`, only one of the two can be enabled at a time.
  - **email_in_attendee_report** `boolean` — Whether to include guest's email addresses in webinars' attendee reports.
- **start_time** `string` — Webinar start time. We support two formats for `start_time` - local time and GMT. To set time as GMT the format should be `yyyy-MM-dd`T`HH:mm:ssZ`. To set time using a specific timezone, use `yyyy-MM-dd`T`HH:mm:ss` format and specify the timezone [ID](/docs/api/references/abbreviations/#timezones) in the `timezone` field OR leave it blank and the timezone set on your Zoom account will be used. You can also set the time as UTC as the timezone field. The `start_time` should only be used for scheduled and / or recurring webinars with fixed time. · formato: `date-time`
- **template_id** `string` — The webinar template ID to schedule a webinar using a [webinar template](https://support.zoom.us/hc/en-us/articles/115001079746-Webinar-Templates) or a [admin webinar template](https://support.zoom.us/hc/en-us/articles/8137753618957-Configuring-admin-webinar-templates). For a list of webinar templates, use the [**List webinar templates**](/docs/api/rest/reference/zoom-api/methods#operation/listWebinarTemplates) API.
- **timezone** `string` — The timezone to assign to the `start_time` value. This field is only used for scheduled or recurring webinars with a fixed time. For a list of supported timezones and their formats, see our [timezone list](/docs/api/references/abbreviations/#timezones).
- **topic** `string` — The webinar's topic.
- **tracking_fields** `object[]` — Tracking fields.
  - `array` de:
    - **field** `string` _requerido_ — Tracking fields type.
    - **value** `string` — Tracking fields value.
- **type** `integer` — Webinar types. `5` - Webinar. `6` - Recurring webinar with no fixed time. `9` - Recurring webinar with a fixed time. · valores: `5`, `6`, `9` · default: `5`
- **is_simulive** `boolean` — Whether to set the webinar to simulive.
- **record_file_id** `string` — The previously recorded file's ID for `simulive`.
- **transition_to_live** `boolean` — Whether to transition a simulive webinar to live. The host must be present at the time of transition.
- **simulive_delay_start** `object` — {"enable":false,"time":0,"timeunit":"second"}
  - **enable** `boolean` — Whether simulive need delay playback.
  - **time** `integer` — The time for delayed playback If the time unit is seconds, then the maximum value is 60 and the minimum value is 1. If the time unit is minutes, then the maximum value is 10 and the minimum value is 1.
  - **timeunit** `string` — The time unit for delayed playback `second` - The time unit for delayed playback is seconds. `minute` - The time unit for delayed playback is minutes. · valores: `second`, `minute` · default: `second`

### Respuestas

**`201`** — **HTTP Status Code:** `201` Webinar created.

- **host_email** `string` — Email address of the meeting host. · formato: `email`
- **host_id** `string` — ID of the user set as host of the webinar.
- **id** `integer` — Webinar ID in **long** format, represented as int64 data type in JSON. Also known as the webinar number. · formato: `int64`
- **template_id** `string` — The webinar template's unique identifier. Use this field only if you would like to [schedule the webinar using an existing template](https://support.zoom.us/hc/en-us/articles/115001079746-Webinar-Templates#schedule). The value of this field can be retrieved from [**List webinar templates**](/docs/api/rest/reference/zoom-api/methods#operation/listWebinarTemplates) API. You must provide the user ID of the host instead of the email address in the `userId` path parameter in order to use a template for scheduling a Webinar.
- **uuid** `string` — A webinar's unique identifier. Each webinar instance will generate its own UUID. Ror example, after a webinar ends, a new UUID is generated for the next instance of the webinar. Once a webinar ends, the value of the UUID for the same webinar will be different from when it was scheduled.
- **agenda** `string` — The webinar's agenda.
- **created_at** `string` — Creation time. · formato: `date-time`
- **duration** `integer` — The webinar's duration.
- **registration_url** `string` — The URL that registrants can use to register for a webinar. This field is only returned for webinars that have enabled registration.
- **join_url** `string` — URL to join the webinar. Only share this URL with the users who should be invited to the webinar.
- **occurrences** `object[]` — Array of occurrence objects.
  - `array` de:
    - **duration** `integer` — Duration.
    - **occurrence_id** `string` — Occurrence ID: a unique identifier that identifies an occurrence of a recurring webinar. [Recurring webinars](https://support.zoom.us/hc/en-us/articles/216354763-How-to-Schedule-A-Recurring-Webinar) can have a maximum of 50 occurrences.
    - **start_time** `string` — Start time. · formato: `date-time`
    - **status** `string` — Occurrence status. `available` - Available occurrence. `deleted` - Deleted occurrence. · valores: `available`, `deleted`
- **password** `string` — The webinar passcode. By default, it can be up to 10 characters in length and may contain alphanumeric characters as well as special characters such as !, @, #, etc.
- **encrypted_passcode** `string` — Encrypted passcode for third party endpoints (H323/SIP).
- **h323_passcode** `string` — H.323/SIP room system passcode.
- **recurrence** `object` — Recurrence object. Use this object only for a webinar of type `9` i.e., a recurring webinar with fixed time.
  - **end_date_time** `string` — A date when the webinar will recur before it is canceled. Should be in UTC time, such as 2017-11-25T12:00:00Z. Can't be used with `end_times`. · formato: `date-time`
  - **end_times** `integer` — How many times the webinar will recur before it is canceled. The maximum number of recurring is 60. Can't be used with `end_date_time`. · default: `1`
  - **monthly_day** `integer` — Use this field **only if you're scheduling a recurring webinar of type** `3` to state which day in a month the webinar should recur. The value range is from 1 to 31. For instance, if you would like the webinar to recur on 23rd of each month, provide `23` as the value of this field and `1` as the value of the `repeat_interval` field. Instead, if you would like the webinar to recur once every three months, on 23rd of the month, change the value of the `repeat_interval` field to `3`.
  - **monthly_week** `integer` — Use this field **only if you're scheduling a recurring webinar of type** `3` to state the week of the month when the webinar should recur. If you use this field, **you must also use the `monthly_week_day` field to state the day of the week when the webinar should recur.** `-1` - Last week of the month. `1` - First week of the month. `2` - Second week of the month. `3` - Third week of the month. `4` - Fourth week of the month. · valores: `-1`, `1`, `2`, `3`, `4`
  - **monthly_week_day** `integer` — Use this field **only if you're scheduling a recurring webinar of type** `3` to state a specific day in a week when the monthly webinar should recur. To use this field, you must also use the `monthly_week` field. `1` - Sunday. `2` - Monday. `3` - Tuesday. `4` - Wednesday. `5` - Thursday. `6` - Friday. `7` - Saturday. · valores: `1`, `2`, `3`, `4`, `5`, `6`, `7`
  - **repeat_interval** `integer` — Define the interval when the webinar should recur. For instance, if you would like to schedule a Webinar that recurs every two months, you must set the value of this field as `2` and the value of the `type` parameter as `3`. For a daily webinar, the maximum interval you can set is `90` days. For a weekly webinar, the maximum interval that you can set is `12` weeks. For a monthly webinar, the maximum interval that you can set is `3` months.
  - **type** `integer` _requerido_ — Recurrence webinar types. `1` - Daily. `2` - Weekly. `3` - Monthly. · valores: `1`, `2`, `3`
  - **weekly_days** `string` — Use this field **only if you're scheduling a recurring webinar of type** `2` to state which day(s) of the week the webinar should repeat. The value for this field could be a number between `1` to `7` in string format. For instance, if the Webinar should recur on Sunday, provide `1` as the value of this field. **Note:** If you would like the webinar to occur on multiple days of a week, you should provide comma separated values for this field. For instance, if the webinar should recur on Sundays and Tuesdays, provide `1,3` as the value of this field. `1` - Sunday. `2` - Monday. `3` - Tuesday. `4` - Wednesday. `5` - Thursday. `6` - Friday. `7` - Saturday.
- **settings** `object` — Webinar settings.
  - **additional_data_center_regions** `string[]` — Add additional webinar [data center regions](https://support.zoom.us/hc/en-us/articles/360042411451-Selecting-data-center-regions-for-hosted-meetings-and-webinars). Provide this value as an array of [country codes](/docs/api/references/abbreviations/#countries) for the countries available as data center regions in the [**Account Profile**](https://zoom.us/account/setting) interface but have been opted out of in the [user settings](https://zoom.us/profile). For example, the data center regions selected in your [**Account Profile**](https://zoom.us/account) are `Europe`, `Hong Kong SAR`, `Australia`, `India`, `Japan`, `China`, `United States`, and `Canada`. However, in the [**My Profile**](https://zoom.us/profile) settings, you did **not** select `India` and `Japan` for meeting and webinar traffic routing. To include `India` and `Japan` as additional data centers, use the `[IN, TY]` value for this field.
    - `array` de:
  - **allow_multiple_devices** `boolean` — Allow attendees to join from multiple devices.
  - **alternative_hosts** `string` — Alternative host emails or IDs. Multiple values separated by comma.
  - **alternative_host_update_polls** `boolean` — Whether the **Allow alternative hosts to add or edit polls** feature is enabled. This requires Zoom version 5.8.0 or higher.
  - **approval_type** `integer` — `0` - Automatically approve. `1` - Manually approve. `2` - No registration required. · valores: `0`, `1`, `2` · default: `2`
  - **attendees_and_panelists_reminder_email_notification** `object` — Send reminder email to attendees and panelists.
    - **enable** `boolean` — * `true` - Send reminder email to attendees and panelists. * `false` - Do not send reminder email to attendees and panelists.
    - **type** `integer` — `0` - No plan. `1` - Send 1 hour before webinar. `2` - Send 1 day before webinar. `3` - Send 1 hour and 1 day before webinar. `4` - Send 1 week before webinar. `5` - Send 1 hour and 1 week before webinar. `6` - Send 1 day and 1 week before webinar. `7` - Send 1 hour, 1 day and 1 week before webinar. · valores: `0`, `1`, `2`, `3`, `4`, `5`, `6`, `7`
  - **audio** `string` — Determine how participants can join the audio portion of the webinar. · valores: `both`, `telephony`, `voip`, `thirdParty` · default: `both`
  - **audio_conference_info** `string` — Third party audio conference info.
  - **authentication_domains** `string` — If user has configured [**Sign Into Zoom with Specified Domains**](https://support.zoom.us/hc/en-us/articles/360037117472-Authentication-Profiles-for-Meetings-and-Webinars#h_5c0df2e1-cfd2-469f-bb4a-c77d7c0cca6f) option, this will list the domains that are authenticated.
  - **authentication_name** `string` — Authentication name set in the [authentication profile](https://support.zoom.us/hc/en-us/articles/360037117472-Authentication-Profiles-for-Meetings-and-Webinars#h_5c0df2e1-cfd2-469f-bb4a-c77d7c0cca6f).
  - **authentication_option** `string` — Webinar authentication option ID.
  - **auto_recording** `string` — Automatic recording. `local` - Record on local. `cloud` - Record on cloud. `none` - Disabled. · valores: `local`, `cloud`, `none` · default: `none`
  - **close_registration** `boolean` — Close registration after event date.
  - **contact_email** `string` — Contact email for registration
  - **contact_name** `string` — Contact name for registration
  - **email_language** `string` — Set the email language. `en-US`,`de-DE`,`es-ES`,`fr-FR`,`jp-JP`,`pt-PT`,`ru-RU`,`zh-CN`, `zh-TW`, `ko-KO`, `it-IT`, `vi-VN`.
  - **enforce_login** `boolean` — Only signed in users can join this meeting. **This field is deprecated and will not be supported in the future.** As an alternative, use the `meeting_authentication`, `authentication_option` and `authentication_domains` fields to understand the [authentication configurations](https://support.zoom.us/hc/en-us/articles/360037117472-Authentication-Profiles-for-Meetings-and-Webinars) set for the webinar.
  - **enforce_login_domains** `string` — Only signed in users with specified domains can join meetings. **This field is deprecated and will not be supported in the future.** As an alternative, use the `meeting_authentication`, `authentication_option` and `authentication_domains` fields to understand the [authentication configurations](https://support.zoom.us/hc/en-us/articles/360037117472-Authentication-Profiles-for-Meetings-and-Webinars) set for the webinar.
  - **follow_up_absentees_email_notification** `object` — Send follow-up email to absentees.
    - **enable** `boolean` — * `true` - Send follow-up email to absentees. * `false` - Do not send follow-up email to absentees.
    - **type** `integer` — `0` - No plan. `1` - Send 1 days after the scheduled end date. `2` - Send 2 days after the scheduled end date. `3` - Send 3 days after the scheduled end date. `4` - Send 4 days after the scheduled end date. `5` - Send 5 days after the scheduled end date. `6` - Send 6 days after the scheduled end date. `7` - Send 7 days after the scheduled end date. · valores: `0`, `1`, `2`, `3`, `4`, `5`, `6`, `7`
  - **follow_up_attendees_email_notification** `object` — Send follow-up email to attendees.
    - **enable** `boolean` — * `true` - Send follow-up email to attendees. * `false` - Do not send follow-up email to attendees.
    - **type** `integer` — `0` - No plan. `1` - Send 1 day after the scheduled end date. `2` - Send 2 days after the scheduled end date. `3` - Send 3 days after the scheduled end date. `4` - Send 4 days after the scheduled end date. `5` - Send 5 days after the scheduled end date. `6` - Send 6 days after the scheduled end date. `7` - Send 7 days after the scheduled end date. · valores: `0`, `1`, `2`, `3`, `4`, `5`, `6`, `7`
  - **global_dial_in_countries** `string[]` — List of global dial-in countries
    - `array` de:
  - **global_dial_in_numbers** `object[]` — A list of available dial-in numbers for different countries or regions.
    - `array` de:
      - **city** `string` — City of the number.
      - **country** `string` — The country code.
      - **country_name** `string` — Full name of country.
      - **number** `string` — Dial-in phone number.
      - **type** `string` — Dial-in number type. · valores: `toll`, `tollfree`, `premium`
  - **hd_video** `boolean` — Default to HD video. · default: `False`
  - **hd_video_for_attendees** `boolean` — Whether HD video for attendees is enabled. · default: `False`
  - **host_video** `boolean` — Start video when host joins webinar.
  - **language_interpretation** `object` — The webinar's [language interpretation settings](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0064768). Make sure to add the language in the web portal in order to use it in the API. See link for details. **Note:** This feature is only available for certain Webinar add-on, Education, and Business and higher plans. If this feature is not enabled on the host's account, this setting will **not** be applied to the webinar. This is not supported for simulive webinars.
    - **enable** `boolean` — Whether to enable [language interpretation](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0064768) for the webinar. If not provided, the default value will be based on the user's setting.
    - **interpreters** `object[]` — Information about the webinar's language interpreters.
      - `array` de:
        - **email** `string` — The interpreter's email address. · formato: `email`
        - **languages** `string` — A comma-separated list of the interpreter's languages. The string must contain exactly two country IDs. Only system-supported languages are allowed: `US` (English), `CN` (Chinese), `JP` (Japanese), `DE` (German), `FR` (French), `RU` (Russian), `PT` (Portuguese), `ES` (Spanish), and `KR` (Korean). For example, to set an interpreter translating from English to Chinese, use `US,CN`.
        - **interpreter_languages** `string` — A comma-separated list of the interpreter's languages. The string must contain exactly two languages. To get this value, use the `language_interpretation` object's `languages` and `custom_languages` values in the [**Get user settings**](/docs/api/users/#tag/users/GET/users/{userId}/settings) API response. **languages**: System-supported languages include `English`, `Chinese`, `Japanese`, `German`, `French`, `Russian`, `Portuguese`, `Spanish`, and `Korean`. **custom_languages**: User-defined languages added by the user. For example, an interpreter translating between English and French should use `English,French`.
  - **sign_language_interpretation** `object` — The webinar's [sign language interpretation settings](https://support.zoom.us/hc/en-us/articles/9644962487309-Using-sign-language-interpretation-in-a-meeting-or-webinar). Make sure to add the language in the web portal in order to use it in the API. See link for details. **Note:** If this feature is not enabled on the host's account, this setting will **not** be applied to the webinar.
    - **enable** `boolean` — Whether to enable [sign language interpretation](https://support.zoom.us/hc/en-us/articles/9644962487309-Using-sign-language-interpretation-in-a-meeting-or-webinar) for the webinar. If not provided, the default value will be based on the user's setting.
    - **interpreters** `object[]` — Information about the webinar's sign language interpreters.
      - `array` de:
        - **email** `string` — The interpreter's email address. · formato: `email`
        - **sign_language** `string` — The interpreter's sign language. To get this value, use the `sign_language_interpretation` object's `languages` and `custom_languages` values in the [**Get user settings**](/docs/api/rest/reference/zoom-api/methods#operation/userSettings) API response.
  - **panelist_authentication** `boolean` — Require panelists to authenticate to join. If not provided, the default value will be based on the user's setting.
  - **meeting_authentication** `boolean` — Only authenticated users can join Webinar.
  - **add_watermark** `boolean` — Add watermark that identifies the viewing participant. If not provided, the default value will be based on the user's setting.
  - **add_audio_watermark** `boolean` — Add audio watermark that identifies the participants. If not provided, the default value will be based on the user's setting.
  - **on_demand** `boolean` — Make the webinar on demand. · default: `False`
  - **panelists_invitation_email_notification** `boolean` — Send invitation email to panelists. If `false`, do not send invitation email to panelists.
  - **panelists_video** `boolean` — Start video when panelists join the webinar.
  - **post_webinar_survey** `boolean` — Zoom will open a survey page in attendees' browsers after leaving the webinar.
  - **practice_session** `boolean` — Enable practice session. · default: `False`
  - **question_and_answer** `object` — [Q&amp;A](https://support.zoom.us/hc/en-us/articles/203686015-Using-Q-A-as-the-webinar-host#:~:text=Overview,and%20upvote%20each%20other's%20questions.) for webinar.
    - **allow_submit_questions** `boolean` — * `true` - Allow participants to submit questions. * `false` - Do not allow submit questions.
    - **allow_anonymous_questions** `boolean` — * `true` - Allow participants to send questions without providing their name to the host, co-host, and panelists. * `false` - Do not allow anonymous questions.
    - **answer_questions** `string` — Indicate whether you want attendees to be able to view only answered questions, or view all questions. * `only` - Attendees are able to view answered questions only. * `all` - Attendees are able to view all questions submitted in the Q&amp;A. · valores: `only`, `all`
    - **attendees_can_comment** `boolean` — * `true` - Attendees can answer questions or leave a comment in the question thread. * `false` - Attendees can not answer questions or leave a comment in the question thread
    - **attendees_can_upvote** `boolean` — * `true` - Attendees can click the thumbs up button to bring popular questions to the top of the Q&amp;A window. * `false` - Attendees can not click the thumbs up button on questions.
    - **allow_auto_reply** `boolean` — If simulive webinar, * `true` - allow auto-reply to attendees. * `false` - don't allow auto-reply to the attendees.
    - **auto_reply_text** `string` — If `allow_auto_reply` = true, the text to be included in the automatic response.
    - **enable** `boolean` — * `true`: Enable [Q&amp;A](https://support.zoom.us/hc/en-us/articles/203686015-Using-Q-A-as-the-webinar-host#:~:text=Overview,and%20upvote%20each%20other's%20questions.) for webinar. * `false`: Disable Q&amp;A for webinar. If not provided, the default value will be based on the user's setting.
  - **registrants_confirmation_email** `boolean` — Send confirmation email to registrants.
  - **registrants_email_notification** `boolean` — Send email notifications to registrants about approval, cancellation, denial of the registration. The value of this field must be set to true in order to use the `registrants_confirmation_email` field.
  - **registrants_restrict_number** `integer` — Restrict number of registrants for a webinar. By default, it is set to `0`. A `0` value means that the restriction option is disabled. Provide a number higher than 0 to restrict the webinar registrants by the that number. · default: `0`
  - **registration_type** `integer` — Registration types. Only used for recurring webinars with a fixed time. `1` - Attendees register once and can attend any of the webinar sessions. `2` - Attendees need to register for each session in order to attend. `3` - Attendees register once and can choose one or more sessions to attend. · valores: `1`, `2`, `3` · default: `1`
  - **send_1080p_video_to_attendees** `boolean` — Always send 1080p video to attendees. · default: `False`
  - **show_share_button** `boolean` — Show social share buttons on the registration page.
  - **show_join_info** `boolean` — Whether to show the webinar's join information on the registration confirmation page. This setting is only applied to webinars with registration enabled.
  - **survey_url** `string` — Survey url for post webinar survey.
  - **enable_session_branding** `boolean` — Whether the **Webinar Session Branding** setting is enabled. This setting lets hosts visually customize a webinar by setting a session background. This also lets hosts use [Webinar Session Branding](https://support.zoom.us/hc/en-us/articles/4836268732045-Using-Webinar-Session-Branding) to set the Virtual Background for and apply name tags to hosts, alternative hosts, panelists, interpreters, and speakers.
  - **request_permission_to_unmute_participants** `boolean` — Whether to enable the [**Request permission to unmute participants**](https://support.zoom.us/hc/en-us/articles/203435537-Muting-and-unmuting-participants-in-a-meeting) setting. Not supported for simulive webinar. This option cannot be used together with `allow_host_control_participant_mute_state`, only one of the two can be enabled at a time. · default: `False`
  - **allow_host_control_participant_mute_state** `boolean` — Whether to allow the host and cohosts to fully control the mute state of participants. Not supported for simulive webinar. If not provided, the default value will be based on the user's setting. This option cannot be used together with `request_permission_to_unmute_participants`, only one of the two can be enabled at a time.
  - **email_in_attendee_report** `boolean` — Whether to include guest's email addresses in attendee reports for webinars.
- **start_time** `string` — Webinar start time in GMT/UTC. · formato: `date-time`
- **start_url** `string` — The `start_url` of a webinar is a URL using which a host or an alternative host can start the webinar. This URL should only be used by the host of the meeting and should not be shared with anyone other than the host of the webinar. The expiration time for the `start_url` field listed in the response of the [**Create a webinar**](/docs/api/rest/reference/zoom-api/methods#operation/webinarCreate) API is two hours for all regular users. For users created using the `custCreate` option via the [**Create users**](/docs/api/rest/reference/zoom-api/methods#operation/userCreate) API, the expiration time of the `start_url` field is 90 days. For security reasons, to retrieve the latest value for the `start_url` field programmatically after expiry, call the [**Get a webinar**](/docs/api/rest/reference/zoom-api/methods#operation/webinar) API and refer to the value of the `start_url` field in the response.
- **timezone** `string` — Time zone to format `start_time`.
- **topic** `string` — The webinar's topic.
- **tracking_fields** `object[]` — Tracking fields.
  - `array` de:
    - **field** `string` — Tracking fields type.
    - **value** `string` — Tracking fields value.
    - **visible** `boolean` — Whether the [tracking field](https://support.zoom.us/hc/en-us/articles/115000293426-Scheduling-Tracking-Fields) is visible in the webinar scheduling options in the Zoom Web Portal or not. * `true` - Tracking field is visible. * `false` - Tracking field is not visible to the users in the webinar options in the Zoom Web Portal but the field was used while scheduling this webinar via API. An invisible tracking field can be used by users while scheduling webinars via API only.
- **type** `integer` — Webinar types. `5` - Webinar. `6` - Recurring webinar with no fixed time. `9` - Recurring webinar with a fixed time. · valores: `5`, `6`, `9` · default: `5`
- **is_simulive** `boolean` — Whether the webinar is `simulive`.
- **record_file_id** `string` — The previously recorded file's ID for `simulive`.
- **transition_to_live** `boolean` — Whether to transition a simulive webinar to live. The host must be present at the time of transition.
- **simulive_delay_start** `object` — {"enable":false,"time":0,"timeunit":"second"}
  - **enable** `boolean` — Whether simulive need delay playback.
  - **time** `integer` — The time for delayed playback.
  - **timeunit** `string` — The time unit for delayed playback.
- **creation_source** `string` — The platform through which the meeting was created. * `other` - Created through another platform. * `open_api` - Created through Open API. * `web_portal` - Created through the web portal. · valores: `other`, `open_api`, `web_portal`

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `200` <br> Webinar plan is missing. You must subscribe to the webinar plan and enable webinars for user {userID} in order to perform this action. <br> **Error Code:** `300` <br> The value that you entered for the `schedule_for` field is invalid. Enter a valid value and try again. <br> **Error Code:** `300` <br> Can not schedule simulive webinar for others. <br> **Error Code:** `300` <br> Account hasn't enabled simulive webinar. <br> **Error Code:** `300` <br> Record file does not exist. <br> **Error Code:** `3000` <br> You cannot schedule a meeting for {userId}. <br> **Error Code:** `200` <br> No permission. <br> **Error Code:** `4505` <br> Simulive can't select `No Fixed Time`. <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `1001` <br> User {userId} does not exist. <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](/docs/api/rate-limits/).

---

## `DELETE /webinars/{webinarId}`

**Delete a webinar**

Delete a webinar. **Prerequisites:** * Pro or higher plan with the webinar add-on. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:write:admin`,`webinar:write` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:delete:webinar`,`webinar:delete:webinar:admin` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `LIGHT`

`operationId`: `webinarDelete` · tags: `Webinars` · seguridad: `openapi_authorization`

### Parámetros

- **webinarId** (`path`) `integer` _requerido_ — The webinar's ID.
- **occurrence_id** (`query`) `string` — The meeting or webinar occurrence ID.
- **cancel_webinar_reminder** (`query`) `boolean` — `true` - Notify panelists and registrants about the webinar cancellation via email. `false` - Do not send any email notification to webinar registrants and panelists. The default value of this field is `false`.

### Respuestas

**`204`** — **HTTP Status Code:** `204` <br> Webinar deleted.

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `3000` <br> Your request could not be processed because webinars created via event directory can not be updated or deleted using this method. <br> **Error Code:** `3000` <br> You cannot update or delete simulive webinars that have started using this method. <br> **Error Code:** `200` <br> Webinar plan is missing. You must subscribe to the webinar plan and enable webinars for this user in order to perform this action. <br> **Error Code:** `200` <br> No permission. <br> **Error Code:** `3000` <br> Webinar occurrence does not exist. <br> **Error Code:** `300` <br> Invalid webinar ID. <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `3001` <br> Webinar does not exist: {webinarId}. <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](https://developers.zoom.us/docs/api/rest/rate-limits/).

---

## `GET /webinars/{webinarId}`

**Get a webinar**

Get details for a scheduled Zoom webinar. **Prerequisites** * Pro or higher plan with a Webinar add-on. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:read` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:webinar`,`webinar:read:webinar:admin` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `LIGHT`

`operationId`: `webinar` · tags: `Webinars` · seguridad: `openapi_authorization`

### Parámetros

- **webinarId** (`path`) `string` _requerido_ — The webinar's ID or universally unique ID (UUID).
- **occurrence_id** (`query`) `string` — Unique identifier for an occurrence of a recurring webinar. [Recurring webinars](https://support.zoom.us/hc/en-us/articles/216354763-How-to-Schedule-A-Recurring-Webinar) can have a maximum of 50 occurrences. When you create a recurring Webinar using [**Create a webinar**](/docs/api-reference/zoom-api/methods#operation/webinarCreate) API, you can retrieve the Occurrence ID from the response of the API call.
- **show_previous_occurrences** (`query`) `boolean` — Set the value of this field to `true` to view webinar details of all previous occurrences of a recurring webinar.

### Respuestas

**`200`** — **HTTP Status Code:** `200` Success

- **host_email** `string` — The meeting host's email address. · formato: `email`
- **host_id** `string` — ID of the user set as host of webinar.
- **id** `integer` — The webinar ID in **long** format, represented as int64 data type in JSON, also known as the webinar number. · formato: `int64`
- **template_id** `string` — The webinar template's unique identifier. Use this field only if you would like to [schedule the webinar using an existing template](https://support.zoom.us/hc/en-us/articles/115001079746-Webinar-Templates#schedule). The value of this field can be retrieved from [**List webinar templates**](/docs/api/rest/reference/zoom-api/methods#operation/listWebinarTemplates) API. You must provide the user ID of the host instead of the email address in the `userId` path parameter in order to use a template for scheduling a webinar.
- **uuid** `string` — Unique webinar ID. Each webinar instance generates its own webinar UUID. After a webinar ends, a new UUID is generated for the next instance of the webinar. Retrieve a list of UUIDs from past webinar instances using the [**List past webinar instances**](/docs/api-reference/zoom-api/methods#operation/pastWebinars) API. [Double encode](/docs/api/using-zoom-apis/#meeting-id-and-uuid) your UUID when using it for API calls if the UUID begins with a `/` or contains `//` in it.
- **agenda** `string` — Webinar agenda.
- **created_at** `string` — Create time. · formato: `date-time`
- **duration** `integer` — Webinar duration.
- **registration_url** `string` — The URL that registrants can use to register for a webinar. This field is only returned for webinars that have enabled registration.
- **join_url** `string` — URL to join the webinar. Only share this URL with the users who should be invited to the webinar.
- **occurrences** `object[]` — Array of occurrence objects.
  - `array` de:
    - **duration** `integer` — Duration.
    - **occurrence_id** `string` — The occurrence ID, a unique identifier that identifies an occurrence of a recurring webinar. [Recurring webinars](https://support.zoom.us/hc/en-us/articles/216354763-How-to-Schedule-A-Recurring-Webinar) can have a maximum of 50 occurrences.
    - **start_time** `string` — Start time. · formato: `date-time`
    - **status** `string` — Occurrence status. `available` - Available occurrence. `deleted` - Deleted occurrence. · valores: `available`, `deleted`
- **password** `string` — Webinar passcode. Passcode may only contain the characters [a-z A-Z 0-9 @ - _ * !]. Maximum of 10 characters. If **Webinar Passcode** setting has been **enabled** **and** [locked](https://support.zoom.us/hc/en-us/articles/115005269866-Using-Tiered-Settings#locked) for the user, the passcode field will be autogenerated for the Webinar in the response even if it is not provided in the API request. **Note:** If the account owner or the admin has configured [minimum passcode requirement settings](https://support.zoom.us/hc/en-us/articles/360033559832-Meeting-and-webinar-passwords#h_a427384b-e383-4f80-864d-794bf0a37604), the passcode value provided here must meet those requirements. If the requirements are enabled, you can view those requirements by calling the [**Get account settings**](/docs/api/rest/reference/account/methods/#operation/accountSettings) API.
- **encrypted_passcode** `string` — Encrypted passcode for third party endpoints (H323/SIP).
- **h323_passcode** `string` — H.323/SIP room system passcode.
- **recurrence** `object` — Recurrence object. Use this object only for a webinar of type `9` - a recurring webinar with fixed time.
  - **end_date_time** `string` — Select a date when the webinar will recur before it is canceled. Should be in UTC time, such as 2017-11-25T12:00:00Z. Cannot be used with `end_times`. · formato: `date-time`
  - **end_times** `integer` — How many times the webinar will recur before it is canceled. The maximum number of recurring is 60. Cannot be used with `end_date_time`. · default: `1`
  - **monthly_day** `integer` — Use this field **only if you're scheduling a recurring webinar of type** `3` to state which day in a month, the webinar should recur. The value range is from 1 to 31. For instance, if you would like the webinar to recur on 23rd of each month, provide `23` as the value of this field and `1` as the value of the `repeat_interval` field. Instead, if you would like the webinar to recur once every three months, on 23rd of the month, change the value of the `repeat_interval` field to `3`.
  - **monthly_week** `integer` — Use this field **only if you're scheduling a recurring webinar of type** `3` to state the week of the month when the webinar should recur. If you use this field, **you must also use the `monthly_week_day` field to state the day of the week when the webinar should recur.** `-1` - Last week of the month. `1` - First week of the month. `2` - Second week of the month. `3` - Third week of the month. `4` - Fourth week of the month. · valores: `-1`, `1`, `2`, `3`, `4`
  - **monthly_week_day** `integer` — Use this field **only if you're scheduling a recurring webinar of type** `3` to state a specific day in a week when the monthly webinar should recur. To use this field, you must also use the `monthly_week` field. `1` - Sunday. `2` - Monday. `3` - Tuesday. `4` - Wednesday. `5` - Thursday. `6` - Friday. `7` - Saturday. · valores: `1`, `2`, `3`, `4`, `5`, `6`, `7`
  - **repeat_interval** `integer` — Define the interval when the webinar should recur. For instance, to schedule a webinar that recurs every two months, you must set the value of this field as `2` and the value of the `type` parameter as `3`. For a daily webinar, the maximum interval you can set is `90` days. For a weekly webinar, the maximum interval that you can set is `12` weeks. For a monthly webinar, the maximum interval that you can set is `3` months.
  - **type** `integer` _requerido_ — Recurrence webinar types. `1` - Daily. `2` - Weekly. `3` - Monthly. · valores: `1`, `2`, `3`
  - **weekly_days** `string` — Use this field **only if you're scheduling a recurring webinar of type** `2` to state which days of the week the webinar should repeat. The value for this field could be a number between `1` to `7` in string format. For instance, if the Webinar should recur on Sunday, provide `1` as the value of this field. **Note:** If you would like the webinar to occur on multiple days of a week, you should provide comma separated values for this field. For instance, if the Webinar should recur on Sundays and Tuesdays provide `1,3` as the value of this field. `1` - Sunday. `2` - Monday. `3` - Tuesday. `4` - Wednesday. `5` - Thursday. `6` - Friday. `7` - Saturday.
- **settings** `object` — Webinar settings.
  - **additional_data_center_regions** `string[]` — Add more webinar [data center regions](https://support.zoom.us/hc/en-us/articles/360042411451-Selecting-data-center-regions-for-hosted-meetings-and-webinars). Provide this value as an array of [country codes](/docs/api/references/abbreviations/#countries) for the countries available as data center regions in the [**Account Profile**](https://zoom.us/account/setting) interface but have been opted out of in the [user settings](https://zoom.us/profile). For example, the data center regions selected in your [**Account Profile**](https://zoom.us/account) are `Europe`, `Hong Kong SAR`, `Australia`, `India`, `Japan`, `China`, `United States`, and `Canada`. However, in the [**My Profile**](https://zoom.us/profile) settings, you did **not** select `India` and `Japan` for meeting and webinar traffic routing. To include `India` and `Japan` as additional data centers, use the `[IN, TY]` value for this field.
    - `array` de:
  - **allow_multiple_devices** `boolean` — Allow attendees to join from multiple devices.
  - **alternative_hosts** `string` — Alternative host emails or IDs. Multiple values separated by comma.
  - **alternative_host_update_polls** `boolean` — Whether the **Allow alternative hosts to add or edit polls** feature is enabled. This requires Zoom version 5.8.0 or higher.
  - **approval_type** `integer` — `0` - Automatically approve. `1` - Manually approve. `2` - No registration required. · valores: `0`, `1`, `2` · default: `2`
  - **attendees_and_panelists_reminder_email_notification** `object` — Send reminder email to attendees and panelists.
    - **enable** `boolean` — * `true` - Send reminder email to attendees and panelists. * `false` - Do not send reminder email to attendees and panelists.
    - **type** `integer` — `0` - No plan. `1` - Send 1 hour before webinar. `2` - Send 1 day before webinar. `3` - Send 1 hour and 1 day before webinar. `4` - Send 1 week before webinar. `5` - Send 1 hour and 1 week before webinar. `6` - Send 1 day and 1 week before webinar. `7` - Send 1 hour, 1 day and 1 week before webinar. · valores: `0`, `1`, `2`, `3`, `4`, `5`, `6`, `7`
  - **audio** `string` — Determine how participants can join the audio portion of the webinar. · valores: `both`, `telephony`, `voip`, `thirdParty` · default: `both`
  - **audio_conference_info** `string` — Third party audio conference info.
  - **authentication_domains** `string` — If user has configured [**Sign Into Zoom with Specified Domains**](https://support.zoom.us/hc/en-us/articles/360037117472-Authentication-Profiles-for-Meetings-and-Webinars#h_5c0df2e1-cfd2-469f-bb4a-c77d7c0cca6f) option, this will list the domains that are authenticated.
  - **authentication_name** `string` — Authentication name set in the [authentication profile](https://support.zoom.us/hc/en-us/articles/360037117472-Authentication-Profiles-for-Meetings-and-Webinars#h_5c0df2e1-cfd2-469f-bb4a-c77d7c0cca6f).
  - **authentication_option** `string` — Webinar authentication option ID.
  - **auto_recording** `string` — Automatic recording. `local` - Record on local. `cloud` - Record on cloud. `none` - Disabled. · valores: `local`, `cloud`, `none` · default: `none`
  - **close_registration** `boolean` — Close registration after event date.
  - **contact_email** `string` — Contact email for registration.
  - **contact_name** `string` — Contact name for registration.
  - **email_language** `string` — Set the email language. `en-US`, `de-DE`, `es-ES`, `fr-FR`, `jp-JP`, `pt-PT`, `ru-RU`,`zh-CN`, `zh-TW`, `ko-KO`, `it-IT`, or `vi-VN`.
  - **enforce_login** `boolean` — Only signed in users can join this meeting. **This field is deprecated and will not be supported in the future.** As an alternative, use the `meeting_authentication`, `authentication_option` and `authentication_domains` fields to understand the [authentication configurations](https://support.zoom.us/hc/en-us/articles/360037117472-Authentication-Profiles-for-Meetings-and-Webinars) set for the webinar.
  - **enforce_login_domains** `string` — Only signed in users with specified domains can join meetings. **This field is deprecated and will not be supported in the future.** As an alternative, use the `meeting_authentication`, `authentication_option`, and `authentication_domains` fields to understand the [authentication configurations](https://support.zoom.us/hc/en-us/articles/360037117472-Authentication-Profiles-for-Meetings-and-Webinars) set for the webinar.
  - **follow_up_absentees_email_notification** `object` — Send follow-up email to absentees.
    - **enable** `boolean` — * `true` - Send follow-up email to absentees. * `false` - Do not send follow-up email to absentees.
    - **type** `integer` — `0` - No plan. `1` - Send 1 days after the scheduled end date. `2` - Send 2 days after the scheduled end date. `3` - Send 3 days after the scheduled end date. `4` - Send 4 days after the scheduled end date. `5` - Send 5 days after the scheduled end date. `6` - Send 6 days after the scheduled end date. `7` - Send 7 days after the scheduled end date. · valores: `0`, `1`, `2`, `3`, `4`, `5`, `6`, `7`
  - **follow_up_attendees_email_notification** `object` — Send follow-up email to attendees.
    - **enable** `boolean` — * `true` - Send follow-up email to attendees. * `false` - Do not send follow-up email to attendees.
    - **type** `integer` — `0` - No plan. `1` - Send 1 day after the scheduled end date. `2` - Send 2 days after the scheduled end date. `3` - Send 3 days after the scheduled end date. `4` - Send 4 days after the scheduled end date. `5` - Send 5 days after the scheduled end date. `6` - Send 6 days after the scheduled end date. `7` - Send 7 days after the scheduled end date. · valores: `0`, `1`, `2`, `3`, `4`, `5`, `6`, `7`
  - **global_dial_in_countries** `string[]` — List of global dial-in countries.
    - `array` de:
  - **global_dial_in_numbers** `object[]` — A list of available dial-in numbers for different countries or regions.
    - `array` de:
      - **city** `string` — The number's city.
      - **country** `string` — The country code.
      - **country_name** `string` — Full name of country.
      - **number** `string` — Dial-in phone number.
      - **type** `string` — Dial-in number type. · valores: `toll`, `tollfree`, `premium`
  - **hd_video** `boolean` — Default to HD video. · default: `False`
  - **hd_video_for_attendees** `boolean` — Whether HD video for attendees is enabled. · default: `False`
  - **host_video** `boolean` — Start video when the host joins the webinar.
  - **language_interpretation** `object` — The webinar's [language interpretation settings](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0064768). Make sure to add the language in the web portal in order to use it in the API. See link for details. **Note:** This feature is only available for certain Webinar add-on, Education, and Business and higher plans. If this feature is not enabled on the host's account, this setting will **not** be applied to the webinar. This is not supported for simulive webinars.
    - **enable** `boolean` — Whether to enable [language interpretation](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0064768) for the webinar.
    - **interpreters** `object[]` — Information about the webinar's language interpreters.
      - `array` de:
        - **email** `string` — The interpreter's email address. · formato: `email`
        - **languages** `string` — A comma-separated list of the interpreter's languages. The string must contain exactly two country IDs. Only system-supported languages are allowed: `US` (English), `CN` (Chinese), `JP` (Japanese), `DE` (German), `FR` (French), `RU` (Russian), `PT` (Portuguese), `ES` (Spanish), and `KR` (Korean). For example, to set an interpreter translating from English to Chinese, use `US,CN`.
        - **interpreter_languages** `string` — A comma-separated list of the interpreter's languages. The string must contain exactly two languages. To get this value, use the `language_interpretation` object's `languages` and `custom_languages` values in the [**Get user settings**](/docs/api/users/#tag/users/GET/users/{userId}/settings) API response. **languages**: System-supported languages include `English`, `Chinese`, `Japanese`, `German`, `French`, `Russian`, `Portuguese`, `Spanish`, and `Korean`. **custom_languages**: User-defined languages added by the user. For example, an interpreter translating between English and French should use `English,French`.
  - **sign_language_interpretation** `object` — The webinar's [sign language interpretation settings](https://support.zoom.us/hc/en-us/articles/9644962487309-Using-sign-language-interpretation-in-a-meeting-or-webinar). Make sure to add the language in the web portal in order to use it in the API. See link for details. **Note:** If this feature is not enabled on the host's account, this setting will **not** be applied to the webinar.
    - **enable** `boolean` — Whether to enable [sign language interpretation](https://support.zoom.us/hc/en-us/articles/9644962487309-Using-sign-language-interpretation-in-a-meeting-or-webinar) for the webinar.
    - **interpreters** `object[]` — Information about the webinar's sign language interpreters.
      - `array` de:
        - **email** `string` — The interpreter's email address. · formato: `email`
        - **sign_language** `string` — The interpreter's sign language. To get this value, use the `sign_language_interpretation` object's `languages` and `custom_languages` values in the [**Get user settings**](/api-reference/zoom-api/methods#operation/userSettings) API response.
  - **panelist_authentication** `boolean` — Require panelists to authenticate to join.
  - **meeting_authentication** `boolean` — Only authenticated users can join the webinar.
  - **add_watermark** `boolean` — Add watermark that identifies the viewing participant.
  - **add_audio_watermark** `boolean` — Add audio watermark that identifies the participants.
  - **on_demand** `boolean` — Make the webinar on-demand. · default: `False`
  - **panelists_invitation_email_notification** `boolean` — Send invitation email to panelists. If `false`, do not send invitation email to panelists.
  - **panelists_video** `boolean` — Start video when panelists join webinar.
  - **post_webinar_survey** `boolean` — Zoom will open a survey page in attendees' browsers after leaving the webinar.
  - **practice_session** `boolean` — Enable practice session. · default: `False`
  - **question_and_answer** `object` — [Q&amp;A](https://support.zoom.us/hc/en-us/articles/203686015-Using-Q-A-as-the-webinar-host#:~:text=Overview,and%20upvote%20each%20other's%20questions.) for webinar.
    - **allow_submit_questions** `boolean` — * `true` - Allow participants to submit questions. * `false` - Do not allow submit questions.
    - **allow_anonymous_questions** `boolean` — * `true` - Allow participants to send questions without providing their name to the host, co-host, and panelists. * `false` - Do not allow anonymous questions.
    - **answer_questions** `string` — Indicate whether you want attendees to be able to view answered questions only or view all questions. * `only` - Attendees are able to view answered questions only. * `all` - Attendees are able to view all questions submitted in the Q&amp;A. · valores: `only`, `all`
    - **attendees_can_comment** `boolean` — * `true` - Attendees can answer questions or leave a comment in the question thread. * `false` - Attendees can not answer questions or leave a comment in the question thread
    - **attendees_can_upvote** `boolean` — * `true` - Attendees can click the thumbs up button to bring popular questions to the top of the Q&amp;A window. * `false` - Attendees can not click the thumbs up button on questions.
    - **allow_auto_reply** `boolean` — If simulive webinar, * `true` - allow auto-reply to attendees. * `false` - don't allow auto-reply to the attendees.
    - **auto_reply_text** `string` — If `allow_auto_reply` = true, the text to be included in the automatic response.
    - **enable** `boolean` — * `true` - Enable [Q&amp;A](https://support.zoom.us/hc/en-us/articles/203686015-Using-Q-A-as-the-webinar-host#:~:text=Overview,and%20upvote%20each%20other's%20questions.) for webinar. * `false` - Disable Q&amp;A for webinar.
  - **registrants_confirmation_email** `boolean` — Send confirmation email to registrants
  - **registrants_email_notification** `boolean` — Send email notifications to registrants about approval, cancellation, denial of the registration. The value of this field must be set to true in order to use the `registrants_confirmation_email` field.
  - **registrants_restrict_number** `integer` — Restrict number of registrants for a webinar. By default, it is set to `0`. A `0` value means that the restriction option is disabled. Provide a number higher than 0 to restrict the webinar registrants by the that number. · default: `0`
  - **registration_type** `integer` — Registration types. Only used for recurring webinars with a fixed time. `1` - Attendees register once and can attend any of the webinar sessions. `2` - Attendees need to register for each session in order to attend. `3` - Attendees register once and can choose one or more sessions to attend. · valores: `1`, `2`, `3` · default: `1`
  - **send_1080p_video_to_attendees** `boolean` — Always send 1080p video to attendees. · default: `False`
  - **show_share_button** `boolean` — Show social share buttons on the registration page.
  - **show_join_info** `boolean` — Whether to show the webinar's join information on the registration confirmation page. This setting is only applied to webinars with registration enabled.
  - **survey_url** `string` — Survey URL for post webinar survey.
  - **enable_session_branding** `boolean` — Whether the **Webinar Session Branding** setting is enabled. This setting lets hosts visually customize a webinar by setting a session background. This also lets hosts use [webinar session branding](https://support.zoom.us/hc/en-us/articles/4836268732045-Using-Webinar-Session-Branding) to set the Virtual Background for and apply name tags to hosts, alternative hosts, panelists, interpreters, and speakers.
  - **request_permission_to_unmute_participants** `boolean` — Whether to enable the [**Request permission to unmute participants**](https://support.zoom.us/hc/en-us/articles/203435537-Muting-and-unmuting-participants-in-a-meeting) setting. Not supported for simulive webinar. This option cannot be used together with `allow_host_control_participant_mute_state`, only one of the two can be enabled at a time.
  - **allow_host_control_participant_mute_state** `boolean` — Whether to allow the host and co-hosts to fully control the mute state of participants. Not supported for simulive webinar. This option cannot be used together with `request_permission_to_unmute_participants`, only one of the two can be enabled at a time.
  - **email_in_attendee_report** `boolean` — Whether to include guest's email addresses in webinars' attendee reports.
- **start_time** `string` — Webinar start time in GMT/UTC. · formato: `date-time`
- **start_url** `string` — The `start_url` of a webinar is a URL using which a host or an alternative host can start the webinar. This URL should only be used by the host of the meeting and should not be shared with anyone other than the host of the webinar. The expiration time for the `start_url` field listed in the response of the [**Create a webinar**](/docs/api-reference/zoom-api/methods#operation/webinarCreate) API is two hours for all regular users. For users created using the `custCreate` option via the [**Create users**](/docs/api-reference/zoom-api/methods#operation/userCreate) API, the expiration time of the `start_url` field is 90 days. For security reasons, to retrieve the latest value for the `start_url` field programmatically (after expiry), you must call the [**Get a webinar**](/docs/api-reference/zoom-api/methods#operation/webinar) API and refer to the value of the `start_url` field in the response.
- **timezone** `string` — Time zone to format `start_time`.
- **topic** `string` — Webinar topic.
- **tracking_fields** `object[]` — Tracking fields.
  - `array` de:
    - **field** `string` — Tracking fields type.
    - **value** `string` — Tracking fields value.
    - **visible** `boolean` — Whether the [tracking field](https://support.zoom.us/hc/en-us/articles/115000293426-Scheduling-Tracking-Fields) is visible in the webinar scheduling options in the Zoom Web Portal or not. * `true` - Tracking field is visible. * `false` - Tracking field is not visible to the users in the webinar options in the Zoom Web Portal but the field was used while scheduling this webinar via API. An invisible tracking field can be used by users while scheduling webinars via API only.
- **type** `integer` — Webinar types. `5` - Webinar. `6` - Recurring webinar with no fixed time. `9` - Recurring webinar with a fixed time. · valores: `5`, `6`, `9` · default: `5`
- **is_simulive** `boolean` — Whether the webinar is `simulive`.
- **record_file_id** `string` — The previously recorded file's ID for `simulive`.
- **transition_to_live** `boolean` — Whether to transition a simulive webinar to live. The host must be present at the time of transition.
- **simulive_delay_start** `object` — {"enable":false,"time":0,"timeunit":"second"}
  - **enable** `boolean` — Whether simulive needs to delay playback.
  - **time** `integer` — The time for delayed playback. If the time unit is seconds, then the maximum value is 60 and the minimum value is 1. If the time unit is minutes, then the maximum value is 10 and the minimum value is 1.
  - **timeunit** `string` — The time unit for delayed playback. `second` - The time unit for delayed playback is seconds. `minute` - The time unit for delayed playback is minutes. · valores: `second`, `minute` · default: `second`
- **creation_source** `string` — The platform used when creating the meeting. * `other` - Created through another platform. * `open_api` - Created through Open API. * `web_portal` - Created through the web portal. · valores: `other`, `open_api`, `web_portal`

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `300` <br> Invalid webinar ID. <br> **Error Code:** `200` <br> Webinar plan is missing. You must subscribe to the webinar plan and enable webinars for user {userId} to perform this action. <br> **Error Code:** `200` <br> No permission. <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `3001` <br> Webinar does not exist: {webinarId}. <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](/docs/api/rate-limits/).

---

## `PATCH /webinars/{webinarId}`

**Update a webinar**

Make updates to a scheduled webinar. **100 requests per day**. The rate limit is applied to the `userId` of the **webinar host** used to make the request. **Prerequisites** * A Pro or higher plan with a webinar add-on. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:write`,`webinar:write:admin` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:update:webinar`,`webinar:update:webinar:admin` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `LIGHT`

`operationId`: `webinarUpdate` · tags: `Webinars` · seguridad: `openapi_authorization`

### Parámetros

- **webinarId** (`path`) `integer` _requerido_ — The webinar's ID.
- **occurrence_id** (`query`) `string` — Webinar occurrence ID. Support change of agenda, start time, duration, and settings `host_video`, `panelist_video`, `hd_video, watermark`, `auto_recording`.

### Request body — `application/json`

- **agenda** `string` — Webinar description.
- **duration** `integer` — Webinar duration, in minutes. Used for scheduled webinar only.
- **password** `string` — Webinar passcode. Passcode may only contain the characters [a-z A-Z 0-9 @ - _ * !]. Maximum of 10 characters. If **Webinar Passcode** setting has been **enabled** **and** [locked](https://support.zoom.us/hc/en-us/articles/115005269866-Using-Tiered-Settings#locked) for the user, the passcode field will be autogenerated for the Webinar in the response even if it is not provided in the API request. **Note:** If the account owner or the admin has configured [minimum passcode requirement settings](https://support.zoom.us/hc/en-us/articles/360033559832-Meeting-and-webinar-passwords#h_a427384b-e383-4f80-864d-794bf0a37604), the passcode value provided here must meet those requirements. If the requirements are enabled, you can view those requirements by calling the [**Get account settings**](/docs/api/rest/reference/account/methods/#operation/accountSettings) API.
- **schedule_for** `string` — The user's email address or `userId` to schedule a webinar for.
- **recurrence** `object` — Recurrence object. Use this object only for a meeting with type `8`, a recurring meeting with fixed time.
  - **end_date_time** `string` — Select the final date when the meeting will recur before it is canceled. Should be in UTC time, such as 2017-11-25T12:00:00Z. Cannot be used with `end_times`. · formato: `date-time`
  - **end_times** `integer` — Select how many times the webinar will recur before it is canceled. The maximum number of recurring is 60. Cannot be used with `end_date_time`. · default: `1`
  - **monthly_day** `integer` — Use this field **only if you're scheduling a recurring meeting of type** `3` to state which day in a month, the meeting should recur. The value range is from 1 to 31. If you would like the meeting to recur on 23rd of each month, provide `23` as the value of this field and `1` as the value of the `repeat_interval` field. If you would like the meeting to recur every three months, on 23rd of the month, change the value of the `repeat_interval` field to `3`. · default: `1`
  - **monthly_week** `integer` — Use this field **only if you're scheduling a recurring meeting of type** `3` to state the week of the month when the meeting should recur. If you use this field, **you must also use the `monthly_week_day` field to state the day of the week when the meeting should recur.** `-1` - Last week of the month. `1` - First week of the month. `2` - Second week of the month. `3` - Third week of the month. `4` - Fourth week of the month. · valores: `-1`, `1`, `2`, `3`, `4`
  - **monthly_week_day** `integer` — Use this field **only if you're scheduling a recurring meeting of type** `3` to state a specific day in a week when the monthly meeting should recur. To use this field, you must also use the `monthly_week` field. `1` - Sunday. `2` - Monday. `3` - Tuesday. `4` - Wednesday. `5` - Thursday. `6` - Friday. `7` - Saturday. · valores: `1`, `2`, `3`, `4`, `5`, `6`, `7`
  - **repeat_interval** `integer` — Define the interval when the meeting should recur. If you would like to schedule a meeting that recurs every two months, set the value of this field as `2` and the value of the `type` parameter as `3`. For a daily meeting, the maximum interval you can set is `90` days. For a weekly meeting the maximum interval that you can set is of `12` weeks. For a monthly meeting, there is a maximum of `3` months.
  - **type** `integer` _requerido_ — Recurrence meeting types. `1` - Daily. `2` - Weekly. `3` - Monthly. · valores: `1`, `2`, `3`
  - **weekly_days** `string` — This field is required **if you're scheduling a recurring meeting of type** `2` to state which day(s) of the week the meeting should repeat. The value for this field could be a number between `1` to `7` in string format. For instance, if the meeting should recur on Sunday, provide `1` as the value of this field. **Note:** If you would like the meeting to occur on multiple days of a week, you should provide comma separated values for this field. For instance, if the meeting should recur on Sundays and Tuesdays provide `1,3` as the value of this field. `1` - Sunday. `2` - Monday. `3` - Tuesday. `4` - Wednesday. `5` - Thursday. `6` - Friday. `7` - Saturday. · valores: `1`, `2`, `3`, `4`, `5`, `6`, `7` · default: `1`
- **settings** `object` — Webinar settings.
  - **additional_data_center_regions** `string[]` — Add more webinar [data center regions](https://support.zoom.us/hc/en-us/articles/360042411451-Selecting-data-center-regions-for-hosted-meetings-and-webinars). Provide this value as an array of [country codes](/docs/api/references/abbreviations/#countries) for the countries available as data center regions in the [**Account Profile**](https://zoom.us/account/setting) interface but have been opted out of in the [user settings](https://zoom.us/profile). For example, the data center regions selected in your [**Account Profile**](https://zoom.us/account) are `Europe`, `Hong Kong SAR`, `Australia`, `India`, `Japan`, `China`, `United States`, and `Canada`. However, in the [**My Profile**](https://zoom.us/profile) settings, you did **not** select `India` and `Japan` for meeting and webinar traffic routing. To include `India` and `Japan` as additional data centers, use the `[IN, TY]` value for this field.
    - `array` de:
  - **allow_multiple_devices** `boolean` — Allow attendees to join from multiple devices.
  - **alternative_hosts** `string` — Alternative host emails or IDs. Separate multiple values by commas.
  - **alternative_host_update_polls** `boolean` — Whether the **Allow alternative hosts to add or edit polls** feature is enabled. This requires Zoom version 5.8.0 or higher.
  - **approval_type** `integer` — `0` - Automatically approve. `1` - Manually approve. `2` - No registration required. · valores: `0`, `1`, `2` · default: `2`
  - **attendees_and_panelists_reminder_email_notification** `object` — Send reminder email to attendees and panelists.
    - **enable** `boolean` — * `true` - Send reminder email to attendees and panelists. * `false` - Do not send reminder email to attendees and panelists.
    - **type** `integer` — `0` - No plan. `1` - Send 1 hour before webinar. `2` - Send 1 day before webinar. `3` - Send 1 hour and 1 day before webinar. `4` - Send 1 week before webinar. `5` - Send 1 hour and 1 week before webinar. `6` - Send 1 day and 1 week before webinar. `7` - Send 1 hour, 1 day and 1 week before webinar. · valores: `0`, `1`, `2`, `3`, `4`, `5`, `6`, `7`
  - **audio** `string` — Determine how participants can join the audio portion of the webinar. · valores: `both`, `telephony`, `voip`, `thirdParty` · default: `both`
  - **audio_conference_info** `string` — Third party audio conference info.
  - **authentication_domains** `string` — If user has configured [**Sign Into Zoom with Specified Domains**](https://support.zoom.us/hc/en-us/articles/360037117472-Authentication-Profiles-for-Meetings-and-Webinars#h_5c0df2e1-cfd2-469f-bb4a-c77d7c0cca6f) option, this will list the domains that are authenticated.
  - **authentication_option** `string` — Webinar authentication option ID.
  - **auto_recording** `string` — Automatic recording. `local` - Record on local. `cloud` - Record on cloud. `none` - Disabled. · valores: `local`, `cloud`, `none` · default: `none`
  - **close_registration** `boolean` — Close registration after event date.
  - **contact_email** `string` — Contact email for registration
  - **contact_name** `string` — Contact name for registration
  - **email_language** `string` — Set the email language to one of the following. `en-US`,`de-DE`,`es-ES`,`fr-FR`,`jp-JP`,`pt-PT`,`ru-RU`,`zh-CN`, `zh-TW`, `ko-KO`, `it-IT`, `vi-VN`.
  - **enforce_login** `boolean` — Only signed in users can join this meeting. **This field is deprecated and will not be supported in the future.** As an alternative, use the ``meeting_authentication`, `authentication_option`, and `authentication_domains` fields to understand the [authentication configurations](https://support.zoom.us/hc/en-us/articles/360037117472-Authentication-Profiles-for-Meetings-and-Webinars) set for the webinar.
  - **enforce_login_domains** `string` — Only signed in users with specified domains can join meetings. **This field is deprecated and will not be supported in the future.** As an alternative, use the `meeting_authentication`, `authentication_option`, and `authentication_domains` fields to understand the [authentication configurations](https://support.zoom.us/hc/en-us/articles/360037117472-Authentication-Profiles-for-Meetings-and-Webinars) set for the webinar.
  - **follow_up_absentees_email_notification** `object` — Send follow-up email to absentees.
    - **enable** `boolean` — * `true` - Send follow-up email to absentees. * `false` - Do not send follow-up email to absentees.
    - **type** `integer` — `0` - No plan. `1` - Send 1 days after the scheduled end date. `2` - Send 2 days after the scheduled end date. `3` - Send 3 days after the scheduled end date. `4` - Send 4 days after the scheduled end date. `5` - Send 5 days after the scheduled end date. `6` - Send 6 days after the scheduled end date. `7` - Send 7 days after the scheduled end date. · valores: `0`, `1`, `2`, `3`, `4`, `5`, `6`, `7`
  - **follow_up_attendees_email_notification** `object` — Send follow-up email to attendees.
    - **enable** `boolean` — * `true` - Send follow-up email to attendees. * `false` - Do not send follow-up email to attendees.
    - **type** `integer` — `0` - No plan. `1` - Send 1 day after the scheduled end date. `2` - Send 2 days after the scheduled end date. `3` - Send 3 days after the scheduled end date. `4` - Send 4 days after the scheduled end date. `5` - Send 5 days after the scheduled end date. `6` - Send 6 days after the scheduled end date. `7` - Send 7 days after the scheduled end date. · valores: `0`, `1`, `2`, `3`, `4`, `5`, `6`, `7`
  - **global_dial_in_countries** `string[]` — List of global dial-in countries
    - `array` de:
  - **hd_video** `boolean` — Default to HD video. · default: `False`
  - **hd_video_for_attendees** `boolean` — Whether HD video for attendees is enabled. · default: `False`
  - **host_video** `boolean` — Start video when host joins the webinar.
  - **language_interpretation** `object` — The webinar's [language interpretation settings](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0064768). Make sure to add the language in the web portal in order to use it in the API. See link for details. **Note:** This feature is only available for certain Webinar add-on, Education, and Business and higher plans. If this feature is not enabled on the host's account, this setting will **not** be applied to the webinar. This is not supported for simulive webinars.
    - **enable** `boolean` — Whether to enable [language interpretation](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0064768) for the webinar.
    - **interpreters** `object[]` — Information about the webinar's language interpreters.
      - `array` de:
        - **email** `string` — The interpreter's email address. · formato: `email`
        - **languages** `string` — A comma-separated list of the interpreter's languages. The string must contain exactly two country IDs. Only system-supported languages are allowed: `US` (English), `CN` (Chinese), `JP` (Japanese), `DE` (German), `FR` (French), `RU` (Russian), `PT` (Portuguese), `ES` (Spanish), and `KR` (Korean). For example, to set an interpreter translating from English to Chinese, use `US,CN`.
        - **interpreter_languages** `string` — A comma-separated list of the interpreter's languages. The string must contain exactly two languages. To get this value, use the `language_interpretation` object's `languages` and `custom_languages` values in the [**Get user settings**](/docs/api/users/#tag/users/GET/users/{userId}/settings) API response. **languages**: System-supported languages include `English`, `Chinese`, `Japanese`, `German`, `French`, `Russian`, `Portuguese`, `Spanish`, and `Korean`. **custom_languages**: User-defined languages added by the user. For example, an interpreter translating between English and French should use `English,French`.
  - **sign_language_interpretation** `object` — The webinar's [sign language interpretation settings](https://support.zoom.us/hc/en-us/articles/9644962487309-Using-sign-language-interpretation-in-a-meeting-or-webinar). Make sure to add the language in the web portal in order to use it in the API. See link for details. **Note:** If this feature is not enabled on the host's account, this setting will **not** be applied to the webinar.
    - **enable** `boolean` — Whether to enable [sign language interpretation](https://support.zoom.us/hc/en-us/articles/9644962487309-Using-sign-language-interpretation-in-a-meeting-or-webinar) for the webinar.
    - **interpreters** `object[]` — Information about the webinar's sign language interpreters.
      - `array` de:
        - **email** `string` — The interpreter's email address. · formato: `email`
        - **sign_language** `string` — The interpreter's sign language. To get this value, use the `sign_language_interpretation` object's `languages` and `custom_languages` values in the [**Get user settings**](/api-reference/zoom-api/methods#operation/userSettings) API response.
  - **panelist_authentication** `boolean` — Require panelists to authenticate to join.
  - **meeting_authentication** `boolean` — Only authenticated users can join the webinar.
  - **add_watermark** `boolean` — Add watermark that identifies the viewing participant.
  - **add_audio_watermark** `boolean` — Add audio watermark that identifies the participants.
  - **notify_registrants** `boolean` — Send notification email to registrants when the host updates a webinar.
  - **on_demand** `boolean` — Make the webinar on-demand. · default: `False`
  - **panelists_invitation_email_notification** `boolean` — Send invitation email to panelists. If `false`, do not send invitation email to panelists.
  - **panelists_video** `boolean` — Start video when panelists join the webinar.
  - **post_webinar_survey** `boolean` — Zoom will open a survey page in attendees' browsers after leaving the webinar.
  - **practice_session** `boolean` — Enable practice session. · default: `False`
  - **question_and_answer** `object` — [Q&amp;A](https://support.zoom.us/hc/en-us/articles/203686015-Using-Q-A-as-the-webinar-host#:~:text=Overview,and%20upvote%20each%20other's%20questions.) for webinar.
    - **allow_submit_questions** `boolean` — * `true` - Allow participants to submit questions. * `false` - Do not allow submit questions.
    - **allow_anonymous_questions** `boolean` — * `true` - Allow participants to send questions without providing their name to the host, co-host, and panelists.. * `false` - Do not allow anonymous questions.
    - **answer_questions** `string` — Indicate whether you want attendees to be able to view answered questions only or view all questions. * `only` - Attendees are able to view answered questions only. * `all` - Attendees are able to view all questions submitted in the Q&amp;A. · valores: `only`, `all`
    - **attendees_can_comment** `boolean` — * `true` - Attendees can answer questions or leave a comment in the question thread. * `false` - Attendees can't answer questions or leave a comment in the question thread.
    - **attendees_can_upvote** `boolean` — * `true` - Attendees can click the thumbs up button to bring popular questions to the top of the Q&amp;A window. * `false` - Attendees can't click the thumbs up button on questions.
    - **allow_auto_reply** `boolean` — If simulive webinar, * `true` - allow auto-reply to attendees. * `false` - don't allow auto-reply to the attendees.
    - **auto_reply_text** `string` — If `allow_auto_reply` = true, the text to be included in the automatic response.
    - **enable** `boolean` — * `true` - Enable [Q&amp;A](https://support.zoom.us/hc/en-us/articles/203686015-Using-Q-A-as-the-webinar-host#:~:text=Overview,and%20upvote%20each%20other's%20questions.) for webinar. * `false` - Disable Q&amp;A for webinar.
  - **registrants_confirmation_email** `boolean` — Send confirmation email to registrants
  - **registrants_email_notification** `boolean` — Send email notifications to registrants about approval, cancellation, denial of the registration. The value of this field must be set to true in order to use the `registrants_confirmation_email` field.
  - **registrants_restrict_number** `integer` — Restrict number of registrants for a webinar. By default, it is set to `0`. A `0` value means that the restriction option is disabled. Provide a number higher than 0 to restrict the webinar registrants by the that number. · default: `0`
  - **registration_type** `integer` — Registration types. Only used for recurring webinars with a fixed time. `1` - Attendees register once and can attend any of the webinar sessions. `2` - Attendees need to register for each session in order to attend. `3` - Attendees register once and can choose one or more sessions to attend. · valores: `1`, `2`, `3` · default: `1`
  - **send_1080p_video_to_attendees** `boolean` — Always send 1080p video to attendees. · default: `False`
  - **show_share_button** `boolean` — Show social share buttons on the registration page.
  - **show_join_info** `boolean` — Whether to show the webinar's join information on the registration confirmation page. This setting is only applied to webinars with registration enabled.
  - **survey_url** `string` — Survey url for post webinar survey
  - **enable_session_branding** `boolean` — Whether the **Webinar Session Branding** setting is enabled. This setting lets hosts visually customize a webinar by setting a session background. This also lets hosts use [Webinar Session Branding](https://support.zoom.us/hc/en-us/articles/4836268732045-Using-Webinar-Session-Branding) to set the virtual background for and apply name tags to hosts, alternative hosts, panelists, interpreters, and speakers.
  - **request_permission_to_unmute_participants** `boolean` — Whether to enable the [**Request permission to unmute participants**](https://support.zoom.us/hc/en-us/articles/203435537-Muting-and-unmuting-participants-in-a-meeting) setting. Not supported for simulive webinar. This option cannot be used together with `allow_host_control_participant_mute_state`, only one of the two can be enabled at a time.
  - **allow_host_control_participant_mute_state** `boolean` — Whether to allow the host and co-hosts to fully control the mute state of participants. Not supported for simulive webinar. This option cannot be used together with `request_permission_to_unmute_participants`, only one of the two can be enabled at a time.
  - **email_in_attendee_report** `boolean` — Whether to include guest's email addresses in webinars' attendee reports.
- **start_time** `string` — Webinar start time, in the format `yyyy-MM-dd'T'HH:mm:ss'Z'`. Should be in GMT time. In the format `yyyy-MM-dd'T'HH:mm:ss`. This should be in local time and the timezone should be specified. Only used for scheduled webinars and recurring webinars with a fixed time. · formato: `date-time`
- **timezone** `string` — The timezone to assign to the `start_time` value. This field is only used for scheduled or recurring webinars with a fixed time. For a list of supported timezones and their formats, see our [timezone list](/docs/api/references/abbreviations/#timezones).
- **topic** `string` — The webinar topic.
- **tracking_fields** `object[]` — Tracking fields.
  - `array` de:
    - **field** `string` — Tracking fields type.
    - **value** `string` — Tracking fields value.
- **type** `integer` — Webinar types. `5` - webinar. `6` - Recurring webinar with no fixed time. `9` - Recurring webinar with a fixed time. · valores: `5`, `6`, `9` · default: `5`
- **is_simulive** `boolean` — Whether to set the webinar to simulive.
- **record_file_id** `string` — The previously recorded file's ID for `simulive`.
- **transition_to_live** `boolean` — Whether to transition a simulive webinar to live. The host must be present at the time of transition.
- **simulive_delay_start** `object` — {"enable":false,"time":0,"timeunit":"second"}
  - **enable** `boolean` — Whether simulive need delay playback.
  - **time** `integer` — The time for delayed playback. If the time unit is seconds, then the maximum value is 60 and the minimum value is 1. If the time unit is minutes, then the maximum value is 10 and the minimum value is 1.
  - **timeunit** `string` — The time unit for delayed playback. `second` - The time unit for delayed playback is seconds. `minute` - The time unit for delayed playback is minutes. · valores: `second`, `minute` · default: `second`

### Respuestas

**`204`** — **HTTP Status Code:** `204` Webinar updated.

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `3003` <br> Users in **{domains}** have been blocked from joining meetings and webinars. To unblock them, go to the **Settings** page in the Zoom web portal and update the **Block users in specific domains from joining meetings and webinars** setting. <br> **Error Code:** `3000` <br> You cannot update or delete simulive webinars that have started using this method. <br> **Error Code:** `300` <br> The value that you entered for the `schedule_for` field is invalid. Enter a valid value and try again. <br> **Error Code:** `200` <br> Webinar plan is missing. You must subscribe to the webinar plan and enable webinars for this user in order to perform this action: {userId}. <br> **Error Code:** `300` <br> Invalid webinar ID. <br> **Error Code:** `200` <br> No permission. <br> **Error Code:** `4505` <br> Simulive can't select `No Fixed Time`. <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `3001` <br> Webinar does not exist: {webinarId}. <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](/docs/api/rate-limits/).

---

## `POST /webinars/{webinarId}/batch_registrants`

**Perform batch registration**

Register up to 30 registrants at once for a scheduled webinar that requires [registration](https://support.zoom.us/hc/en-us/articles/204619915-Scheduling-a-webinar-with-registration). **Prerequisites:** * The webinar host must be a licensed user. * The webinar should be type `5`, a scheduled webinar. Other types of webinars are not supported by this API. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:write`,`webinar:write:admin` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:write:batch_registrants`,`webinar:write:batch_registrants:admin` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `HEAVY`

`operationId`: `addBatchWebinarRegistrants` · tags: `Webinars` · seguridad: `openapi_authorization`

### Parámetros

- **webinarId** (`path`) `string` _requerido_ — The webinar's unique identifier.

### Request body — `application/json`

- **auto_approve** `boolean` — If a meeting was scheduled with approval_type `1` (manual approval), but you want to automatically approve registrants added via this API, set the value of this field to `true`. You **cannot** use this field to change approval setting for a meeting that was originally scheduled with approval_type `0` (automatic approval).
- **registrants** `object[]`
  - `array` de:
    - **email** `string` _requerido_ — The registrant's email address. · formato: `email`
    - **first_name** `string` _requerido_ — The registrant's first name.
    - **last_name** `string` — The registrant's last name.

### Respuestas

**`201`** — **HTTP Status Code:** `200` **OK** Registrants added.

- **registrants** `object[]`
  - `array` de:
    - **email** `string` — The registrant's email address.
    - **join_url** `string` — Unique URL using which registrant can join the webinar.
    - **registrant_id** `string` — The registrant's unique identifier.

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `200` <br> Webinar plan is missing. You must subscribe to the webinar plan and enable webinars for this user in order to perform this action. <br> **Error Code:** `300` <br> This API can only be used for scheduled webinars (type 5). Batch registration is not supported for other webinar types. <br> **Error Code:** `3038` <br> The webinar is over. You cannot register now. If you have any questions, contact the webinar's host. <br> **Error Code:** `3000` <br> You have reached the limit for the number of attendees you can add. Contact Zoom Support for more information. <br> **Error Code:** `3000` <br> The Zoom REST API does not support paid registration. <br> **Error Code:** `3043` <br> Webinar has reached maximum attendee capacity. <br> **Error Code:** `3000` <br> Registration has not been enabled for this webinar: {webinarId}. <br> **Error Code:** `300` <br> Invalid webinar ID. <br> **Error Code:** `200` <br> No permission. <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `3001` <br> Webinar does not exist: {webinarId}. <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](https://developers.zoom.us/docs/api/rest/rate-limits/).

---

## `GET /webinars/{webinarId}/registrants`

**List webinar registrants**

List all users that have registered for a given webinar. Zoom users with a [webinar plan](https://zoom.us/webinar) have access to creating and managing webinars. The webinar functionality lets a host broadcast a Zoom meeting to up to 10,000 attendees. Scheduling a [webinar with registration](https://support.zoom.us/hc/en-us/articles/204619915-Scheduling-a-Webinar-with-Registration) requires your registrants to complete a brief form before receiving the link to join the webinar. **Prerequisites** * Pro or higher plan with a Webinar add-on. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:read` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:list_registrants`,`webinar:read:list_registrants:admin` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `MEDIUM`

`operationId`: `webinarRegistrants` · tags: `Webinars` · seguridad: `openapi_authorization`

### Parámetros

- **webinarId** (`path`) `integer` _requerido_ — The webinar's ID.
- **occurrence_id** (`query`) `string` — The meeting or webinar occurrence ID.
- **status** (`query`) `string` — Query by the registrant's status. * `pending` - The registration is pending. * `approved` - The registrant is approved. * `denied` - The registration is denied. · valores: `pending`, `approved`, `denied` · default: `approved`
- **tracking_source_id** (`query`) `string` — The tracking source ID for the registrants. Useful if you share the webinar registration page in multiple locations. See [Creating source tracking links for webinar registration](https://support.zoom.us/hc/en-us/articles/360000315683-Creating-source-tracking-links-for-webinar-registration) for details.
- **page_size** (`query`) `integer` — The number of records returned within a single API call. · default: `30`
- **page_number** (`query`) `integer` — **Deprecated** This field will be deprecated. We will no longer support this field in a future release. Instead, use the `next_page_token` for pagination. · default: `1`
- **next_page_token** (`query`) `string` — Use the next page token to paginate through large result sets. A next page token is returned whenever the set of available results exceeds the current page size. This token's expiration period is 15 minutes.

### Respuestas

**`200`** — **HTTP Status Code:** `200` Webinar plan subscription is missing. Enable webinar for this user once the subscription is added:{userId}.

- **next_page_token** `string` — Use the next page token to paginate through large result sets. A next page token is returned whenever the set of available results exceeds the current page size. This token's expiration period is 15 minutes.
- **page_count** `integer` — The number of pages returned for the request made.
- **page_number** `integer` — **Deprecated** This field will be deprecated. We will no longer support this field in a future release. Instead, use `next_page_token` for pagination. · default: `1`
- **page_size** `integer` — The number of records returned with a single API call. · default: `30`
- **total_records** `integer` — The total number of all the records available across pages.
- **registrants** `object | object | object[]` — List of registrant objects.
  - `array` de:
    - **id** `string` — Registrant ID.
    - **address** `string` — The registrant's address.
    - **city** `string` — The registrant's city.
    - **comments** `string` — The registrant's questions and comments.
    - **country** `string` — The registrant's two-letter ISO [country code](https://developers.zoom.us/docs/api/rest/other-references/abbreviation-lists/#countries).
    - **custom_questions** `object[]` — Information about custom questions.
      - `array` de:
        - **title** `string` — The title of the custom question.
        - **value** `string` — The custom question's response value. This has a limit of 128 characters.
    - **email** `string` _requerido_ — The registrant's email address. See [Email address display rules](https://developers.zoom.us/docs/api/rest/using-zoom-apis/#email-address-display-rules) for return value details. · formato: `email`
    - **first_name** `string` _requerido_ — The registrant's first name.
    - **industry** `string` — The registrant's industry.
    - **job_title** `string` — The registrant's job title.
    - **last_name** `string` — The registrant's last name.
    - **no_of_employees** `string` — The registrant's number of employees. * `1-20` * `21-50` * `51-100` * `101-250` * `251-500` * `501-1,000` * `1,001-5,000` * `5,001-10,000` * `More than 10,000` · valores: ``, `1-20`, `21-50`, `51-100`, `101-250`, `251-500`, `501-1,000`, `1,001-5,000`, `5,001-10,000`, `More than 10,000`
    - **org** `string` — The registrant's organization.
    - **phone** `string` — The registrant's phone number.
    - **purchasing_time_frame** `string` — The registrant's purchasing time frame. * `Within a month.` * `1-3 months.` * `4-6 months.` * `More than 6 months.` * `No timeframe.` · valores: ``, `Within a month`, `1-3 months`, `4-6 months`, `More than 6 months`, `No timeframe`
    - **role_in_purchase_process** `string` — The registrant's role in the purchase process. * `Decision maker` * `Evaluator/Recommender.` * `Influencer.` * `Not involved.` · valores: ``, `Decision Maker`, `Evaluator/Recommender`, `Influencer`, `Not involved`
    - **state** `string` — The registrant's state or province.
    - **status** `string` — The registrant's status. * `approved` - Registrant is approved. * `denied` - Registrant is denied. * `pending` - Registrant is waiting for approval. · valores: `approved`, `denied`, `pending`
    - **zip** `string` — The registrant's ZIP or postal code.
    - **create_time** `string` — The time when the registrant registered. · formato: `date-time`
    - **join_url** `string` — The URL that an approved registrant can use to join the meeting or webinar. · formato: `string`
    - **status** `string` — The status of the registrant's registration. `approved` - User has been successfully approved for the webinar. `pending` - The registration is still pending. `denied` - User has been denied from joining the webinar.

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `200` <br> No permission. <br> **Error Code:** `200` <br> Webinar plan is missing. You must subscribe to the webinar plan and enable webinars for this user in order to perform this action. <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `3001` <br> Webinar does not exist: {webinarId}. <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](https://developers.zoom.us/docs/api/rest/rate-limits/).

---

## `POST /webinars/{webinarId}/registrants`

**Add a webinar registrant**

Create and submit a user's registration for a webinar. Zoom users with a [Webinar plan](https://zoom.us/webinar) have access to creating and managing webinars. Webinars allow hosts to broadcast a Zoom meeting to up to 10,000 attendees. Scheduling a [webinar with registration](https://support.zoom.us/hc/en-us/articles/204619915-Scheduling-a-Webinar-with-Registration) requires your registrants to complete a brief form before receiving the link to join the webinar. **Prerequisites:** * A Pro or higher plan with the Webinar add-on. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:write:admin`,`webinar:write` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:write:registrant`,`webinar:write:registrant:admin` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `LIGHT`

`operationId`: `webinarRegistrantCreate` · tags: `Webinars` · seguridad: `openapi_authorization`

### Parámetros

- **webinarId** (`path`) `integer` _requerido_ — The webinar's ID.
- **occurrence_ids** (`query`) `string` — A comma-separated list of webinar occurrence IDs. Get this value with the [Get a webinar](/docs/api/rest/reference/zoom-api/methods/#operation/webinar) API. Make sure the `registration_type` is 3 if updating multiple occurrences with this API.

### Request body — `application/json`

- **first_name** `string` _requerido_ — The registrant's first name.
- **last_name** `string` — The registrant's last name.
- **email** `string` _requerido_ — The registrant's email address. · formato: `email`
- **address** `string` — The registrant's address.
- **city** `string` — The registrant's city.
- **state** `string` — The registrant's state or province.
- **zip** `string` — The registrant's ZIP or postal code.
- **country** `string` — The registrant's two-letter [country code](https://developers.zoom.us/docs/api/rest/other-references/abbreviation-lists/#countries).
- **phone** `string` — The registrant's phone number.
- **comments** `string` — The registrant's questions and comments.
- **custom_questions** `object[]` — Information about custom questions.
  - `array` de:
    - **title** `string` — The custom question's title.
    - **value** `string` — The custom question's response value. This has a limit of 128 characters.
- **industry** `string` — The registrant's industry.
- **job_title** `string` — The registrant's job title.
- **no_of_employees** `string` — The registrant's number of employees: * `1-20` * `21-50` * `51-100` * `101-500` * `500-1,000` * `1,001-5,000` * `5,001-10,000` * `More than 10,000` · valores: ``, `1-20`, `21-50`, `51-100`, `101-500`, `500-1,000`, `1,001-5,000`, `5,001-10,000`, `More than 10,000`
- **org** `string` — The registrant's organization.
- **purchasing_time_frame** `string` — The registrant's purchasing time frame: * `Within a month` * `1-3 months` * `4-6 months` * `More than 6 months` * `No timeframe` · valores: ``, `Within a month`, `1-3 months`, `4-6 months`, `More than 6 months`, `No timeframe`
- **role_in_purchase_process** `string` — The registrant's role in the purchase process: * `Decision Maker` * `Evaluator/Recommender` * `Influencer` * `Not involved` · valores: ``, `Decision Maker`, `Evaluator/Recommender`, `Influencer`, `Not involved`
- **language** `string` — Specifies the registrant's preferred language for the confirmation email sent upon successful registration. **Note** This field is only effective if the webinar's 'Select Email Language' setting is set to 'Same as recipients' default language' in the Zoom web portal. If a fixed language is selected, this value will be ignored. **Supported values** * `en-US` - English (US) * `de-DE` - German (Germany) * `es-ES` - Spanish (Spain) * `fr-FR` - French (France) * `jp-JP` - Japanese * `pt-PT` - Portuguese (Portugal) * `ru-RU` - Russian * `zh-CN` - Chinese (PRC) * `zh-TW` - Chinese (Taiwan) * `ko-KO` - Korean * `it-IT` - Italian (Italy) * `vi-VN` - Vietnamese * `pl-PL` - Polish * `Tr-TR` - Turkish · valores: `en-US`, `de-DE`, `es-ES`, `fr-FR`, `jp-JP`, `pt-PT`, `ru-RU`, `zh-CN`, `zh-TW`, `ko-KO`, `it-IT`, `vi-VN`, `pl-PL`, `Tr-TR`
- **source_id** `string` — The tracking source's unique identifier.

### Respuestas

**`201`** — **HTTP Status Code:** `201` Webinar registration created.

- **id** `integer` — The webinar's ID. · formato: `int64`
- **join_url** `string` — The URL the registrant can use to join the webinar.
- **registrant_id** `string` — The registrant's ID.
- **start_time** `string` — The webinar's start time. · formato: `date-time`
- **topic** `string` — The webinar's topic.
- **status** `string` — The registrant's approval status. * `approved` — The registrant is approved and can access the webinar or on-demand recording. * `pending` — The registrant is waiting for host approval. · valores: `approved`, `pending`
- **share_url** `string` — The recording share URL. Only returned for ended on-demand webinars when the registrant is approved. Not returned when the status is `pending`.
- **occurrences** `object[]` — Array of occurrence objects.
  - `array` de:
    - **duration** `integer` — Duration.
    - **occurrence_id** `string` — Occurrence ID: Unique identifier that identifies an occurrence of a recurring webinar. [Recurring webinars](https://support.zoom.us/hc/en-us/articles/216354763-How-to-Schedule-A-Recurring-Webinar) can have a maximum of 50 occurrences.
    - **start_time** `string` — Start time. · formato: `date-time`
    - **status** `string` — Occurrence status.

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `3000` <br> This webinar does not have registration as required: {webinarId}. <br> **Error Code:** `3027` <br> Host cannot register. <br> **Error Code:** `3034` <br> If you have been invited, please input your work email address. <br> **Error Code:** `3038` <br> Webinar is over, you cannot register now. If you have any questions, contact the webinar host. <br> **Error Code:** `3000` <br> You have reached the limit for the number of attendees you can add. Contact Zoom Support for more information. <br> **Error Code:** `3000` <br> The Zoom REST API does not support paid registration. <br> **Error Code:** `3000` <br> You have been invited as a panelist for the webinar, please check your email to find more information about this webinar. <br> **Error Code:** `200` <br> No permission. <br> **Error Code:** `200` <br> Webinar plan is missing. You must subscribe to the webinar plan and enable webinars for this user in order to perform this action. <br> **Error Code:** `300` <br> Invalid webinar ID. <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `3001` <br> Webinar does not exist: {webinarId}. <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](https://developers.zoom.us/docs/api/rest/rate-limits/).

---

## `GET /webinars/{webinarId}/registrants/questions`

**List registration questions**

List registration questions and fields that are to be answered by users while registering for a webinar. Scheduling a [webinar with registration](https://support.zoom.us/hc/en-us/articles/204619915-Scheduling-a-Webinar-with-Registration) requires your registrants to complete a brief form with fields and questions before they can receive the link to join the webinar. **Prerequisites:** * Pro or higher plan with the webinar add-on. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:read` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:list_registration_questions`,`webinar:read:list_registration_questions:admin` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `LIGHT`

`operationId`: `webinarRegistrantsQuestionsGet` · tags: `Webinars` · seguridad: `openapi_authorization`

### Parámetros

- **webinarId** (`path`) `integer` _requerido_ — The webinar's ID.

### Respuestas

**`200`** — **HTTP Status Code:** `200` Webinar registrant question object returned.

- **custom_questions** `object[]` — Array of Registrant Custom Questions.
  - `array` de:
    - **answers** `string[]` — An array of answer choices. Can't be used for short answer type.
      - `array` de:
    - **required** `boolean` — State whether or not the custom question is required to be answered by a registrant.
    - **title** `string` — Custom question.
    - **type** `string` — The question-answer type. · valores: `short`, `single_radio`, `single_dropdown`, `multiple`
- **questions** `object[]` — Array of registration fields whose values should be provided by registrants during registration.
  - `array` de:
    - **field_name** `string` — Field name · valores: `last_name`, `address`, `city`, `country`, `zip`, `state`, `phone`, `industry`, `org`, `job_title`, `purchasing_time_frame`, `role_in_purchase_process`, `no_of_employees`, `comments`
    - **required** `boolean` — State whether the selected fields are required or optional.

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `300` <br> Invalid webinar ID. <br> **Error Code:** `200` <br> Webinar plan is missing. You must subscribe to the webinar plan and enable webinars for this user in order to perform this action. <br> **Error Code:** `3000` <br> Registration has not been enabled for this webinar: {webinarId}. <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `3001` <br> Webinar does not exist: {webinarId}. <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests For more information, see [rate limits](https://developers.zoom.us/docs/api/rest/rate-limits/).

---

## `PATCH /webinars/{webinarId}/registrants/questions`

**Update registration questions**

Update registration questions and fields of a scheduled webinar for users to answer during webinar registration. Scheduling a [webinar with registration](https://support.zoom.us/hc/en-us/articles/204619915-Scheduling-a-Webinar-with-Registration) requires your registrants to complete a brief form with fields and questions before they can receive the link to join the webinar. **Prerequisites:** * Pro or higher plan with a Webinar Add-on. * Registration option for Webinar should be set as required to use this API. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:write:admin`,`webinar:write` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:update:registration_question`,`webinar:update:registration_question:admin` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `LIGHT`

`operationId`: `webinarRegistrantQuestionUpdate` · tags: `Webinars` · seguridad: `openapi_authorization`

### Parámetros

- **webinarId** (`path`) `integer` _requerido_ — The webinar's ID.

### Request body — `application/json`

- **custom_questions** `object[]` — Array of custom questions for registrants.
  - `array` de:
    - **answers** `string[]` — An array of answer choices. Can't be used for short answer type.
      - `array` de:
    - **required** `boolean` — State whether or not a registrant is required to answer the custom question.
    - **title** `string` — Custom question.
    - **type** `string` — The question-answer type. · valores: `short`, `single_radio`, `single_dropdown`, `multiple`
- **questions** `object[]` — Array of registration fields whose values should be provided by registrants.
  - `array` de:
    - **field_name** `string` — Field name · valores: `last_name`, `address`, `city`, `country`, `zip`, `state`, `phone`, `industry`, `org`, `job_title`, `purchasing_time_frame`, `role_in_purchase_process`, `no_of_employees`, `comments`
    - **required** `boolean` — State whether the selected fields are required or optional.

### Respuestas

**`204`** — **HTTP Status Code:** `204` Webinar registrant questions updated.

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `300` <br> Invalid webinar ID. <br> **Error Code:** `200` <br> No permission. <br> **Error Code:** `200` <br> Webinar plan is missing. You must subscribe to the webinar plan and enable webinars for this user in order to perform this action. <br> **Error Code:** `3000` <br> Registration has not been enabled for this webinar: {webinarId}. <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `3001` <br> Webinar does not exist: {webinarId}. <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](https://developers.zoom.us/docs/api/rest/rate-limits/).

---

## `PUT /webinars/{webinarId}/registrants/status`

**Update registrant's status**

Update webinar registrants' registration status. You can approve or deny a registrant, or revoke a registrant's approval. **Prerequisites** * A Pro or higher plan with a [Webinar plan](https://zoom.us/webinar) add-on. This API has an additional rate limit of requests per registrant, per 24-hour period. [See the Rate Limits page](/docs/api/rate-limits/) for more information. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:write:admin`,`webinar:write` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:update:registrant_status`,`webinar:update:registrant_status:admin` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `MEDIUM`

`operationId`: `webinarRegistrantStatus` · tags: `Webinars` · seguridad: `openapi_authorization`

### Parámetros

- **webinarId** (`path`) `integer` _requerido_ — The webinar's ID.
- **occurrence_id** (`query`) `string` — The meeting or webinar occurrence ID.

### Request body — `application/json`

- **action** `string` _requerido_ — The registration action to perform. * `approve` - Approve the registrant. * `deny` - Reject the registrant. * `cancel` - Cancel the registrant's approval. · valores: `approve`, `deny`, `cancel`
- **registrants** `object[]` — The registrant information.
  - `array` de:
    - **email** `string` — The registrant's email address. · formato: `email`
    - **id** `string` — The registrant's ID.

### Respuestas

**`204`** — **HTTP Status Code:** `204` <br> Registrant status updated.

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `3035` <br> Webinar has reached maximum attendee capacity. <br> **Error Code:** `300` <br> Invalid webinar ID. <br> **Error Code:** `200` <br> No permission. <br> **Error Code:** `200` <br> Webinar plan is missing. You must subscribe to the webinar plan and enable webinars for this user in order to perform this action. <br> **Error Code:** `300` <br> Registration has not been enabled for this meeting: {webinarId}. <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `3001` <br> Webinar does not exist: {webinarId}. <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](https://developers.zoom.us/docs/api/rest/rate-limits/).

---

## `DELETE /webinars/{webinarId}/registrants/{registrantId}`

**Delete a webinar registrant**

Delete a webinar registrant. **Prerequisites** * A Pro or higher plan with a [Webinar plan](https://zoom.us/webinar) add-on. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:write:admin`,`webinar:write` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:delete:registrant`,`webinar:delete:registrant:admin` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `LIGHT`

`operationId`: `deleteWebinarRegistrant` · tags: `Webinars` · seguridad: `openapi_authorization`

### Parámetros

- **webinarId** (`path`) `integer` _requerido_ — The webinar ID.
- **registrantId** (`path`) `string` _requerido_ — The registrant ID.
- **occurrence_id** (`query`) `string` — The webinar occurrence ID.

### Respuestas

**`204`** — **HTTP status code:** `204` OK

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `200` <br> Webinar plan is missing. You must subscribe to the webinar plan and enable webinars for this user in order to perform this action. <br> **Error Code:** `300` <br> The value that you entered for the Registrant ID field is invalid. Enter a valid value and try again. <br> **Error Code:** `3000` <br> Registration has not been enabled for this webinar: {webinarId}. <br> **Error Code:** `3000` <br> Registrant {registrantId} was not found. <br> **Error Code:** `200` <br> No permission. <br> **Error Code:** `300` <br> Invalid webinar ID. <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `3001` <br> Webinar does not exist: {webinarId}. <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](https://developers.zoom.us/docs/api/rest/rate-limits/).

---

## `GET /webinars/{webinarId}/registrants/{registrantId}`

**Get a webinar registrant**

Zoom users with a [webinar plan](https://zoom.us/webinar) have access to creating and managing webinars. The webinar feature lets a host broadcast a Zoom meeting to up to 10,000 attendees. Scheduling a [webinar with registration](https://support.zoom.us/hc/en-us/articles/204619915-Scheduling-a-Webinar-with-Registration) requires your registrants to complete a brief form before receiving the link to join the webinar. Use this API to get details on a specific user who has registered for the webinar. **Prerequisites:** * The account must have a webinar plan. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:read` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:registrant`,`webinar:read:registrant:admin` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `LIGHT`

`operationId`: `webinarRegistrantGet` · tags: `Webinars` · seguridad: `openapi_authorization`

### Parámetros

- **webinarId** (`path`) `integer` _requerido_ — The webinar's ID.
- **registrantId** (`path`) `string` _requerido_ — The registrant ID.
- **occurrence_id** (`query`) `string` — The meeting or webinar occurrence ID.

### Respuestas

**`200`** — Success.

- **id** `string`
- **address** `string` — The registrant's address.
- **city** `string` — The registrant's city.
- **comments** `string` — The registrant's questions and comments.
- **country** `string` — The registrant's two-letter ISO [country code](https://developers.zoom.us/docs/api/rest/other-references/abbreviation-lists/#countries).
- **custom_questions** `object[]` — Information about custom questions.
  - `array` de:
    - **title** `string` — The title of the custom question.
    - **value** `string` — The custom question's response value. This has a limit of 128 characters.
- **email** `string` _requerido_ — The registrant's email address. See [Email address display rules](https://developers.zoom.us/docs/api/rest/using-zoom-apis/#email-address-display-rules) for return value details. · formato: `email`
- **first_name** `string` _requerido_ — The registrant's first name.
- **industry** `string` — The registrant's industry.
- **job_title** `string` — The registrant's job title.
- **last_name** `string` — The registrant's last name.
- **no_of_employees** `string` — The registrant's number of employees: * `1-20` * `21-50` * `51-100` * `101-250` * `251-500` * `501-1,000` * `1,001-5,000` * `5,001-10,000` * `More than 10,000` · valores: ``, `1-20`, `21-50`, `51-100`, `101-250`, `251-500`, `501-1,000`, `1,001-5,000`, `5,001-10,000`, `More than 10,000`
- **org** `string` — The registrant's organization.
- **phone** `string` — The registrant's phone number.
- **purchasing_time_frame** `string` — The registrant's purchasing time frame: * `Within a month` * `1-3 months` * `4-6 months` * `More than 6 months` * `No timeframe` · valores: ``, `Within a month`, `1-3 months`, `4-6 months`, `More than 6 months`, `No timeframe`
- **role_in_purchase_process** `string` — The registrant's role in the purchase process: * `Decision Maker` * `Evaluator/Recommender` * `Influencer` * `Not involved` · valores: ``, `Decision Maker`, `Evaluator/Recommender`, `Influencer`, `Not involved`
- **state** `string` — The registrant's state or province.
- **status** `string` — The registrant's status: * `approved` &mdash; Registrant is approved. * `denied` &mdash; Registrant is denied. * `pending` &mdash; Registrant is waiting for approval. · valores: `approved`, `denied`, `pending`
- **share_url** `string` — The recording share URL. Only returned for ended on-demand webinars when the registrant is approved. Not returned when the status is `pending`.
- **zip** `string` — The registrant's ZIP or postal code.
- **language** `string` — The registrant's language preference for confirmation emails: * `en-US` &mdash; English (US) * `de-DE` &mdash; German (Germany) * `es-ES` &mdash; Spanish (Spain) * `fr-FR` &mdash; French (France) * `jp-JP` &mdash; Japanese * `pt-PT` &mdash; Portuguese (Portugal) * `ru-RU` &mdash; Russian * `zh-CN` &mdash; Chinese (PRC) * `zh-TW` &mdash; Chinese (Taiwan) * `ko-KO` &mdash; Korean * `it-IT` &mdash; Italian (Italy) * `vi-VN` &mdash; Vietnamese * `pl-PL` &mdash; Polish * `Tr-TR` &mdash; Turkish · valores: `en-US`, `de-DE`, `es-ES`, `fr-FR`, `jp-JP`, `pt-PT`, `ru-RU`, `zh-CN`, `zh-TW`, `ko-KO`, `it-IT`, `vi-VN`, `pl-PL`, `Tr-TR`
- **create_time** `string` · formato: `date-time`
- **join_url** `string` · formato: `string`
- **status** `string`

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `300` <br> Invalid webinar ID. <br> **Error Code:** `200` <br> No permission. <br> **Error Code:** `200` <br> Webinar plan is missing. You must subscribe to the webinar plan and enable webinars for this user in order to perform this action. <br> **Error Code:** `3000` <br> Registration has not been enabled for this webinar: {webinarId}. <br> **Error Code:** `3079` <br> This registrant does not exist: {registrantId}. <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `3001` <br> Webinar does not exist: {webinarId}. <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](https://developers.zoom.us/docs/api/rest/rate-limits/).

---

## `PUT /webinars/{webinarId}/status`

**Update webinar status**

Update a webinar's status. Use this API to end an ongoing webinar. **Prerequisites:** * The account must hold a valid [Webinar plan](https://zoom.us/webinar). **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:write:admin`,`webinar:write` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:update:status`,`webinar:update:status:admin` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `LIGHT`

`operationId`: `webinarStatus` · tags: `Webinars` · seguridad: `openapi_authorization`

### Parámetros

- **webinarId** (`path`) `integer` _requerido_ — The webinar's ID.

### Request body — `application/json`

- **action** `string` · valores: `end`

### Respuestas

**`200`** — Webinar plan subscription is missing. Enable webinar for this user once the subscription is added: {userId}.

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `3063` <br> You can not end an on-premise user's meeting: {webinarId} using this API. <br> **Error Code:** `300` <br> Invalid webinar ID. <br> **Error Code:** `200` <br> No permission. <br> **Error Code:** `200` <br> Webinar plan is missing. You must subscribe to the webinar plan and enable webinars for this user in order to perform this action. <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `3001` <br> Webinar does not exist: {webinarId}. <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](https://developers.zoom.us/docs/api/rest/rate-limits/).

---

## `GET /webinars/{webinarId}/tracking_sources`

**Get webinar tracking sources**

[Webinar Registration Tracking Sources](https://support.zoom.us/hc/en-us/articles/360000315683-Webinar-Registration-Source-Tracking) allow you to see where your registrants are coming from if you share the webinar registration page in multiple platforms. You can then use the source tracking to see the number of registrants generated from each platform. Use this API to list information on all the tracking sources of a Webinar. **Prerequisites**: * [Webinar license](https://zoom.us/webinar). * Registration must be required for the Webinar. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:read` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:list_tracking_sources`,`webinar:read:list_tracking_sources:admin` **[Rate Limit Label](https://developers.zoom.us/docs/api/rate-limits/):** `MEDIUM`

`operationId`: `getTrackingSources` · tags: `Webinars` · seguridad: `openapi_authorization`

### Parámetros

- **webinarId** (`path`) `integer` _requerido_ — The webinar's ID.

### Respuestas

**`200`** — **HTTP Status Code:** `200`

- **total_records** `integer` — The total number of registration records for this Webinar.
- **tracking_sources** `object[]` — Tracking Sources object.
  - `array` de:
    - **id** `string` — Unique Identifier of the tracking source.
    - **registration_count** `integer` — Number of registrations made from this source.
    - **source_name** `string` — Name of the source (platform) where the registration URL was shared.
    - **tracking_url** `string` — Tracking URL. The URL that was shared for the registration.
    - **visitor_count** `integer` — Number of visitors who visited the registration page from this source.

**`400`** — **HTTP Status Code:** `400` <br> Bad Request **Error Code:** `300` <br> Invalid webinar ID. <br> **Error Code:** `200` <br> No permission. <br> **Error Code:** `200` <br> Webinar plan is missing. You must subscribe to the webinar plan and enable webinars for this user in order to perform this action. <br>

**`404`** — **HTTP Status Code:** `404` <br> Not Found **Error Code:** `3001` <br> Webinar does not exist: {webinarId}. <br>

**`429`** — **HTTP Status Code:** `429` <br> Too Many Requests. For more information, see [rate limits](https://developers.zoom.us/docs/api/rest/rate-limits/).
