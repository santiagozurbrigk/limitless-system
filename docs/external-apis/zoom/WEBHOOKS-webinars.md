---
title: "Zoom Meetings webhooks (recorte para Limitless)"
source: "https://developers.zoom.us/api/zoap/meetings/events/"
capturado: "2026-11-23"
---

# Zoom Meetings — eventos de webhook de webinars (y de reunión equivalentes)

Recorte del spec oficial de eventos [`openapi/meetings-events.json`](./openapi/meetings-events.json): todos los `webinar.*` y los `meeting.*` de inicio, fin, participantes y registro. Verificación de firma y validación del endpoint: [`guias/api/webhooks.md`](./guias/api/webhooks.md).

- Versión declarada: `1.0.0`
- Server: `https://{your-endpoint-url}`
- Spec original: [`https://developers.zoom.us/api/zoap/meetings/events/`](https://developers.zoom.us/api/zoap/meetings/events/)

## Descripción del proveedor

The Zoom Meeting webhooks allow developers to receive events for Zoom Meetings and Webinars.

## Eventos de webhook

| Evento | Método | Qué lo dispara |
| --- | --- | --- |
| `meeting.ended` | `POST` | meeting.ended |
| `meeting.participant_joined` | `POST` | meeting.participant_joined |
| `meeting.participant_left` | `POST` | meeting.participant_left |
| `meeting.registration_approved` | `POST` | meeting.registration_approved |
| `meeting.registration_cancelled` | `POST` | meeting.registration_cancelled |
| `meeting.registration_created` | `POST` | meeting.registration_created |
| `meeting.started` | `POST` | meeting.started |
| `webinar.alert` | `POST` | webinar.alert |
| `webinar.chat_message_file_downloaded` | `POST` | webinar.chat_message_file_downloaded |
| `webinar.chat_message_file_sent` | `POST` | webinar.chat_message_file_sent |
| `webinar.chat_message_sent` | `POST` | webinar.chat_message_sent |
| `webinar.converted_to_meeting` | `POST` | webinar.converted_to_meeting |
| `webinar.created` | `POST` | webinar.created |
| `webinar.deleted` | `POST` | webinar.deleted |
| `webinar.ended` | `POST` | webinar.ended |
| `webinar.participant_bind` | `POST` | webinar.participant_bind |
| `webinar.participant_data_connection_established` | `POST` | webinar.participant_data_connection_established |
| `webinar.participant_feedback` | `POST` | webinar.participant_feedback |
| `webinar.participant_joined` | `POST` | webinar.participant_joined |
| `webinar.participant_left` | `POST` | webinar.participant_left |
| `webinar.participant_role_changed` | `POST` | webinar.participant_role_changed |
| `webinar.permanently_deleted` | `POST` | webinar.permanently_deleted |
| `webinar.recovered` | `POST` | webinar.recovered |
| `webinar.registration_approved` | `POST` | webinar.registration_approved |
| `webinar.registration_cancelled` | `POST` | webinar.registration_cancelled |
| `webinar.registration_created` | `POST` | webinar.registration_created |
| `webinar.registration_denied` | `POST` | webinar.registration_denied |
| `webinar.sharing_ended` | `POST` | webinar.sharing_ended |
| `webinar.sharing_started` | `POST` | webinar.sharing_started |
| `webinar.started` | `POST` | webinar.started |
| `webinar.updated` | `POST` | webinar.updated |

---

## `POST meeting.ended`

**meeting.ended**

The **End Meeting** event is triggered every time a meeting host ends the meeting. The host must be a user in your account or a user in any other accounts that have installed your [webhook-enabled](https://marketplace.zoom.us/docs/api-reference/webhook-reference#enable-webhooks) app. ## Prerequisites * Enable **Event Subscriptions** for your [Marketplace app](https://marketplace.zoom.us/user/build) with: * A valid **Event Notification Endpoint URL**. * The **End Meeting** subscription enabled under the **Meeting** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `meeting:read:admin`,`meeting:write:admin`,`meeting:read`,`meeting:write`,`meeting:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `meeting:read:meeting:master`,`meeting:read:meeting`,`meeting:read:meeting:admin`

`operationId`: `Meeting.endedWebhook` · tags: `Meetings`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The name of the event.
- **event_ts** `integer` _requerido_ — A timestamp at which the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who created the meeting.
  - **object** `object` _requerido_ — Information about the meeting.
    - **id** `string` _requerido_ — The meeting ID.
    - **uuid** `string` _requerido_ — The meeting's universally unique identifier (UUID). Each meeting instance generates a meeting UUID.
    - **host_id** `string` _requerido_ — The meeting host's user ID.
    - **host_email** `string` _requerido_ — The meeting host's email address. · formato: `email`
    - **topic** `string` _requerido_ — The meeting's topic.
    - **type** `integer` _requerido_ — The meeting type. * `0` - A prescheduled meeting. * `1` - An instant meeting. * `2` - A scheduled meeting. * `3` - A recurring meeting with no fixed time. * `4` - A [personal meeting room](https://support.zoom.us/hc/en-us/articles/201362843). * `7` - A [PAC (Personal Audio Conference)](https://support.zoom.us/hc/en-us/articles/205172455-Hosting-a-Personal-Audio-Conference-PAC-meeting) meeting. * `8` - A recurring meeting with a fixed time. · valores: `0`, `1`, `2`, `3`, `4`, `7`, `8`
    - **start_time** `string` _requerido_ — The meeting's start time. · formato: `date-time`
    - **timezone** `string` — The meeting's [timezone](https://marketplace.zoom.us/docs/api-reference/other-references/abbreviation-lists#timezones).
    - **duration** `integer` _requerido_ — The scheduled meeting duration.
    - **custom_keys** `object[]` — Custom key-value pairs associated with the meeting.
      - `array` de:
        - **key** `string` — The custom field's name.
        - **value** `string` — The custom field's value.
    - **end_time** `string` _requerido_ — The date and time at which the meeting ended. · formato: `date-time`

```json
{
  "event": "meeting.ended",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "object": {
      "id": "1234567890",
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "host_id": "x1yCzABCDEfg23HiJKl4mN",
      "host_email": "jchill@example.com",
      "topic": "My Meeting",
      "type": 3,
      "start_time": "2021-07-13T21:44:51Z",
      "timezone": "America/Los_Angeles",
      "duration": 60,
      "custom_keys": [
        {
          "key": "appointment_id",
          "value": "APT-12345"
        }
      ],
      "end_time": "2021-07-13T23:00:51Z"
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST meeting.participant_joined`

**meeting.participant_joined**

The **Participant or Host joined meeting** event is triggered every time an attendee joins a meeting. A meeting attendee is a meeting participant or the host. The meeting host must be a user in your account or a user in any other accounts that have installed your [webhook-enabled](https://developers.zoom.us/docs/api/rest/webhook-reference/#enable-webhooks) app. ## Prerequisites * Enable **Event Subscriptions** for your [Marketplace app](https://marketplace.zoom.us/user/build) with: * A valid **Event Notification Endpoint URL**. * The **Participant or Host joined meeting** subscription enabled under the **Meeting** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `meeting:read:admin`,`meeting:write:admin`,`meeting:read`,`meeting:write`,`meeting:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `meeting:read:participant:master`,`meeting:read:participant`,`meeting:read:participant:admin`

`operationId`: `Meeting.participant_joinedWebhook` · tags: `Meetings`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The event's name.
- **event_ts** `integer` _requerido_ — A timestamp when the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who created the meeting.
  - **object** `object` _requerido_ — Information about the meeting.
    - **id** `string` — The meeting ID.
    - **uuid** `string` _requerido_ — The meeting's universally unique identifier (UUID). Each meeting instance generates a meeting UUID.
    - **host_id** `string` _requerido_ — The meeting host's user ID.
    - **topic** `string` — The meeting's topic.
    - **type** `integer` _requerido_ — The meeting type. * `0` - A prescheduled meeting. * `1` - An instant meeting. * `2` - A scheduled meeting. * `3` - A recurring meeting with no fixed time. * `4` - A [personal meeting room](https://support.zoom.us/hc/en-us/articles/201362843). * `7` - A [PAC (Personal Audio Conference)](https://support.zoom.us/hc/en-us/articles/205172455-Hosting-a-Personal-Audio-Conference-PAC-meeting) meeting. * `8` - A recurring meeting with a fixed time. · valores: `0`, `1`, `2`, `3`, `4`, `7`, `8`
    - **start_time** `string` — The meeting's start time.
    - **timezone** `string` — The meeting's [timezone](https://developers.zoom.us/docs/api/rest/other-references/abbreviation-lists/#timezones).
    - **duration** `integer` _requerido_ — The scheduled meeting duration.
    - **custom_keys** `object[]` — Custom key-value pairs associated with the meeting.
      - `array` de:
        - **key** `string` — The name of the custom field.
        - **value** `string` — The value of the custom field.
    - **participant** `object` _requerido_ — Information about the meeting participant. If the participant is **not** part of the host's account, `email` returns an empty string value, with some exceptions. See [Email address display rules](https://developers.zoom.us/docs/api/rest/using-zoom-apis/#email-address-display-rules) for details.
      - **user_id** `string` _requerido_ — The participant's meeting user ID. This value is assigned to a participant when they join a meeting, and is only valid for the duration of the meeting.
      - **user_name** `string` _requerido_ — The participant's display name.
      - **id** `string` — The participant's universally unique ID (UUID). * If the participant joins the meeting by logging into Zoom, this value is the `id` value in the [**Get a user**](/api-reference/zoom-api/methods#operation/user) API response. * If the participant joins the meeting **without** logging into Zoom, this returns an empty string value. This value returns blank for external users. **Note:** Use the `participant_user_id` value instead of this value. We will remove this response in a future release.
      - **participant_uuid** `string` — The participant's UUID for this specific meeting and any breakout rooms created in this meeting. This value is assigned to a participant when they join a meeting, and is only valid for the duration of that meeting.
      - **join_time** `string` _requerido_ — The time when the participant joined the meeting. · formato: `date-time`
      - **email** `string` _requerido_ — The participant's email address. This response only returns if the participant joined the meeting by logging into Zoom. If the participant is **not** part of the host's account, this returns an empty string value, with some exceptions. See [Email address display rules](https://developers.zoom.us/docs/api/rest/using-zoom-apis/#email-address-display-rules) for details. · formato: `email`
      - **registrant_id** `string` — The participant's registrant ID. A host or a user with administrative permissions can require [registration for Zoom meetings](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0065026).
      - **participant_user_id** `string` — The participant's universally unique ID (UUID). * If the participant joins the meeting by logging into Zoom, this value is the `id` value in the [**Get a user**](/api-reference/zoom-api/methods#operation/user) API response. * If the participant joins the meeting **without** logging into Zoom, this returns an empty string value. This value returns blank for external users.
      - **customer_key** `string` — The participant's SDK identifier. This value can be alphanumeric.
      - **phone_number** `string` — Phone number of participant joined via PSTN.

```json
{
  "event": "meeting.participant_joined",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "object": {
      "id": "1234567890",
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "host_id": "x1yCzABCDEfg23HiJKl4mN",
      "topic": "My Meeting",
      "type": 8,
      "start_time": "2021-07-13T21:44:51Z",
      "timezone": "America/Los_Angeles",
      "duration": 60,
      "custom_keys": [
        {
          "key": "appointment_id",
          "value": "APT-12345"
        }
      ],
      "participant": {
        "user_id": "1234567890",
        "user_name": "Jill Chill",
        "id": "iFxeBPYun6SAiWUzBcEkX",
        "participant_uuid": "55555AAAiAAAAAiAiAiiAii",
        "date_time": "2021-07-13T21:44:51Z",
        "email": "jchill@example.com",
        "registrant_id": "abcdefghij0-klmnopq23456",
        "participant_user_id": "rstuvwxyza789-cde",
        "customer_key": "349589LkJyeW",
        "phone_number": "8615250064084"
      }
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST meeting.participant_left`

**meeting.participant_left**

The **Participant/Host left meeting** event is triggered every time an attendee leaves a meeting. A meeting attendee is a meeting participant or the host. The meeting host must be a user in your account or a user in any other accounts that have installed your [webhook-enabled](https://marketplace.zoom.us/docs/api-reference/webhook-reference#enable-webhooks) app. ## Prerequisites * Enable **Event Subscriptions** for your [Marketplace app](https://marketplace.zoom.us/user/build) with these configurations: * A valid **Event Notification Endpoint URL**. * The **Participant/Host left meeting** subscription enabled under the **Meeting** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `meeting:read:admin`,`meeting:write:admin`,`meeting:read`,`meeting:write`,`meeting:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `meeting:read:participant:master`,`meeting:read:participant`,`meeting:read:participant:admin`

`operationId`: `Meeting.participant_leftWebhook` · tags: `Meetings`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The event's name.
- **event_ts** `integer` _requerido_ — A timestamp when the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who created the meeting.
  - **object** `object` _requerido_ — Information about the meeting.
    - **id** `string` _requerido_ — The meeting ID.
    - **uuid** `string` _requerido_ — The meeting's universally unique identifier (UUID). Each meeting instance generates a meeting UUID.
    - **host_id** `string` _requerido_ — The meeting host's user ID.
    - **topic** `string` _requerido_ — The meeting's topic.
    - **type** `integer` _requerido_ — The meeting type: * `0` — A prescheduled meeting. * `1` — An instant meeting. * `2` — A scheduled meeting. * `3` — A recurring meeting with no fixed time. * `4` — A [personal meeting room](https://support.zoom.us/hc/en-us/articles/201362843). * `7` — A [PAC (Personal Audio Conference)](https://support.zoom.us/hc/en-us/articles/205172455-Hosting-a-Personal-Audio-Conference-PAC-meeting) meeting. * `8` — A recurring meeting with a fixed time. · valores: `0`, `1`, `2`, `3`, `4`, `7`, `8`
    - **start_time** `string` _requerido_ — The meeting's start time.
    - **timezone** `string` — The meeting's [timezone](https://developers.zoom.us/docs/api/rest/other-references/abbreviation-lists/#timezones).
    - **duration** `integer` _requerido_ — The scheduled meeting duration.
    - **custom_keys** `object[]` — Custom key-value pairs associated with the meeting.
      - `array` de:
        - **key** `string` — The name of the custom field.
        - **value** `string` — The value of the custom field.
    - **participant** `object` _requerido_ — Information about the meeting participant. If the participant is **not** part of the host's account, `email` returns an empty string value, with some exceptions. See [Email address display rules](https://developers.zoom.us/docs/api/rest/using-zoom-apis/#email-address-display-rules) for details.
      - **user_id** `string` _requerido_ — The participant's meeting user ID. This value is assigned to a participant when they join a meeting, and is only valid for the duration of the meeting.
      - **user_name** `string` — The participant's display name.
      - **id** `string` — The participant's universally unique ID (UUID). * If the participant joins the meeting by logging into Zoom, this value is the `id` value in the [**Get a user**](/api-reference/zoom-api/methods#operation/user) API response. * If the participant joins the meeting **without** logging into Zoom, this returns an empty string value. This value returns blank for external users. **Note:** Use the `participant_user_id` value instead of this value. We will remove this response in a future release.
      - **participant_uuid** `string` — The participant's UUID for this specific meeting and any breakout rooms created in this meeting. This value is assigned to a participant when they join a meeting, and is only valid for the duration of that meeting.
      - **leave_time** `string` _requerido_ — The time when the participant left the meeting. · formato: `date-time`
      - **leave_reason** `string` — The reason why the participant left the meeting, where `$name` is the participant's username: * `$name left the meeting.` * `$name got disconnected from the meeting.` * `Host ended the meeting.` * `Host closed the meeting.` * `Host started a new meeting.` * `Network connection error.` * `Host did not join.` * `Exceeded free meeting minutes limit.` * `Removed by host.` * `Unknown reason.` * `Leave waiting room.` * `Removed by host from waiting room.`
      - **email** `string` _requerido_ — The participant's email address. This response only returns if the participant joined the meeting by logging into Zoom. If the participant is **not** part of the host's account, this returns an empty string value, with some exceptions. See [Email address display rules](https://developers.zoom.us/docs/api/rest/using-zoom-apis/#email-address-display-rules) for details. · formato: `email`
      - **registrant_id** `string` — The participant's registrant ID. (A host or a user with administrative permissions can require [registration for Zoom meetings](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0065026)).
      - **participant_user_id** `string` — The participant's universally unique ID (UUID). * If the participant joins the meeting by logging into Zoom, this value is the `id` value in the [**Get a user**](/api-reference/zoom-api/methods#operation/user) API response. * If the participant joins the meeting **without** logging into Zoom, this returns an empty string value. This value returns blank for external users.
      - **customer_key** `string` — The participant's SDK identifier. This value can be alphanumeric.
      - **phone_number** `string` — Phone number of participant joined via PSTN

```json
{
  "event": "meeting.participant_left",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "object": {
      "id": "1234567890",
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "host_id": "x1yCzABCDEfg23HiJKl4mN",
      "topic": "My Meeting",
      "type": 8,
      "start_time": "2021-07-13T21:44:51Z",
      "timezone": "America/Los_Angeles",
      "duration": 60,
      "custom_keys": [
        {
          "key": "appointment_id",
          "value": "APT-12345"
        }
      ],
      "participant": {
        "user_id": "1234567890",
        "user_name": "Jill Chill",
        "id": "iFxeBPYun6SAiWUzBcEkX",
        "participant_uuid": "55555AAAiAAAAAiAiAiiAii",
        "leave_time": "2021-07-13T22:50:51Z",
        "leave_reason": "Jill Chill left the meeting.<br>Reason: Host ended the meeting.",
        "date_time": "2021-07-13T21:44:51Z",
        "email": "jchill@example.com",
        "registrant_id": "abcdefghij0-klmnopq23456",
        "participant_user_id": "rstuvwxyza789-cde",
        "customer_key": "349589LkJyeW",
        "phone_number": "8615250064084"
      }
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST meeting.registration_approved`

**meeting.registration_approved**

The **Meeting Registration has been approved** event is triggered every time a registrant is approved for the meeting. The meeting host should be a user on your account or a user of your [webhook-enabled](https://marketplace.zoom.us/docs/api-reference/webhook-reference#enable-webhooks) app. A meeting host or a user with admin privileges can restrict meeting registrations by manually approving registrants. With the **Manually Approve** option enabled for [meeting registrations](https://support.zoom.us/hc/en-us/articles/211579443-Registration-for-Meetings), the host of the meeting must approve registrants before they receive information about how to join the meeting. Meeting hosts can approve an attendee's meeting invitation via the [Zoom web portal](https://zoom.us). To do this, navigate to the scheduled meeting's page and click **Edit** next to the **Manage Attendees** section. Select the attendee to approve in the **Pending Approval** section, then click **Approve**. To programmatically approve an attendee's registration, use the [**Update registrant's status**](/docs/api-reference/zoom-api/methods#operation/meetingRegistrantStatus) API. ## Prerequisites * A Pro or a higher plan. * Enable **Manual Approval** for [meeting registrations](https://support.zoom.us/hc/en-us/articles/211579443-Registration-for-Meetings). * Enable **Event Subscriptions** for your [Marketplace app](https://marketplace.zoom.us/user/build) with: * A valid **Event Notification Endpoint URL**. * The **Meeting Registration has been approved** subscription enabled under the **Meeting** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `meeting:read:admin`,`meeting:write:admin`,`meeting:read`,`meeting:write`,`meeting:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `meeting:read:registrant:master`,`meeting:read:registrant`,`meeting:read:registrant:admin`

`operationId`: `Meeting.registration_approvedWebhook` · tags: `Meetings`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The name of the event.
- **event_ts** `integer` _requerido_ — A timestamp at which the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who created the meeting.
  - **operator** `string` _requerido_ — The email address of the user who approved the meeting registration. · formato: `email`
  - **operator_id** `string` _requerido_ — The user ID of the user who approved the meeting registration.
  - **object** `object` _requerido_ — Information about the meeting registration.
    - **uuid** `string` _requerido_ — The meeting's universally unique identifier (UUID). Each meeting instance generates a meeting UUID.
    - **id** `integer` _requerido_ — The meeting ID. · formato: `int64`
    - **host_id** `string` _requerido_ — The meeting host's user ID.
    - **topic** `string` _requerido_ — The meeting's topic.
    - **type** `integer` _requerido_ — The meeting type: * `0` — A prescheduled meeting. * `1` — An instant meeting. * `2` — A scheduled meeting. * `3` — A recurring meeting with no fixed time. * `4` — A [personal meeting room](https://support.zoom.us/hc/en-us/articles/201362843). * `7` — A [PAC (Personal Audio Conference)](https://support.zoom.us/hc/en-us/articles/205172455-Hosting-a-Personal-Audio-Conference-PAC-meeting) meeting. * `8` — A recurring meeting with a fixed time. · valores: `0`, `1`, `2`, `3`, `4`, `7`, `8`
    - **start_time** `string` _requerido_ — The meeting's start time. · formato: `date-time`
    - **duration** `integer` _requerido_ — The scheduled meeting duration.
    - **timezone** `string` _requerido_ — The meeting's [timezone](https://marketplace.zoom.us/docs/api-reference/other-references/abbreviation-lists#timezones).
    - **occurrences** `object[]` — Information about recurring meetings with fixed times and their occurrences. This only returns when the meeting's `type` value is `8`.
      - `array` de:
        - _cualquiera de:_
          - **object**
            - **occurrence_id** `string` _requerido_ — The meeting occurrence's ID.
            - **start_time** `string` _requerido_ — The meeting's start time.
    - **registrant** `object` _requerido_ — Information about the meeting registrant.
      - **id** `string` _requerido_ — The registrant's ID.
      - **first_name** `string` _requerido_ — The registrant's first name.
      - **last_name** `string` — The registrant's last name.
      - **email** `string` _requerido_ — The registrant's email address. · formato: `email`
      - **join_url** `string` _requerido_ — The URL to join the meeting.
      - **participant_pin_code** `integer` — The participant PIN code is used to authenticate audio participants before they join the meeting. · formato: `int64`

```json
{
  "event": "meeting.registration_approved",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "operator": "admin@example.com",
    "operator_id": "z8yCxjabcdEFGHfp8uQ",
    "object": {
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "id": 1234567890,
      "host_id": "x1yCzABCDEfg23HiJKl4mN",
      "topic": "My Meeting",
      "type": 8,
      "start_time": "2021-07-13T21:44:51Z",
      "duration": 60,
      "timezone": "America/Los_Angeles",
      "occurrences": [
        {
          "occurrence_id": "ABCDE12345",
          "start_time": "2021-07-13T21:44:51Z"
        }
      ],
      "registrant": {
        "id": "iFxeBPYun6SAiWUzBcEkX",
        "first_name": "Jill",
        "last_name": "Chill",
        "email": "jchill@example.com",
        "join_url": "https://example.com",
        "participant_pin_code": 380303
      }
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST meeting.registration_cancelled`

**meeting.registration_cancelled**

The **Meeting Registration has been canceled** event is triggered every time a registration is canceled for a meeting. The meeting host should be a user on your account or a user of your [webhook-enabled](https://marketplace.zoom.us/docs/api-reference/webhook-reference#enable-webhooks) app. A host with the Pro user type can enable the **Registration** feature when scheduling or updating a meeting. By [enabling registration for meetings](https://support.zoom.us/hc/en-us/articles/211579443-Registration-for-Meetings), participants must fill out a registration form receive information about joining the meeting. Meeting attendees can cancel their registration at any time. A meeting host can also cancel an attendee's meeting invitation via the [Zoom web portal](https://zoom.us). To do this, navigate to the scheduled meeting's page and click **Edit** next to the **Manage Attendees** section. The **Approved** section will display all approved attendees. Select the attendee whose meeting registration you want to revoke and click **Cancel Registration**. To programmatically cancel a registration, use the [**Update registrant's status**](/docs/api-reference/zoom-api/methods#operation/meetingRegistrantStatus) API. ## Prerequisites * A Pro or a higher plan. * Enable **Event Subscriptions** for your [Marketplace app](https://marketplace.zoom.us/user/build) with: * A valid **Event Notification Endpoint URL**. * The **Meeting Registration has been canceled** subscription enabled under the **Meeting** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `meeting:read:admin`,`meeting:write:admin`,`meeting:read`,`meeting:write`,`meeting:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `meeting:read:registrant:master`,`meeting:read:registrant`,`meeting:read:registrant:admin`

`operationId`: `Meeting.registration_cancelledWebhook` · tags: `Meetings`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The name of the event.
- **event_ts** `integer` _requerido_ — A timestamp at which the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who created the meeting.
  - **operator** `string` _requerido_ — The email address of the user who canceled the meeting registration. · formato: `email`
  - **operator_id** `string` — The user ID of the user who canceled the meeting registration.
  - **object** `object` _requerido_ — Information about the meeting registration.
    - **uuid** `string` _requerido_ — The meeting's universally unique identifier (UUID). Each meeting instance generates a meeting UUID.
    - **id** `integer` _requerido_ — The meeting ID. · formato: `int64`
    - **host_id** `string` _requerido_ — The meeting host's user ID.
    - **topic** `string` _requerido_ — The meeting's topic.
    - **type** `integer` _requerido_ — The meeting type: * `0` — A prescheduled meeting. * `1` — An instant meeting. * `2` — A scheduled meeting. * `3` — A recurring meeting with no fixed time. * `4` — A [personal meeting room](https://support.zoom.us/hc/en-us/articles/201362843). * `7` — A [PAC (Personal Audio Conference)](https://support.zoom.us/hc/en-us/articles/205172455-Hosting-a-Personal-Audio-Conference-PAC-meeting) meeting. * `8` — A recurring meeting with a fixed time. · valores: `0`, `1`, `2`, `3`, `4`, `7`, `8`
    - **start_time** `string` _requerido_ — The meeting's start time. · formato: `date-time`
    - **duration** `integer` _requerido_ — The scheduled meeting duration.
    - **timezone** `string` _requerido_ — The meeting's [timezone](https://marketplace.zoom.us/docs/api-reference/other-references/abbreviation-lists#timezones).
    - **occurrences** `object[]` — Information about recurring meetings with fixed times and their occurrences. This only returns when the meeting's `type` value is `8`.
      - `array` de:
        - _cualquiera de:_
          - **object**
            - **occurrence_id** `string` _requerido_ — The meeting occurrence's ID.
            - **start_time** `string` _requerido_ — The meeting's start time.
    - **registrant** `object` _requerido_ — Information about the meeting registrant.
      - **id** `string` _requerido_ — The registrant's ID.
      - **first_name** `string` _requerido_ — The registrant's first name.
      - **last_name** `string` — The registrant's last name.
      - **email** `string` _requerido_ — The registrant's email address. · formato: `email`

```json
{
  "event": "meeting.registration_cancelled",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "operator": "admin@example.com",
    "operator_id": "z8yCxjabcdEFGHfp8uQ",
    "object": {
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "id": 1234567890,
      "host_id": "x1yCzABCDEfg23HiJKl4mN",
      "topic": "My Meeting",
      "type": 8,
      "start_time": "2021-07-13T21:44:51Z",
      "duration": 60,
      "timezone": "America/Los_Angeles",
      "occurrences": [
        {
          "occurrence_id": "ABCDE12345",
          "start_time": "2021-07-13T21:44:51Z"
        }
      ],
      "registrant": {
        "id": "iFxeBPYun6SAiWUzBcEkX",
        "first_name": "Jill",
        "last_name": "Chill",
        "email": "jchill@example.com"
      }
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST meeting.registration_created`

**meeting.registration_created**

The **Meeting Registration has been created** event is triggered every time a user [registers](https://support.zoom.us/hc/en-us/articles/211579443-Registration-for-Meetings) for a meeting. A host with the Pro user type can enable the **Registration** feature when scheduling or updating a meeting. By [enabling registration for meetings](https://support.zoom.us/hc/en-us/articles/211579443-Registration-for-Meetings), participants must fill out a registration form receive information about joining the meeting. You can also programmatically register a participant via the [**Add Meeting Registrant**](/docs/api-reference/zoom-api/methods#operation/meetingRegistrantCreate) API. ## Prerequisites * A Pro or a higher plan. * Enable **Event Subscriptions** for your [Marketplace app](https://marketplace.zoom.us/user/build) with: * A valid **Event Notification Endpoint URL**. * The **Meeting Registration has been created** subscription enabled under the **Meeting** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `meeting:read:admin`,`meeting:write:admin`,`meeting:read`,`meeting:write`,`meeting:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `meeting:read:registrant:master`,`meeting:read:registrant`,`meeting:read:registrant:admin`

`operationId`: `Meeting.registration_createdWebhook` · tags: `Meetings`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The name of the event.
- **event_ts** `integer` _requerido_ — A timestamp at which the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who created the meeting.
  - **object** `object` _requerido_ — Information about the meeting registration.
    - **uuid** `string` _requerido_ — The meeting's universally unique identifier (UUID). Each meeting instance generates a meeting UUID.
    - **id** `integer` _requerido_ — The meeting ID. · formato: `int64`
    - **host_id** `string` _requerido_ — The meeting host's user ID.
    - **topic** `string` _requerido_ — The meeting's topic.
    - **type** `integer` _requerido_ — The meeting type: * `0` — A prescheduled meeting. * `1` — An instant meeting. * `2` — A scheduled meeting. * `3` — A recurring meeting with no fixed time. * `4` — A [personal meeting room](https://support.zoom.us/hc/en-us/articles/201362843). * `7` — A [PAC (Personal Audio Conference)](https://support.zoom.us/hc/en-us/articles/205172455-Hosting-a-Personal-Audio-Conference-PAC-meeting) meeting. * `8` — A recurring meeting with a fixed time. · valores: `0`, `1`, `2`, `3`, `4`, `7`, `8`
    - **start_time** `string` _requerido_ — The meeting's start time. · formato: `date-time`
    - **duration** `integer` _requerido_ — The scheduled meeting duration.
    - **timezone** `string` _requerido_ — The meeting's [timezone](https://marketplace.zoom.us/docs/api-reference/other-references/abbreviation-lists#timezones).
    - **occurrences** `object[]` — Information about recurring meetings with fixed times and their occurrences. This only returns when the meeting's `type` value is `8`.
      - `array` de:
        - _cualquiera de:_
          - **object**
            - **occurrence_id** `string` _requerido_ — The meeting occurrence's ID.
            - **start_time** `string` _requerido_ — The meeting's start time. · formato: `date-time`
    - **registrant** `object` _requerido_ — Information about the meeting registrant.
      - **id** `string` _requerido_ — The registrant's ID.
      - **first_name** `string` _requerido_ — The registrant's first name.
      - **last_name** `string` — The registrant's last name.
      - **email** `string` _requerido_ — The registrant's email address. · formato: `email`
      - **address** `string` — The registrant's address.
      - **city** `string` — The registrant's city.
      - **country** `string` — The registrant's two-letter [country code](https://marketplace.zoom.us/docs/api-reference/other-references/abbreviation-lists#countries).
      - **zip** `string` — The registrant's ZIP or postal code.
      - **state** `string` — The registrant's state or province.
      - **phone** `string` — The registrant's phone number.
      - **industry** `string` — The registrant's industry.
      - **org** `string` — The registrant's organization.
      - **job_title** `string` — The registrant's job title.
      - **purchasing_time_frame** `string` — The registrant's purchasing time frame: * `Within a month` * `1-3 months` * `4-6 months` * `More than 6 months` * `No timeframe` * An empty string. — No purchasing time frame set. · valores: ``, `Within a month`, `1-3 months`, `4-6 months`, `More than 6 months`, `No timeframe`
      - **role_in_purchase_process** `string` — The registrant's role in the purchase process: * `Decision Maker` * `Evaluator/Recommender` * `Influencer` * `Not involved` * An empty string. — No role set. · valores: ``, `Decision Maker`, `Evaluator/Recommender`, `Influencer`, `Not involved`
      - **no_of_employees** `string` — The registrant's number of employees: * `1-20` * `21-50` * `51-100` * `101-250` * `251-500` * `501-1,000` * `1,001-5,000` * `5,001-10,000` * `More than 10,000` * An empty string. — No employee number set. · valores: ``, `1-20`, `21-50`, `51-100`, `101-250`, `251-500`, `501-1,000`, `1,001-5,000`, `5,001-10,000`, `More than 10,000`
      - **comments** `string` — The registrant's questions and comments.
      - **custom_questions** `object[]` — Information about custom questions.
        - `array` de:
          - _cualquiera de:_
            - **object**
              - **title** `string` _requerido_ — The title of the custom question.
              - **value** `string` _requerido_ — The custom question's response value. This has a limit of 128 characters.
      - **status** `string` _requerido_ — The registrant's registration approval status: * `approve` — Approved registrant. * `pending` — Registration approval pending. · valores: `approved`, `pending`
      - **join_url** `string` _requerido_ — The URL to join the meeting.
      - **participant_pin_code** `integer` — The participant PIN code is used to authenticate audio participants before they join the meeting. · formato: `int64`

```json
{
  "event": "meeting.registration_created",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "object": {
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "id": 1234567890,
      "host_id": "x1yCzABCDEfg23HiJKl4mN",
      "topic": "My Meeting",
      "type": 8,
      "start_time": "2021-07-13T21:44:51Z",
      "duration": 60,
      "timezone": "America/Los_Angeles",
      "occurrences": [
        {
          "occurrence_id": "ABCDE12345",
          "start_time": "2021-07-13T21:44:51Z"
        }
      ],
      "registrant": {
        "id": "iFxeBPYun6SAiWUzBcEkX",
        "first_name": "Jill",
        "last_name": "Chill",
        "email": "jchill@example.com",
        "address": "1800 Amphibious Blvd.",
        "city": "Mountain View",
        "country": "US",
        "zip": "94045",
        "state": "CA",
        "phone": "5550100",
        "industry": "Food",
        "org": "Cooking Org",
        "job_title": "Chef",
        "purchasing_time_frame": "1-3 months",
        "role_in_purchase_process": "Influencer",
        "no_of_employees": "1-20",
        "comments": "Looking forward to the meeting",
        "custom_questions": [
          {
            "title": "What do you hope to learn from this meeting?",
            "value": "Look forward to learning how you come up with new recipes and what other services you offer."
          }
        ],
        "status": "approved",
        "join_url": "https://example.com/join",
        "participant_pin_code": 380303
      }
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST meeting.started`

**meeting.started**

The **Start Meeting** event is triggered every time a meeting host starts a meeting. The meeting host must either be a user on your account or a user of your [webhook-enabled](https://marketplace.zoom.us/docs/api-reference/webhook-reference#enable-webhooks) app. A meeting host can [start a meeting](https://support.zoom.us/hc/en-us/articles/201362423-How-do-I-Start-or-Join-a-Scheduled-Meeting-as-the-Host-) from the Zoom desktop client for Mac, PC or Linux, the Zoom app for Android or iOS, a web browser, or an H.323 or SIP device. ## Prerequisites * Enable **Event Subscriptions** for your [Marketplace app](https://marketplace.zoom.us/user/build) with: * A valid **Event Notification Endpoint URL**. * The **Start Meeting** subscription enabled under the **Meeting** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `meeting:read:admin`,`meeting:write:admin`,`meeting:read`,`meeting:write`,`meeting:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `meeting:read:meeting:master`,`meeting:read:meeting`,`meeting:read:meeting:admin`

`operationId`: `Meeting.startedWebhook` · tags: `Meetings`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The name of the event.
- **event_ts** `integer` _requerido_ — A timestamp at which the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who created the meeting.
  - **object** `object` _requerido_ — Information about the meeting.
    - **id** `string` _requerido_ — The meeting ID.
    - **uuid** `string` _requerido_ — The meeting's universally unique identifier (UUID). Each meeting instance generates a meeting UUID.
    - **host_id** `string` _requerido_ — The meeting host's user ID.
    - **host_email** `string` _requerido_ — The meeting host's email address. · formato: `email`
    - **topic** `string` _requerido_ — The meeting's topic.
    - **type** `integer` _requerido_ — The meeting type. * `0` - A prescheduled meeting. * `1` - An instant meeting. * `2` - A scheduled meeting. * `3` - A recurring meeting with no fixed time. * `4` - A [personal meeting room](https://support.zoom.us/hc/en-us/articles/201362843). * `7` - A [PAC (Personal Audio Conference)](https://support.zoom.us/hc/en-us/articles/205172455-Hosting-a-Personal-Audio-Conference-PAC-meeting) meeting. * `8` - A recurring meeting with a fixed time. · valores: `0`, `1`, `2`, `3`, `4`, `7`, `8`
    - **start_time** `string` _requerido_ — The meeting's start time. · formato: `date-time`
    - **timezone** `string` — The meeting's [timezone](https://marketplace.zoom.us/docs/api-reference/other-references/abbreviation-lists#timezones).
    - **duration** `integer` _requerido_ — The scheduled meeting duration.
    - **custom_keys** `object[]` — Custom key-value pairs associated with the meeting.
      - `array` de:
        - **key** `string` — The custom field's name.
        - **value** `string` — The custom field's value.

```json
{
  "event": "meeting.started",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "object": {
      "id": "1234567890",
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "host_id": "x1yCzABCDEfg23HiJKl4mN",
      "host_email": "jchill@example.com",
      "topic": "My Meeting",
      "type": 8,
      "start_time": "2021-07-13T21:44:51Z",
      "timezone": "America/Los_Angeles",
      "duration": 60,
      "custom_keys": [
        {
          "key": "appointment_id",
          "value": "APT-12345"
        }
      ]
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST webinar.alert`

**webinar.alert**

The **Webinar issues alert** event is triggered every time a Webinar hosted by one of your app users or account users, encounters a service issue. Zoom monitors the Webinar statistics in regard to the quality of service for each Webinar. An account owner or a user with admin permissions on a Business or higher plan can view these statistics via Dashboard. The following quality metrics can trigger an alert: * Unstable audio * Unstable video * Poor screen share quality * High CPU usage * Call reconnection problems To receive notifications for this event, you must meet the following prerequisites. ## Prerequisites * Business or a higher plan. * **Event Subscriptions** must be enabled for your [Marketplace app](https://marketplace.zoom.us/user/build) with the following configurations: * A valid **Event Notification Endpoint URL**. * The **Webinar issues alert** subscription enabled under the **Webinar** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:write:admin`,`webinar:read`,`webinar:write`,`webinar:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:alert:master`,`webinar:read:alert`,`webinar:read:alert:admin`

`operationId`: `Webinar.alertWebhook` · tags: `Webinars`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The name of the event.
- **event_ts** `integer` _requerido_ — A timestamp at which the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who created the webinar.
  - **object** `object` _requerido_ — Information about the webinar.
    - **id** `string` _requerido_ — The webinar ID.
    - **uuid** `string` _requerido_ — The webinar's universally unique identifier (UUID). Each webinar instance generates a webinar UUID.
    - **host_id** `string` _requerido_ — The webinar host's user ID.
    - **topic** `string` _requerido_ — The webinar's topic.
    - **type** `integer` _requerido_ — The webinar type: * `5` — A webinar. * `6` — A recurring webinar without a fixed time. * `9` — A recurring webinar with a fixed time. · valores: `5`, `6`, `9`
    - **start_time** `string` _requerido_ — The webinar's start time. · formato: `date-time`
    - **timezone** `string` _requerido_ — The webinar's [timezone](https://marketplace.zoom.us/docs/api-reference/other-references/abbreviation-lists#timezones).
    - **duration** `integer` _requerido_ — The scheduled webinar duration.
    - **issues** `string[]` _requerido_ — A list of issues that occurred during the webinar: * `Unstable audio quality` * `Unstable video quality` * `Unstable screen share quality` * `High CPU occupation` * `Call Reconnection`
      - `array` de:

```json
{
  "event": "webinar.alert",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "object": {
      "id": "1234567890",
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "host_id": "x1yCzABCDEfg23HiJKl4mN",
      "topic": "My Webinar",
      "type": 2,
      "start_time": "2021-07-13T21:44:51Z",
      "timezone": "America/Los_Angeles",
      "duration": 60,
      "issues": [
        "Unstable audio quality"
      ]
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST webinar.chat_message_file_downloaded`

**webinar.chat_message_file_downloaded**

The **In-webinar chat message file has been downloaded** event is triggered when a message file from a webinar is downloaded. The webhook is needed to enable the DLP option in the web portal. ## Prerequisites * Have Zoom enable the DLP for in-meeting chat for your account. This feature is **only** enabled upon request. Contact the [Zoom support team](https://support.zoom.us/hc/en-us/articles/201362003) for more information. * Enable the **In-webinar chat message file has been downloaded** subscription for your app. In your [Marketplace app](https://marketplace.zoom.us/user/build) go to **Event Subscriptions** > **Webinar**. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:write:admin`,`webinar:read`,`webinar:write`,`webinar:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:chat_message`,`webinar:read:chat_message:admin`

`operationId`: `Webinar.chat_message_file_downloadedWebhook` · tags: `Webinars`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The event's name.
- **event_ts** `integer` _requerido_ — A timestamp when the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` — The account ID of the user who downloaded the file. This value returns blank for external users.
  - **operator** `string` _requerido_ — The email address of the user who downloaded the file. This value returns the operator name for external users. · formato: `email or name`
  - **operator_id** `string` — The user ID of the user who downloaded the file. This value returns blank for external users.
  - **object** `object` _requerido_ — Information about the chat message file.
    - **id** `integer` _requerido_ — The webinar ID. · formato: `int64`
    - **uuid** `string` _requerido_ — The webinar's universally unique identifier (UUID). Each webinar instance generates a meeting UUID.
    - **host_account_id** `string` _requerido_ — The webinar host's account ID. The value will be an empty string if this info is from an external user.
    - **chat_message_file** `object` _requerido_ — Information about the chat message file.
      - **file_id** `string` _requerido_ — The live webinar chat file's UUID.
      - **file_name** `string` _requerido_ — The live webinar chat file's name.
      - **file_size** `integer` _requerido_ — The live webinar chat file's size, in bytes.
      - **file_type** `string` _requerido_ — The live webinar chat file's type.
      - **file_owner_id** `string` — The user ID of the user who uploaded the team chat file. This value returns blank for external users.

```json
{
  "event": "webinar.chat_message_file_downloaded",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "operator": "user@example.com",
    "operator_id": "z8yCxjabcdEFGHfp8uQ",
    "object": {
      "id": 1234567890,
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "host_account_id": "lmnop12345abcdefghijk",
      "chat_message_file": {
        "file_id": "MS17RDk0QTY3QUQtQkFGQy04QTJFLTI2RUEtNkYxQjRBRTU1MTk5fQ==",
        "file_name": "example.jpg",
        "file_owner_id": "rw3dIsBRTpOyMOJmeKgdaQ",
        "file_size": 3966,
        "file_type": "jpg"
      }
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST webinar.chat_message_file_sent`

**webinar.chat_message_file_sent**

The **In-webinar chat message file received** event is triggered when a message file of a webinar is available to view or download. The event is sent to the configured endpoint in your Marketplace app. ## Prerequisites * Have Zoom enable the DLP for in-meeting chat feature to use this webhook. * Enable **Event Subscriptions** for your [Marketplace app](https://marketplace.zoom.us/user/build) with: * Enable the **In-webinar chat message file received** subscription under the **Webinar** event category. * This feature is **only** enabled upon request approval. Contact the [Zoom support team](https://support.zoom.us/hc/en-us/articles/201362003) for more information. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:read`,`webinar:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:chat_message:master`,`webinar:read:chat_message`,`webinar:read:chat_message:admin`

`operationId`: `Webinar.chat_message_file_sentWebhook` · tags: `Webinars`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The event's name.
- **event_ts** `integer` _requerido_ — The timestamp when the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who hosted the webinar.
  - **object** `object` _requerido_ — Information about the chat message file.
    - **webinar_id** `integer` _requerido_ — The webinar ID. · formato: `int64`
    - **webinar_uuid** `string` _requerido_ — The webinar's universally unique identifier (UUID). Each webinar instance generates a webinar UUID.
    - **breakout_room_uuid** `string` — The breakout room's universally unique identifier (UUID). Each breakout room instance generates a breakout room UUID.
    - **chat_message_file** `object` _requerido_ — Information about the chat message file.
      - **date_time** `string` _requerido_ — The date and time when the chat message was sent. · formato: `date-time`
      - **sender_session_id** `string` _requerido_ — The message sender's session ID.
      - **sender_name** `string` _requerido_ — The message sender's name.
      - **sender_email** `string` — The message sender's email address. · formato: `email`
      - **sender_type** `string` _requerido_ — The type of user that sent the message. * `host` - The meeting host. * `guest` - A meeting guest. · valores: `host`, `guest`
      - **sender_context** `string` _requerido_ — The context where the sender is located when the message is generated. * `webinar` - The sender is in a webinar. * `breakout_room` - The sender is in a breakout room. · valores: `webinar`, `breakout_room`
      - **recipient_session_id** `string` — The message recipient's session ID.
      - **recipient_name** `string` — The message recipient's name.
      - **recipient_email** `string` — The message recipient's email address. Optional only included if it is a private message. · formato: `email`
      - **recipient_type** `string` _requerido_ — The type of message recipient. * `everyone` - All webinar participants. * `host` - The webinar host. * `guest` - A webinar guest. * `group` - A group chat. * `backstage` - The webinar backstage. * `host_group` - The webinar host and all panelists. · valores: `everyone`, `host`, `guest`, `group`, `backstage`, `host_group`
      - **recipient_context** `string` _requerido_ — The context where the recipient is located when the message is delivered. * `webinar` - The recipient is in the webinar. * `breakout_room` - The sender is in a breakout room. · valores: `webinar`, `breakout_room`
      - **message_id** `string` _requerido_ — The chat message's UUID.
      - **file_id** `string` _requerido_ — The live webinar chat file's UUID, in base64-encoded format.
      - **file_name** `string` _requerido_ — The live webinar chat file's name.
      - **file_size** `integer` _requerido_ — The live webinar chat file's size, in bytes.
      - **file_type** `string` _requerido_ — The live meeting chat file's type.
      - **download_url** `string` _requerido_ — The live webinar chat file's download URL.

```json
{
  "event": "webinar.chat_message_file_sent",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "object": {
      "webinar_id": 1234567890,
      "webinar_uuid": "4444AAAiAAAAAiAiAiiAii==",
      "breakout_room_uuid": "FkQbpP2UR028mDrwzEahqw==",
      "chat_message_file": {
        "date_time": "GMT20220110-072010",
        "sender_session_id": "26219520",
        "sender_name": "Jill Chill",
        "sender_email": "dlp.user@example.com",
        "sender_type": "host",
        "sender_context": "webinar",
        "recipient_session_id": "38681600",
        "recipient_name": "John Smith",
        "recipient_email": "guest.user@example",
        "recipient_type": "guest",
        "recipient_context": "webinar",
        "message_id": "MS17MDQ5NjE4QjYtRjk4Ny00REEwLUFBQUItMTg3QTY0RjU2MzhFfQ==",
        "file_id": "MS17RDk0QTY3QUQtQkFGQy04QTJFLTI2RUEtNkYxQjRBRTU1MTk5fQ==",
        "file_name": "example.jpg",
        "file_size": 3966,
        "file_type": "jpg",
        "download_url": "https://file.zoomdev.us/file/hsdAXySKRe2KgS-0YNeSXg/attach/format/plain?decryptType=1&filename=example.jpg&jwt=eyJhbGciOiJIUzI1NiJ9.eyJkaWciOiI3Yzg5YzBhYjIzYmZmMjdjNzE3NTQ4YzdjMTc0Njk3MWYzYjNmNjFjMzU5OTliNjE1ZjdjMWJmMzc5YTJiZThlIiwiYXVkIjoiZmlsZSIsImlzcyI6ImNyb3NzZmlsZSIsImV4cCI6MTY0ODI2NDY5N30.2fQxw3F1cEhvFJmnE2zPOdkHnPeZUktv_P0M--e-Tg8&mode=play"
      }
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST webinar.chat_message_sent`

**webinar.chat_message_sent**

The **In-webinar chat message received** event is triggered when a user sends a public or private chat message during a webinar using the [chat feature](https://support.zoom.us/hc/en-us/articles/205761999-Chatting-in-a-Zoom-Webinar). The event is sent to the configured endpoint in your Marketplace app. ## Prerequisites * Have Zoom enable the DLP for in-meeting chat feature to use this webhook. * Enable **Event Subscriptions** for your [Marketplace app](https://marketplace.zoom.us/user/build) with: * Enable the **In-webinar chat message received** subscription under the **Webinar** event category. * This feature is **only** enabled upon request approval. Contact the [Zoom support team](https://support.zoom.us/hc/en-us/articles/201362003) for more information. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:write:admin`,`webinar:read`,`webinar:write`,`webinar:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:chat_message:master`,`webinar:read:chat_message`,`webinar:read:chat_message:admin`

`operationId`: `Webinar.chat_message_sentWebhook` · tags: `Webinars`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The name of the event.
- **event_ts** `integer` _requerido_ — The timestamp when the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who created the webinar.
  - **object** `object` _requerido_ — Information about the chat message.
    - **id** `integer` _requerido_ — The webinar ID. · formato: `int64`
    - **uuid** `string` _requerido_ — The webinar's universally unique identifier (UUID). Each webinar instance generates a webinar UUID.
    - **breakout_room_uuid** `string` — The breakout room's universally unique identifier (UUID). Each breakout room instance generates a breakout room UUID.
    - **chat_message** `object` _requerido_ — Information about the chat message.
      - **date_time** `string` _requerido_ — The date and time when the chat message was sent. · formato: `date-time`
      - **sender_session_id** `string` _requerido_ — The message sender's session ID.
      - **sender_name** `string` _requerido_ — The message sender's name.
      - **sender_email** `string` — The message sender's session email address. · formato: `email`
      - **sender_type** `string` _requerido_ — The type of user that sent the message. * `host` - The webinar host. * `alternative-host` - The webinar's [alternative host](https://support.zoom.us/hc/en-us/articles/208220166). * `panelist` - A webinar [panelist](https://support.zoom.us/hc/en-us/articles/360000252726#:~:text=Panelists%20are%20full,a%20webinar%20host.). * `guest` - A webinar guest. · valores: `host`, `alternative-host`, `panelist`, `guest`
      - **sender_context** `string` _requerido_ — The context where the sender is located when the message is generated. * `webinar` - The sender is in a webinar. * `breakout_room` - The sender is in a breakout room. * `waiting_room` - The sender is in the waiting room. · valores: `webinar`, `breakout_room`, `waiting_room`
      - **recipient_session_id** `string` — The message recipient's ID.
      - **recipient_name** `string` — The message recipient's name.
      - **recipient_email** `string` — The message recipient's email address. Optional only included if it is a private message. · formato: `email`
      - **recipient_type** `string` _requerido_ — The type of message recipient. * `everyone` - All webinar participants. * `host` - The webinar host. * `guest` - A webinar guest. * `group` - A group chat. * `backstage` - The webinar backstage. * `host_group` - The webinar host and all panelists. · valores: `everyone`, `host`, `guest`, `group`, `backstage`, `host_group`
      - **recipient_context** `string` _requerido_ — The context where the recipient is located when the message is delivered. * `webinar` - The recipient is in the webinar. * `breakout_room` - The recipient is in a breakout room. * `waiting_room` - The recipient is in the waiting room. · valores: `webinar`, `breakout_room`, `waiting_room`
      - **message_id** `string` _requerido_ — The chat message's UUID.
      - **message_content** `string` _requerido_ — The content of the chat message.
      - **file_ids** `string[]` — The live webinar chat file's UUID, in base64-encoded format.
        - `array` de:

```json
{
  "event": "webinar.chat_message_sent",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "object": {
      "id": 1234567890,
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "breakout_room_uuid": "FkQbpP2UR028mDrwzEahqw==",
      "chat_message": {
        "date_time": "GMT20220110-072010",
        "sender_session_id": "26219520",
        "sender_name": "Jill Chill",
        "sender_email": "dlp.user@example.com",
        "sender_type": "host",
        "sender_context": "webinar",
        "recipient_session_id": "38681600",
        "recipient_name": "John Smith",
        "recipient_type": "everyone",
        "recipient_context": "breakout_room",
        "message_id": "MS17MDQ5NjE4QjYtRjk4Ny00REEwLUFBQUItMTg3QTY0RjU2MzhFfQ==",
        "message_content": "This is a test message",
        "file_ids": [
          "MS17RDk0QTY3QUQtQkFGQy04QTJFLTI2RUEtNkYxQjRBRTU1MTk5fQ==",
          "MS17NDQ0OEU5MjMtM0JFOS1CMDA1LTQ0NDAtQjdGOTU0Rjk5MTkyfQ=="
        ]
      }
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST webinar.converted_to_meeting`

**webinar.converted_to_meeting**

The **Webinar has been converted to a Meeting** event is triggered every time one of your app users or account users converts a webinar into a meeting. ## Prerequisites * Pro or a higher plan with Webinar license. * Enable **Event Subscriptions** for your [Marketplace app](https://marketplace.zoom.us/user/build) with: * A valid **Event Notification Endpoint URL**. * The **Webinar has been converted to a Meeting** subscription enabled under the **Webinar** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read`,`webinar:read:admin`,`webinar:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:webinar:master`,`webinar:read:webinar`,`webinar:read:webinar:admin`

`operationId`: `Webinar.converted_to_meetingWebhook` · tags: `Webinars`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The name of the event.
- **event_ts** `integer` — A timestamp at which the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who converted the webinar into a meeting.
  - **operator** `string` _requerido_ — The email address of the user who converted the webinar into a meeting.
  - **operator_id** `string` — The user ID of the user who converted the webinar into a meeting.
  - **object** `object` _requerido_ — Information about the meeting converted from a webinar.
    - **uuid** `string` _requerido_ — The meeting's universally unique identifier (UUID).
    - **id** `integer` _requerido_ — The meeting ID. · formato: `int64`
    - **host_id** `string` _requerido_ — The meeting host's user ID.
    - **topic** `string` — The meeting's topic.
    - **type** `integer` _requerido_ — The meeting type. * `2` - A scheduled meeting. * `3` - A recurring meeting with no fixed time. * `8` - A recurring meeting with fixed time. · valores: `2`, `3`, `8`
    - **start_time** `string` — The scheduled meeting's start time. Returned only when the meeting type is `2`. · formato: `date-time`
    - **duration** `integer` — The scheduled meeting's duration, in minutes. Returned only when the meeting type is `2`.
    - **timezone** `string` — The meeting's [timezone](/docs/api/references/abbreviations/#timezones).

```json
{
  "event": "webinar.converted_to_meeting",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "operator": "admin@example.com",
    "operator_id": "z8yCxjabcdEFGHfp8uQ",
    "object": {
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "id": 9876543210,
      "host_id": "x1yCzABCDEfg23HiJKl4mN",
      "topic": "My Webinar Converted",
      "type": 2,
      "start_time": "2021-07-13T21:44:51Z",
      "duration": 45,
      "timezone": "America/Los_Angeles"
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST webinar.created`

**webinar.created**

Zoom triggers this event every time one of your app users or account users creates a Webinar. Zoom users with a [Webinar Plan](https://zoom.us/webinar) have access to creating and managing webinars. [Zoom Video Webinar](https://support.zoom.us/hc/en-us/articles/200917029-Getting-Started-With-Webinar) allows users to broadcast a Zoom meeting to up to 1000 attendees. A user can create a Webinar manually by logging into the [Zoom Web Portal](https://zoom.us/) and clicking on **Schedule a Webinar** button in the [Webinars](https://zoom.us/webinar/list) page. Alternatively, users can also use the [**Create a Webinar**](/docs/api-reference/zoom-api/methods#operation/webinarCreate) API to schedule a Webinar programmatically. ## Prerequisites * Pro or a higher plan with Webinar license. * **Event Subscription** must be enabled for your [Marketplace App](https://marketplace.zoom.us/user/build) with the following configurations: * A valid **Event notification endpoint URL** * The **Webinar has been created** subscription enabled under the **Meeting** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:write:admin`,`webinar:read`,`webinar:write`,`webinar:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:webinar:master`,`webinar:read:webinar`,`webinar:read:webinar:admin`

`operationId`: `Webinar.createdWebhook` · tags: `Webinars`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The name of the event.
- **event_ts** `integer` _requerido_ — A timestamp at which the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who created the webinar.
  - **operator** `string` _requerido_ — The email address of the user who created the webinar. · formato: `email`
  - **operator_id** `string` _requerido_ — The user ID of the user who created the webinar.
  - **operation** `string` — The type of operation performed: * `all` — The change was applied to all webinar. * `single` — The change was applied only to a single webinar. · valores: `all`, `single`
  - **object** `object` _requerido_ — Information about the webinar.
    - **uuid** `string` _requerido_ — The webinar's universally unique identifier (UUID). Each webinar instance generates a webinar UUID.
    - **id** `integer` _requerido_ — The webinar ID. · formato: `int64`
    - **host_id** `string` _requerido_ — The webinar host's user ID.
    - **topic** `string` _requerido_ — The webinar's topic.
    - **type** `integer` _requerido_ — The webinar type: * `5` — A webinar. * `6` — A recurring webinar without a fixed time. * `9` — A recurring webinar with a fixed time. · valores: `5`, `6`, `9`
    - **start_time** `string` — The webinar's start time. · formato: `date-time`
    - **duration** `integer` _requerido_ — The scheduled webinar duration.
    - **timezone** `string` _requerido_ — The webinar's [timezone](https://marketplace.zoom.us/docs/api-reference/other-references/abbreviation-lists#timezones).
    - **join_url** `string` _requerido_ — The URL to join the webinar.
    - **password** `string` — The password required to join the webinar.
    - **creation_source** `string` _requerido_ — The platform through which the meeting was created. * `other` - Created through another platform. * `open_api` - Created through Open API. * `web_portal` - Created through the web portal. · valores: `other`, `open_api`, `web_portal`
    - **occurrences** `object[]` — Information about recurring webinars with fixed times and their occurrences. This only returns when the webinar's `type` value is `9`.
      - `array` de:
        - _cualquiera de:_
          - **object**
            - **occurrence_id** `string` _requerido_ — The webinar occurrence's ID.
            - **start_time** `string` _requerido_ — The webinar's start time. · formato: `date-time`
            - **duration** `integer` — The scheduled webinar duration.
            - **status** `string` — The webinar occurrence status: * `available` * `deleted` · valores: `available`, `deleted`
    - **settings** `object` _requerido_ — Information about the webinar's settings.
      - **use_pmi** `boolean` _requerido_ — Whether the use of PMI is enabled.
      - **alternative_hosts** `string` _requerido_ — A semicolon-separated list of the webinar's alternative hosts' email addresses or IDs.
    - **recurrence** `object` — Information about [recurring meetings](https://marketplace.zoom.us/docs/api-reference/other-references/recurrence-object-definitions).
      - **type** `integer` — The type of recurring meeting: * `1` — Daily. * `2` — Weekly. * `3` — Monthly. · valores: `1`, `2`, `3`
      - **repeat_interval** `integer` — The meeting's repeat interval: * For daily intervals, a max of `90` days. * For a weekly interval, a max of `12` weeks. * For monthly intervals, a max of `3` months.
      - **weekly_days** `string` — A comma-separated list of the days of the week on which the recurring weekly meeting occurs: * `1` — Sunday * `2` — Monday * `3` — Tuesday * `4` — Wednesday * `5` — Thursday * `6` — Friday * `7` — Saturday
      - **monthly_day** `integer` — The day of the month on which the recurring monthly meeting occurs. The value ranges from 1 to 31.
      - **monthly_week_day** `integer` — The day of the week on which the recurring monthly meeting is scheduled: * `1` — Sunday * `2` — Monday * `3` — Tuesday * `4` — Wednesday * `5` — Thursday * `6` — Friday * `7` — Saturday · valores: `1`, `2`, `3`, `4`, `5`, `6`, `7`
      - **end_times** `integer` — The number of times the recurring meeting will occur before it is canceled.
      - **end_date_time** `string` — The recurring meeting's final ending date and time before it is canceled, in UTC format. · formato: `date-time`
      - **monthly_week** `integer` — The week of the month on which a recurring meeting occurs: * `-1` — The last week of the month. * `1` — The first week. * `2` — The second week. * `3` — The third week. * `4` — The fourth week. · valores: `-1`, `1`, `2`, `3`, `4`

```json
{
  "event": "webinar.created",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "operator": "admin@example.com",
    "operator_id": "z8yCxjabcdEFGHfp8uQ",
    "operation": "single",
    "object": {
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "id": 1234567890,
      "host_id": "x1yCzABCDEfg23HiJKl4mN",
      "topic": "My Webinar",
      "type": 9,
      "start_time": "2021-07-13T21:44:51Z",
      "duration": 60,
      "timezone": "America/Los_Angeles",
      "join_url": "https://example.com",
      "password": "XYz@BC!D1087",
      "creation_source": "open_api",
      "occurrences": [
        {
          "occurrence_id": "ABCDE12345",
          "start_time": "2021-07-13T21:44:51Z",
          "duration": 60,
          "status": "available"
        }
      ],
      "settings": {
        "use_pmi": true,
        "alternative_hosts": "jchill@example.com"
      },
      "recurrence": {
        "type": 1,
        "repeat_interval": 2,
        "end_times": 5
      }
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST webinar.deleted`

**webinar.deleted**

The **Webinar has been deleted** event is triggered every time a webinar scheduled by one of your app users or account users, is deleted. A webinar host or a user with admin privileges can delete a scheduled webinar. Users can delete a webinar using the **Delete** feature for a webinar, from the [Zoom Web Portal](https://zoom.us/webinar/list) or the Zoom Client App. Alternatively, users can use the [**Delete a webinar**](/docs/api-reference/zoom-api/methods#operation/webinarDelete) API to delete webinars programmatically. ## **Prerequisites**: * Pro or a higher plan with Webinar license. * **Event Subscriptions** must be enabled for your [Marketplace app](https://marketplace.zoom.us/user/build) with the following configurations: * A valid **Event Notification Endpoint URL**. * The **Webinar has been deleted** subscription enabled under the **Webinar** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:write:admin`,`webinar:read`,`webinar:write`,`webinar:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:webinar:master`,`webinar:read:webinar`,`webinar:read:webinar:admin`

`operationId`: `Webinar.deletedWebhook` · tags: `Webinars`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The name of the event.
- **event_ts** `integer` _requerido_ — A timestamp at which the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who deleted the webinar.
  - **operator** `string` _requerido_ — The email address of the user who deleted the webinar.
  - **operator_id** `string` — The user ID of the user who deleted the webinar.
  - **operation** `string` — The type of operation performed: * `all` — The change was applied to all webinars. * `single` — The change was applied only to a single webinar. · valores: `all`, `single`
  - **object** `object` _requerido_ — Information about the webinar.
    - **uuid** `string` _requerido_ — The webinar's universally unique identifier (UUID). Each webinar instance generates a webinar UUID.
    - **id** `integer` _requerido_ — The webinar ID. · formato: `int64`
    - **host_id** `string` _requerido_ — The webinar host's user ID.
    - **topic** `string` — The webinar's topic.
    - **type** `integer` _requerido_ — The webinar type: * `5` — A webinar. * `6` — A recurring webinar without a fixed time. * `9` — A recurring webinar with a fixed time. · valores: `5`, `6`, `9`
    - **start_time** `string` — The webinar's start time. · formato: `date-time`
    - **duration** `integer` — The scheduled webinar duration.
    - **timezone** `string` — The webinar's [timezone](https://marketplace.zoom.us/docs/api-reference/other-references/abbreviation-lists#timezones).
    - **occurrences** `object[]` — Information about recurring webinars with fixed times and their occurrences. This only returns when the webinar's `type` value is `9`.
      - `array` de:
        - _cualquiera de:_
          - **object**
            - **occurrence_id** `string` _requerido_ — The webinar occurrence's ID.
            - **start_time** `string` _requerido_ — The webinar's start time. · formato: `date-time`

```json
{
  "event": "webinar.deleted",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "operator": "admin@example.com",
    "operator_id": "z8yCxjabcdEFGHfp8uQ",
    "operation": "single",
    "object": {
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "id": 1234567890,
      "host_id": "x1yCzABCDEfg23HiJKl4mN",
      "topic": "My Webinar",
      "type": 9,
      "start_time": "2021-07-13T21:44:51Z",
      "duration": 60,
      "timezone": "America/Los_Angeles",
      "occurrences": [
        {
          "occurrence_id": "ABCDE12345",
          "start_time": "2021-07-13T21:44:51Z"
        }
      ]
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST webinar.ended`

**webinar.ended**

The **End Webinar** event is triggered every time a user in your account or your app ends a webinar. Zoom users with a [Webinar Plan](https://zoom.us/webinar) have permissions for creating and managing webinars. [Zoom Video Webinar](https://support.zoom.us/hc/en-us/articles/200917029-Getting-Started-With-Webinar) allows users to broadcast a Zoom meeting to up to 1000 attendees. A webinar host can start and end a webinar. ## Prerequisites * Pro or a higher plan with Webinar license. * **Event Subscription** must be enabled for your [Marketplace app](https://marketplace.zoom.us/user/build) with: * A valid **Event Notification Endpoint URL**. * The **End Webinar** subscription enabled under the **Webinar** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:write:admin`,`webinar:read`,`webinar:write`,`webinar:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:webinar:master`,`webinar:read:webinar`,`webinar:read:webinar:admin`

`operationId`: `Webinar.endedWebhook` · tags: `Webinars`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The event's name.
- **event_ts** `integer` _requerido_ — A timestamp when the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who ended the webinar.
  - **object** `object` _requerido_ — Information about the webinar.
    - **id** `string` _requerido_ — The webinar ID.
    - **uuid** `string` _requerido_ — The webinar's universally unique identifier (UUID). Each webinar instance generates a webinar UUID.
    - **host_id** `string` _requerido_ — The webinar host's user ID.
    - **host_email** `string` _requerido_ — The meeting host's email address. · formato: `email`
    - **topic** `string` _requerido_ — The webinar's topic.
    - **type** `integer` _requerido_ — The webinar type. * `5` - A webinar. * `6` - A recurring webinar without a fixed time. * `9` - A recurring webinar with a fixed time. · valores: `5`, `6`, `9`
    - **start_time** `string` _requerido_ — The webinar's start time. · formato: `date-time`
    - **timezone** `string` _requerido_ — The webinar's [timezone](https://marketplace.zoom.us/docs/api-reference/other-references/abbreviation-lists#timezones).
    - **end_time** `string` — The date and time when the webinar ended. · formato: `date-time`
    - **duration** `integer` _requerido_ — The scheduled webinar duration.
    - **practice_session** `boolean` — whether this webinar is a practice session.

```json
{
  "event": "webinar.ended",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "object": {
      "id": "1234567890",
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "host_id": "x1yCzABCDEfg23HiJKl4mN",
      "host_email": "jchill@example.com",
      "topic": "My Webinar",
      "type": 5,
      "start_time": "2021-07-13T21:44:51Z",
      "timezone": "America/Los_Angeles",
      "end_time": "2021-07-13T23:00:51Z",
      "duration": 60,
      "practice_session": true
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST webinar.participant_bind`

**webinar.participant_bind**

descriptionThe **Phone User Bind To Participant** event is triggered every time a phone user joins a webinar and binds to an attendee in the webinar. ## Prerequisites * Enable **Event Subscriptions** for your [Marketplace app](https://marketplace.zoom.us/user/build) with: * A valid **Event Notification Endpoint URL**. * The **Phone User Bind To Partcipant** subscription enabled under the **Webinar** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:write:admin`,`webinar:read`,`webinar:write`,`webinar:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:participant:master`,`webinar:read:participant`,`webinar:read:participant:admin`

`operationId`: `Webinar.participant_bindWebhook` · tags: `Webinars`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The event's name.
- **event_ts** `integer` _requerido_ — A timestamp when the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who created the Webinar.
  - **object** `object` _requerido_ — Information about the webinar.
    - **id** `string` — The webinar ID.
    - **uuid** `string` _requerido_ — The webinar's universally unique identifier (UUID). Each webinar instance generates a webinar UUID.
    - **host_id** `string` _requerido_ — The webinar host's user ID.
    - **topic** `string` — The webinar's topic.
    - **type** `integer` _requerido_ — The webinar type. * `0` - A prescheduled webinar. * `1` - An instant webinar. * `2` - A scheduled webinar. * `3` - A recurring webinar with no fixed time. * `4` - A [personal webinar room](https://support.zoom.us/hc/en-us/articles/201362843). * `7` - A [PAC (Personal Audio Conference)](https://support.zoom.us/hc/en-us/articles/205172455-Hosting-a-Personal-Audio-Conference-PAC-webinar) webinar. * `8` - A recurring webinar with a fixed time. · valores: `0`, `1`, `2`, `3`, `4`, `7`, `8`
    - **start_time** `string` — The webinar's start time.
    - **timezone** `string` — The webinar's [timezone](https://developers.zoom.us/docs/api/rest/other-references/abbreviation-lists/#timezones).
    - **duration** `integer` — The scheduled webinar duration.
    - **participant** `object` _requerido_ — Information about the webinar participant. If the participant is **not** part of the host's account, `email` returns an empty string value, with some exceptions. See [Email address display rules](https://developers.zoom.us/docs/api/rest/using-zoom-apis/#email-address-display-rules) for details.
      - **user_id** `string` _requerido_ — The participant's webinar user ID. This value is assigned to a participant when they join a webinar, and is only valid for the duration of the webinar.
      - **bind_user_id** `string` _requerido_ — The particpant's webinar user ID of participant the phone user bind to. This value is assigned to a participant when they join a webinar, and is only valid for the duration of the webinar.
      - **user_name** `string` — The participant's display name.
      - **id** `string` — The participant's universally unique ID (UUID). * If the participant joins the webinar by logging into Zoom, this value is the `id` value in the [**Get a user**](https://developers.zoom.us/docs/api/rest/reference/user/methods/#operation/user) API response. * If the participant joins the webinar **without** logging into Zoom, this returns an empty string value. This value returns blank for external users. **Note:** Use the `participant_user_id` value instead of this value. We will remove this response in a future release.
      - **participant_uuid** `string` — The participant's UUID for this specific webinar and any breakout rooms created in this webinar. This value is assigned to a participant when they join a webinar, and is only valid for the duration of that webinar.
      - **bind_participant_uuid** `string` — The participant's UUID of the user which this phone user binds to.
      - **join_time** `string` _requerido_ — The time when the participant joined the webinar. · formato: `date-time`
      - **registrant_id** `string` — The registrant ID of the participants this phone user binds to. A host or a user with administrative permissions can require [registration for Zoom webinars](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0065026).
      - **phone_number** `string` _requerido_ — Phone number of participants who joined via PSTN.

```json
{
  "event": "webinar.participant_bind",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "object": {
      "id": "1234567890",
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "host_id": "x1yCzABCDEfg23HiJKl4mN",
      "topic": "My Meeting",
      "type": 8,
      "start_time": "2021-07-13T21:44:51Z",
      "timezone": "America/Los_Angeles",
      "duration": 60,
      "participant": {
        "user_id": "1234567890",
        "bind_user_id": "16778240",
        "user_name": "Jill Chill",
        "id": "iFxeBPYun6SAiWUzBcEkX",
        "participant_uuid": "55555AAAiAAAAAiAiAiiAii",
        "bind_participant_uuid": "B8E2844F-F162-4808-A997-F267BCE8B0BB",
        "date_time": "2021-07-13T21:44:51Z",
        "registrant_id": "abcdefghij0-klmnopq23456",
        "phone_number": "8615250064084",
        "join_time": "2021-07-13T21:44:51Z"
      }
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST webinar.participant_data_connection_established`

**webinar.participant_data_connection_established**

The **Participant or Host connection established** event is triggered when an attendee establishes a data connection when joining a webinar. ## Prerequisites * Enable **Event Subscriptions** for your [Marketplace app](https://marketplace.zoom.us/user/build) with: * A valid **Event Notification Endpoint URL**. * The **Participant or Host connection established** subscription enabled under the **Webinar** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:read` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:participant_data_connection`,`webinar:read:participant_data_connection:admin`,`webinar:read:participant_data_connection:master`

`operationId`: `Webinar.participant_data_connection_establishedWebhook` · tags: `Webinars`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The event's name.
- **event_ts** `integer` _requerido_ — A timestamp for when the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who created the webinar.
  - **object** `object` _requerido_ — Information about the webinar.
    - **id** `string` — The webinar number.
    - **uuid** `string` _requerido_ — The webinar's universally unique identifier (UUID). Each webinar instance generates a webinar UUID.
    - **host_id** `string` _requerido_ — The webinar host's user ID.
    - **topic** `string` — The webinar's topic.
    - **type** `integer` _requerido_ — The webinar type: * `5` - A webinar. * `6` - A recurring webinar without a fixed time. * `9` - A recurring webinar with a fixed time. · valores: `5`, `6`, `9`
    - **start_time** `string` — The webinar's start time.
    - **participant** `object` _requerido_ — Information about the webinar participant. If the participant is **not** part of the host's account, the `email` field returns an empty string value, with some exceptions. See [Email address display rules](https://developers.zoom.us/docs/api/rest/using-zoom-apis/#email-address-display-rules) for details.
      - **user_id** `string` _requerido_ — The participant's webinar user ID. This value is assigned to a participant when they join a webinar and is only valid for the duration of the webinar.
      - **user_name** `string` _requerido_ — The participant's display name.
      - **participant_uuid** `string` — The participant's UUID for this specific webinar and any breakout rooms created in this webinar. This value is assigned to a participant when they join a webinar and is only valid for the duration of that webinar.
      - **join_time** `string` _requerido_ — The time when the participant joined the webinar. · formato: `date-time`
      - **email** `string` _requerido_ — The participant's email address. This response only returns if the participant joined the webinar by logging into Zoom. If the participant is **not** part of the host's account, this returns an empty string value, with some exceptions. See [Email address display rules](https://developers.zoom.us/docs/api/rest/using-zoom-apis/#email-address-display-rules) for details. · formato: `email`
      - **registrant_id** `string` — The participant's registrant ID. A host or a user with administrative permissions can require [registration for Zoom meetings](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0065026).
      - **participant_user_id** `string` — The participant's universally unique ID (UUID). * If the participant joins the meeting by logging into Zoom, this value is the `id` value in the [**Get a user**](/api-reference/zoom-api/methods#operation/user) API response. * If the participant joins the meeting **without** logging into Zoom, this returns an empty string value. This value returns blank for external users.
      - **customer_key** `string` — The participant's SDK identifier. This value can be alphanumeric.
      - **phone_number** `string` — The phone number of the participant who joined via PSTN.
    - **data_connections** `object[]` _requerido_ — A list of data connection records established by the participant in the webinar.
      - `array` de:
        - **connection_type** `string` _requerido_ — The type of in-webinar data connection. · valores: `audio`, `video`, `screen_share`
        - **total_time_cost_ms** `integer` _requerido_ — The total time, in milliseconds, that it took to establish the data connection.
        - **command_connection_time_cost_ms** `integer` _requerido_ — The time, in milliseconds, spent establishing the command connection.
        - **data_socket_time_cost_ms** `integer` _requerido_ — The time, in milliseconds, spent establishing the data socket connection.
        - **first_package_time_cost_ms** `integer` _requerido_ — The time, in milliseconds, from data socket establishment to receiving the first package.

```json
{
  "event": "webinar.participant_data_connection_established",
  "event_ts": 1779673098888,
  "payload": {
    "account_id": "WTpQ2Q_rSKm0-eGZtyakog",
    "object": {
      "id": "1234567890",
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "host_id": "x1yCzABCDEfg23HiJKl4mN",
      "topic": "My Webinar",
      "type": 5,
      "start_time": "2026-07-05T21:42:51Z",
      "participant": {
        "user_id": "1234567890",
        "user_name": "Jill Chill",
        "customer_key": "349589LkJyeW",
        "participant_uuid": "55555AAAiAAAAAiAiAiiAii",
        "join_time": "2026-07-05T21:44:51Z",
        "email": "jchill@example.com",
        "registrant_id": "abcdefghij0-klmnopq23456",
        "participant_user_id": "rstuvwxyza789-cde",
        "phone_number": "8611111111111"
      },
      "data_connections": [
        {
          "connection_type": "audio",
          "total_time_cost_ms": 820,
          "command_connection_time_cost_ms": 140,
          "data_socket_time_cost_ms": 310,
          "first_package_time_cost_ms": 370
        },
        {
          "connection_type": "video",
          "total_time_cost_ms": 1540,
          "command_connection_time_cost_ms": 260,
          "data_socket_time_cost_ms": 720,
          "first_package_time_cost_ms": 560
        },
        {
          "connection_type": "screen_share",
          "total_time_cost_ms": 2015,
          "command_connection_time_cost_ms": 305,
          "data_socket_time_cost_ms": 980,
          "first_package_time_cost_ms": 730
        }
      ]
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST webinar.participant_feedback`

**webinar.participant_feedback**

The **Get participant survey feedback for webinars** event is triggered every time an attendee completes an end-of-webinar [feedback survey](https://support.zoom.us/hc/en-us/articles/115005855266-End-of-meeting-experience-feedback-survey) for a webinar. A webinar attendee is a webinar participant or the host. ## Prerequisites Enable **Event Subscriptions** for your [Marketplace app](https://marketplace.zoom.us/user/build) with: * A valid **Event Notification Endpoint URL**. * The **Get participant survey feedback for webinars** subscription must be enabled under the **Webinar** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:write:admin`,`webinar:read`,`webinar:write`,`webinar:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:participant_feedback:master`,`webinar:read:participant_feedback`,`webinar:read:participant_feedback:admin`

`operationId`: `Webinar.participant_feedbackWebhook` · tags: `Webinars`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The name of the event.
- **event_ts** `integer` _requerido_ — A timestamp when the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who commits the feedback.
  - **object** `object` _requerido_ — Information about the webinar.
    - **id** `string` _requerido_ — The webinar ID.
    - **uuid** `string` _requerido_ — The webinar's universally unique identifier (UUID). Each webinar instance generates a webinar UUID.
    - **participant** `object` _requerido_ — Information about the webinar participant.
      - **participant_uuid** `string` _requerido_ — The participant's meeting universally unique ID (UUID). This value is assigned to a participant when they join a meeting, and is only valid for the duration of the meeting. This value will not be changed when the participant joins/leaves a breakout room.
      - **participant_user_id** `string` _requerido_ — The participant's universally unique ID (UUID). This value returns blank for external users.
      - **user_name** `string` _requerido_ — The participant's display name.
      - **feedback** `object` _requerido_ — Information about the feedback.
        - **satisfied** `boolean` _requerido_ — Whether the participant is satisfied.
        - **feedback_details** `object[]` — The feedback details. This returns null if the `satisfied` field is `true`.
          - `array` de:
            - **id** `string` _requerido_ — The feedback ID. * `1` — Poor video quality. * `2` — Poor audio quality. * `5` — Unable to present using share.zoom.us. * `7` — Unable to make phone call. * `8` — They could not hear us. * `9` — We could not hear them. * `10` — They could not see us. * `11` — We could not see them. * `12` — Could not present computer screen. * `999` — Others.
            - **name** `string` _requerido_ — The feedback name.
        - **comments** `string` — The participant's comments. This returns null if the `satisfied` field is `true`.

```json
{
  "event": "webinar.participant_feedback",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "q6gBJVO5TzexKYTb_I2rpg",
    "object": {
      "id": "7357282288",
      "uuid": "0AErJTQBTI2bSXKyAxIq5A==",
      "participant": {
        "participant_uuid": "I2rpg_q6gBJVO5TzexKYTb",
        "participant_user_id": "zJKyaiAyTNC-MWjiWC18KQ",
        "user_name": "jchill",
        "feedback": {
          "satisfied": true,
          "feedback_details": [
            {
              "id": "2",
              "name": "Poor audio quality"
            }
          ],
          "comments": "good enough"
        }
      }
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST webinar.participant_joined`

**webinar.participant_joined**

The **Participant/Host joined webinar** event is triggered every time a host or an attendee joins a webinar that was created by one of your app users or account users. Zoom users with a [Webinar Plan](https://zoom.us/webinar) have access to creating and managing webinars. A webinar host can invite other users to attend the webinar. <br>[Zoom Video Webinar](https://support.zoom.us/hc/en-us/articles/200917029-Getting-Started-With-Webinar) allows users to broadcast a Zoom meeting to up to 1000 attendees. ## Prerequisites * Pro or a higher plan with Webinar license. * Enable **Event Subscriptions** for your [Marketplace app](https://marketplace.zoom.us/user/build) with: * A valid **Event Notification Endpoint URL**. * The **Participant/Host joined webinar** subscription enabled under the **Webinar** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:write:admin`,`webinar:read`,`webinar:write`,`webinar:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:participant:master`,`webinar:read:participant`,`webinar:read:participant:admin`

`operationId`: `Webinar.participant_joinedWebhook` · tags: `Webinars`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The event's name.
- **event_ts** `integer` _requerido_ — A timestamp when the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who created the webinar.
  - **object** `object` _requerido_ — Information about the webinar.
    - **id** `string` _requerido_ — The webinar ID.
    - **uuid** `string` _requerido_ — The webinar's universally unique identifier (UUID). Each webinar instance generates a webinar UUID.
    - **host_id** `string` _requerido_ — The webinar host's user ID.
    - **topic** `string` _requerido_ — The webinar's topic.
    - **type** `integer` _requerido_ — The webinar type: * `5` - A webinar. * `6` - A recurring webinar without a fixed time. * `9` - A recurring webinar with a fixed time. · valores: `5`, `6`, `9`
    - **start_time** `string` _requerido_ — The webinar's start time. · formato: `date-time`
    - **timezone** `string` _requerido_ — The webinar's [timezone](https://developers.zoom.us/docs/api/rest/other-references/abbreviation-lists/#timezones).
    - **duration** `integer` _requerido_ — The scheduled webinar duration.
    - **participant** `object` _requerido_ — Information about the webinar participant. If the participant is **not** part of the host's account, `email` returns an empty string value, with some exceptions. See [Email address display rules](https://developers.zoom.us/docs/api/rest/using-zoom-apis/#email-address-display-rules) for details.
      - **user_id** `string` _requerido_ — The participant's webinar user ID. This value is assigned to a participant upon joining a webinar and is only valid for the duration of the webinar.
      - **user_name** `string` _requerido_ — The participant's display name.
      - **id** `string` _requerido_ — The participant's universally unique ID (UUID). * If the participant joins the webinar by logging into Zoom, this value is the `id` value in the [**Get a user**](/api-reference/zoom-api/methods#operation/user) API response. * If the participant joins the webinar **without** logging into Zoom, this returns an empty string value. This value returns blank for external users. This value returns blank for external users. **Note:** Use the `participant_user_id` value instead of this value. We will remove this response in a future release.
      - **join_time** `string` _requerido_ — The date and time when the participant joined the webinar. · formato: `date-time`
      - **email** `string` _requerido_ — The participant's email address. This response only returns if the participant joined the webinar by logging into Zoom. If the participant is **not** part of the host's account, this returns an empty string value, with some exceptions. See [Email address display rules](https://developers.zoom.us/docs/api/rest/using-zoom-apis/#email-address-display-rules) for details. · formato: `email`
      - **registrant_id** `string` — The participant's registrant ID. (A host or a user with administrative permissions can require [registration for Zoom meetings](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0065026)).
      - **participant_user_id** `string` — The participant's universally unique ID (UUID). * If the participant joins the webinar by logging into Zoom, this value is the `id` value in the [**Get a user**](/api-reference/zoom-api/methods#operation/user) API response. * If the participant joins the webinar **without** logging into Zoom, this returns an empty string value.
      - **participant_uuid** `string` — The participant's UUID for this specific webinar. This value is assigned to a participant when they join a webinar, and is only valid for the duration of that webinar.
      - **customer_key** `string` — The participant's SDK identifier. This value can be alphanumeric.
      - **phone_number** `string` — Phone number of participant joined via PSTN.

```json
{
  "event": "webinar.participant_joined",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "object": {
      "id": "1234567890",
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "host_id": "x1yCzABCDEfg23HiJKl4mN",
      "topic": "My Webinar",
      "type": 9,
      "start_time": "2021-07-13T21:44:51Z",
      "duration": 60,
      "timezone": "America/Los_Angeles",
      "participant": {
        "user_id": "1234567890",
        "user_name": "Jill Chill",
        "id": "iFxeBPYun6SAiWUzBcEkX",
        "join_time": "2021-07-13T21:44:51Z",
        "email": "jchill@example.com",
        "registrant_id": "abcdefghij0-klmnopq23456",
        "participant_user_id": "rstuvwxyza789-cde",
        "participant_uuid": "55555AAAiAAAAAiAiAiiAii",
        "customer_key": "349589LkJyeW",
        "phone_number": "8615250064084"
      }
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST webinar.participant_left`

**webinar.participant_left**

The **Participant/Host left webinar** event is triggered every time a host of a webinar or an attendee leaves the webinar. The host must be a user on your account or on other accounts that have installed your webhook-enabled app. Zoom users with a [Webinar Plan](https://zoom.us/webinar) have access to creating and managing Webinars. [Zoom Video Webinar](https://support.zoom.us/hc/en-us/articles/200917029-Getting-Started-With-Webinar) allows users to broadcast a Zoom meeting to up to 1000 attendees. ## Prerequisites * Pro or a higher plan with Webinar license. * Enable **Event Subscriptions** for your [Marketplace app](https://marketplace.zoom.us/user/build) with: * A valid **Event Notification Endpoint URL**. * The **Participant/Host left webinar** subscription enabled under the **Webinar** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:write:admin`,`webinar:read`,`webinar:write`,`webinar:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:participant:master`,`webinar:read:participant`,`webinar:read:participant:admin`

`operationId`: `Webinar.participant_leftWebhook` · tags: `Webinars`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The event's name.
- **event_ts** `integer` _requerido_ — A timestamp when the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who created the webinar.
  - **object** `object` _requerido_ — Information about the webinar.
    - **id** `string` _requerido_ — The webinar ID.
    - **uuid** `string` _requerido_ — The webinar's universally unique identifier (UUID). Each webinar instance generates a webinar UUID.
    - **host_id** `string` _requerido_ — The webinar host's user ID.
    - **topic** `string` _requerido_ — The webinar's topic.
    - **type** `integer` _requerido_ — The webinar type. * `5` - A webinar. * `6` - A recurring webinar without a fixed time. * `9` - A recurring webinar with a fixed time. · valores: `5`, `6`, `9`
    - **start_time** `string` _requerido_ — The webinar's start time. · formato: `date-time`
    - **timezone** `string` _requerido_ — The webinar's [timezone](https://developers.zoom.us/docs/api/rest/other-references/abbreviation-lists/#timezones).
    - **duration** `integer` _requerido_ — The scheduled webinar duration.
    - **participant** `object` _requerido_ — Information about the webinar participant. If the participant is **not** part of the host's account, `email` returns an empty string value, with some exceptions. See [Email address display rules](https://developers.zoom.us/docs/api/rest/using-zoom-apis/#email-address-display-rules) for details.
      - **user_id** `string` _requerido_ — The participant's webinar user ID. This value is assigned to a participant upon joining a webinar and is only valid for the duration of the webinar.
      - **user_name** `string` — The participant's display name.
      - **id** `string` — The participant's universally unique ID (UUID). * If the participant joins the webinar by logging into Zoom, this value is the `id` value in the [**Get a user**](/api-reference/zoom-api/methods#operation/user) API response. * If the participant joins the webinar **without** logging into Zoom, this returns an empty string value. This value returns blank for external users. **Note:** Use the `participant_user_id` value instead of this value. We will remove this response in a future release.
      - **leave_time** `string` — The time when the participant left the webinar. · formato: `date-time`
      - **leave_reason** `string` — The reason why the participant left the webinar, where `$name` is the participant's username: * `$name left the meeting.` * `$name got disconnected from the meeting.` * `Host ended the meeting.` * `Host closed the meeting.` * `Host started a new meeting.` * `Network connection error.` * `Host did not join.` * `Exceeded free meeting minutes limit.` * `Removed by host.` * `Unknown reason.` * `Leave waiting room.` * `Removed by host from waiting room.`
      - **email** `string` _requerido_ — The participant's email address. This field is returned if the participant joined the webinar by logging into their Zoom account. If the participant is **not** part of the host's account, this returns an empty string value, with some exceptions. See [Email address display rules](https://developers.zoom.us/docs/api/rest/using-zoom-apis/#email-address-display-rules) for details. · formato: `email`
      - **registrant_id** `string` — The participant's registrant ID. (A host or a user with administrative permissions can require [registration for Zoom meetings](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0065026)).
      - **participant_user_id** `string` — The participant's universally unique ID (UUID). * If the participant joins the webinar by logging into Zoom, this value is the `id` value in the [**Get a user**](/api-reference/zoom-api/methods#operation/user) API response. * If the participant joins the webinar **without** logging into Zoom, this returns an empty string value. This value returns blank for external users.
      - **participant_uuid** `string` — The participant's UUID for this specific webinar. This value is assigned to a participant when they join a webinar, and is only valid for the duration of that webinar.
      - **customer_key** `string` — The participant's SDK identifier. This value can be alphanumeric.
      - **phone_number** `string` — Phone number of participant joined via PSTN.

```json
{
  "event": "webinar.participant_left",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "object": {
      "id": "1234567890",
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "host_id": "x1yCzABCDEfg23HiJKl4mN",
      "topic": "My Webinar",
      "type": 9,
      "start_time": "2021-07-13T21:44:51Z",
      "duration": 60,
      "timezone": "America/Los_Angeles",
      "participant": {
        "user_id": "1234567890",
        "user_name": "Jill Chill",
        "id": "iFxeBPYun6SAiWUzBcEkX",
        "leave_time": "2021-07-13T22:50:51Z",
        "leave_reason": "Jill Chill left the webinar.<br>Reason: Host ended the webinar.",
        "email": "jchill@example.com",
        "registrant_id": "abcdefghij0-klmnopq23456",
        "participant_user_id": "rstuvwxyza789-cde",
        "participant_uuid": "55555AAAiAAAAAiAiAiiAii",
        "customer_key": "349589LkJyeW",
        "phone_number": "8615250064084"
      }
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST webinar.participant_role_changed`

**webinar.participant_role_changed**

The **Participant role changed** event is triggered every time a host or webinar attendee changes the role during a webinar created by one of your app users or account users. A webinar host can invite other users to attend the webinar. Zoom users with a [Webinar plan](https://zoom.us/webinar) have access to creating and managing webinars. [Zoom webinars](https://support.zoom.us/hc/en-us/articles/200917029-Getting-Started-With-Webinar) let users to broadcast a Zoom meeting to up to 1,000 attendees. ## Prerequisites * Pro or a higher plan with Webinar license. * Enable **Event Subscriptions** for your [Marketplace app](https://marketplace.zoom.us/user/build) with: * A valid **Event Notification Endpoint URL**. * The **Participant role changed** subscription enabled under the **Webinar** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:write:admin`,`webinar:read`,`webinar:write`,`webinar:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:participant:master`,`webinar:read:participant`,`webinar:read:participant:admin`

`operationId`: `Webinar.participant_role_changedWebhook` · tags: `Webinars`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The event's name.
- **event_ts** `integer` _requerido_ — A timestamp when the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who created the webinar.
  - **object** `object` _requerido_ — Information about the webinar.
    - **id** `string` _requerido_ — The webinar ID.
    - **uuid** `string` _requerido_ — The webinar's universally unique identifier (UUID). Each webinar instance generates a webinar UUID.
    - **host_id** `string` _requerido_ — The webinar host's user ID.
    - **topic** `string` _requerido_ — The webinar's topic.
    - **type** `integer` _requerido_ — The webinar type: * `5` — A webinar. * `6` — A recurring webinar without a fixed time. * `9` — A recurring webinar with a fixed time. · valores: `5`, `6`, `9`
    - **start_time** `string` _requerido_ — The webinar's start time. · formato: `date-time`
    - **timezone** `string` _requerido_ — The webinar's [timezone](https://developers.zoom.us/docs/api/rest/other-references/abbreviation-lists/#timezones).
    - **duration** `integer` _requerido_ — The scheduled webinar duration.
    - **participant** `object` _requerido_ — Information about the webinar participant.
      - **user_id** `string` _requerido_ — The participant's webinar user ID. This value is assigned to a participant upon joining a webinar and is only valid for the duration of the webinar.
      - **user_name** `string` _requerido_ — The participant's display name.
      - **email** `string` _requerido_ — The participant's email address. This response only returns if the participant joined the webinar by logging into Zoom. If the participant is **not** part of the host's account, this returns an empty string value, with some exceptions. For more information, read our [Email address display rules](https://developers.zoom.us/docs/api/rest/using-zoom-apis/#email-address-display-rules) documentation. · formato: `email`
      - **registrant_id** `string` — The participant's registrant ID. (A host or a user with administrative permissions can require [registration for Zoom meetings](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0065026)).
      - **participant_user_id** `string` — The participant's universally unique ID (UUID). * If the participant joins the webinar by logging into Zoom, this value is the `id` value in the [**Get a user**](/api-reference/zoom-api/methods#operation/user) API response. * If the participant joins the webinar **without** logging into Zoom, this returns an empty string value. This value returns blank for external users
      - **participant_uuid** `string` — The participant's UUID for this specific webinar. This value is assigned to a participant when they join a webinar, and is only valid for the duration of that webinar.
      - **date_time** `string` _requerido_ — The time when the participant changed the [role](https://support.zoom.us/hc/en-us/articles/360000252726-Roles-in-a-Zoom-Webinar). · formato: `date-time`
      - **old_role** `string` _requerido_ — The participant's previous role. * `host` — Host. * `co-host` — Co-host. * `attendee` — Attendee. · valores: `host`, `co-host`, `attendee`
      - **new_role** `string` _requerido_ — The participant's new role. * `host` — Host. * `co-host` — Co-host. * `attendee` — Attendee. · valores: `host`, `co-host`, `attendee`

```json
{
  "event": "webinar.participant_role_changed",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "object": {
      "id": "1234567890",
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "host_id": "x1yCzABCDEfg23HiJKl4mN",
      "topic": "My Webinar",
      "type": 9,
      "start_time": "2021-07-13T21:44:51Z",
      "duration": 60,
      "timezone": "America/Los_Angeles",
      "participant": {
        "user_id": "1234567890",
        "user_name": "JillChill",
        "email": "jchill@example.com",
        "registrant_id": "abcdefghij0-klmnopq23456",
        "participant_user_id": "rstuvwxyza789-cde",
        "customer_key": "349589LkJyeW",
        "date_time": "2021-07-13T21:44:51Z",
        "old_role": "host",
        "new_role": "co-host"
      }
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST webinar.permanently_deleted`

**webinar.permanently_deleted**

The **Webinar has been permanently deleted** event is triggered every time a scheduled webinar is permanently deleted. A webinar host or a user with admin privileges can permanently delete a webinar via the [Zoom web portal](https://zoom.us). ## Prerequisites * A Pro or higher plan. * Enable **Event Subscriptions** for your [Marketplace app](https://marketplace.zoom.us/user/build) with the following configurations: * A valid **Event Notification Endpoint URL**. * The **Webinar has been permanently deleted** subscription enabled under the **Webinar** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:write:admin`,`webinar:read`,`webinar:write`,`webinar:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:webinar:master`,`webinar:read:webinar`,`webinar:read:webinar:admin`

`operationId`: `Webinar.permanently_deletedWebhook` · tags: `Webinars`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The name of the event.
- **event_ts** `integer` _requerido_ — A timestamp when the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who permanently deleted the webinar.
  - **operator** `string` _requerido_ — The email address of the user who permanently deleted the webinar. · formato: `email`
  - **operator_id** `string` _requerido_ — The user ID of the user who permanently deleted the webinar.
  - **operation** `string` — The type of operation performed. * `all` — The change was applied to all webinars. * `single` — The change was applied only to a single webinar. · valores: `all`, `single`
  - **object** `object` _requerido_ — Information about the webinar.
    - **uuid** `string` _requerido_ — The webinar's universally unique identifier (UUID). Each webinar instance generates a webinar UUID.
    - **id** `integer` _requerido_ — The webinar ID. · formato: `int64`
    - **host_id** `string` _requerido_ — The webinar host's user ID.
    - **topic** `string` _requerido_ — The webinar's topic.
    - **type** `integer` _requerido_ — The webinar type. * `5` — A webinar. * `6` — A recurring webinar without a fixed time. * `9` — A recurring webinar with a fixed time. · valores: `5`, `6`, `9`
    - **start_time** `string` _requerido_ — The webinar's start time. · formato: `date-time`
    - **duration** `integer` _requerido_ — The scheduled webinar duration.
    - **timezone** `string` _requerido_ — The webinar's [timezone](https://marketplace.zoom.us/docs/api-reference/other-references/abbreviation-lists#timezones).
    - **occurrences** `object[]` — Information about recurring webinars with fixed times and their occurrences. This only returns when the webinar's `type` value is `9`.
      - `array` de:
        - _cualquiera de:_
          - **object**
            - **occurrence_id** `string` _requerido_ — The webinar occurrence's ID.
            - **start_time** `string` _requerido_ — The webinar's start time. · formato: `date-time`

```json
{
  "event": "webinar.permanently_deleted",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "operator": "admin@example.com",
    "operator_id": "z8yCxjabcdEFGHfp8uQ",
    "operation": "single",
    "object": {
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "id": 1234567890,
      "host_id": "x1yCzABCDEfg23HiJKl4mN",
      "topic": "My Webinar",
      "type": 9,
      "start_time": "2021-07-13T21:44:51Z",
      "duration": 60,
      "timezone": "America/Los_Angeles",
      "occurrences": [
        {
          "occurrence_id": "1677637740000",
          "start_time": "2023-03-01T02:29:00Z"
        }
      ]
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST webinar.recovered`

**webinar.recovered**

The **Webinar has been recovered** event is triggered every time a user recovers a previously-deleted webinar. The user must be a user on your account or on any other accounts that have installed your [webhook-enabled](https://marketplace.zoom.us/docs/api-reference/webhook-reference#enable-webhooks) app. Zoom users can restore previously-deleted webinars for up to one week after deletion. Any invitations, links, and webinar IDs sent prior to the webinar's deletion will still work after a user [recovers](https://support.zoom.us/hc/en-us/articles/360038297111-Recovering-a-deleted-meeting-or-webinar) it. ## Prerequisites * Enable **Event Subscriptions** for your [Marketplace app](https://marketplace.zoom.us/user/build) with the following configurations: * A valid **Event Notification Endpoint URL**. * The **Webinar has been recovered** subscription enabled under the **Webinar** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:write:admin`,`webinar:read`,`webinar:write`,`webinar:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:webinar:master`,`webinar:read:webinar`,`webinar:read:webinar:admin`

`operationId`: `Webinar.recoveredWebhook` · tags: `Webinars`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The name of the event.
- **event_ts** `integer` _requerido_ — A timestamp at which the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who recovered the webinar.
  - **operator** `string` _requerido_ — The email address of the user who recovered the webinar. · formato: `email`
  - **operator_id** `string` _requerido_ — The user ID of the user who recovered the webinar.
  - **operation** `string` — The type of operation performed: * `all` — The change was applied to all webinars. * `single` — The change was applied only to a single webinar. · valores: `all`, `single`
  - **object** `object` _requerido_ — Information about the webinar.
    - **uuid** `string` _requerido_ — The webinar's universally unique identifier (UUID). Each webinar instance generates a webinar UUID.
    - **id** `integer` _requerido_ — The webinar ID. · formato: `int64`
    - **host_id** `string` _requerido_ — The webinar host's user ID.
    - **topic** `string` _requerido_ — The webinar's topic.
    - **type** `integer` _requerido_ — The webinar type: * `5` — A webinar. * `6` — A recurring webinar without a fixed time. * `9` — A recurring webinar with a fixed time. · valores: `5`, `6`, `9`
    - **start_time** `string` _requerido_ — The webinar's start time. · formato: `date-time`
    - **duration** `integer` _requerido_ — The scheduled webinar duration.
    - **timezone** `string` _requerido_ — The webinar's [timezone](https://marketplace.zoom.us/docs/api-reference/other-references/abbreviation-lists#timezones).
    - **occurrences** `object[]` — Information about recurring webinars with fixed times and their occurrences. This only returns when the webinar's `type` value is `9`.
      - `array` de:
        - _cualquiera de:_
          - **object**
            - **occurrence_id** `string` _requerido_ — The webinar occurrence's ID.
            - **start_time** `string` _requerido_ — The webinar's start time. · formato: `date-time`

```json
{
  "event": "webinar.recovered",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "operator": "admin@example.com",
    "operator_id": "z8yCxjabcdEFGHfp8uQ",
    "operation": "single",
    "object": {
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "id": 1234567890,
      "host_id": "x1yCzABCDEfg23HiJKl4mN",
      "topic": "My Webinar",
      "type": 9,
      "start_time": "2021-07-13T21:44:51Z",
      "duration": 60,
      "timezone": "America/Los_Angeles",
      "occurrences": [
        {
          "occurrence_id": "1677637740000",
          "start_time": "2023-03-01T02:29:00Z"
        }
      ]
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST webinar.registration_approved`

**webinar.registration_approved**

The **Webinar Registration has been approved** event is triggered every time one of your app users or account users approve a user's registration. [Scheduling a Webinar with registration](https://support.zoom.us/hc/en-us/articles/204619915-Scheduling-a-Webinar-with-Registration) requires registrants to complete a brief form before receiving the link to join a Webinar. [Webinar Registration options](https://support.zoom.us/hc/en-us/articles/202835649-Webinar-Registration-Customization#h_b74e0e26-5f3f-40d4-a3de-949dbfd85882) can be customized by a Zoom admin or a Webinar host. This customization allows them to choose whether to approve attendees automatically or manually. When the registration is set to be approved manually, a pending registrant can either be approved or denied from joining the Webinar. To approve a registrant manually, navigate to the [Webinars](https://zoom.us/webinar/list) page and click on the name of the webinar. Click **Edit** to the right of **Manage Attendees** option, select the registrant and click **Approve**. Alternatively, use the [**Update registrant's status**](/docs/api-reference/zoom-api/methods#operation/webinarRegistrantStatus) API to approve the registrant programmatically. ## Prerequisites * Pro or a higher plan with Webinar license. * **Manual Approval** enabled for [Webinar Registrations](https://support.zoom.us/hc/en-us/articles/211579443-Registration-for-Meetings). * **Event Subscriptions** must be enabled for your [Marketplace app](https://marketplace.zoom.us/user/build) with the following configurations: * A valid **Event Notification Endpoint URL** * The **Webinar Registration has been approved** subscription enabled under the **Webinar** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:write:admin`,`webinar:read`,`webinar:write`,`webinar:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:registrant:master`,`webinar:read:registrant`,`webinar:read:registrant:admin`

`operationId`: `Webinar.registration_approvedWebhook` · tags: `Webinars`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The name of the event.
- **event_ts** `integer` _requerido_ — A timestamp at which the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who approved the registration.
  - **operator** `string` _requerido_ — The email address of the user who approved the webinar registration. · formato: `email`
  - **operator_id** `string` _requerido_ — The user ID of the user who approved the webinar registration.
  - **object** `object` _requerido_ — Information about the webinar registration.
    - **uuid** `string` _requerido_ — The webinar's universally unique identifier (UUID). Each webinar instance generates a webinar UUID.
    - **id** `integer` _requerido_ — The webinar ID.
    - **host_id** `string` _requerido_ — The webinar host's user ID.
    - **topic** `string` _requerido_ — The webinar's topic.
    - **type** `integer` _requerido_ — The webinar type: * `5` — A webinar. * `6` — A recurring webinar without a fixed time. * `9` — A recurring webinar with a fixed time. · valores: `5`, `6`, `9`
    - **start_time** `string` _requerido_ — The webinar's start time. · formato: `date-time`
    - **duration** `integer` _requerido_ — The scheduled webinar duration.
    - **timezone** `string` _requerido_ — The webinar's [timezone](https://marketplace.zoom.us/docs/api-reference/other-references/abbreviation-lists#timezones).
    - **occurrences** `object[]` — Information about recurring webinar with fixed times and their occurrences. This only returns when the webinar's `type` value is `9`.
      - `array` de:
        - _cualquiera de:_
          - **object**
            - **occurrence_id** `string` _requerido_ — The webinar occurrence's ID.
            - **start_time** `string` _requerido_ — The webinar's start time. · formato: `date-time`
    - **registrant** `object` _requerido_ — Information about the webinar registrant.
      - **id** `string` _requerido_ — The registrant's ID.
      - **first_name** `string` _requerido_ — The registrant's first name.
      - **last_name** `string` — The registrant's last name.
      - **email** `string` _requerido_ — The registrant's email address. · formato: `email`
      - **join_url** `string` _requerido_ — The URL to join the webinar.
      - **tracking_source** `object` — Information about the source tracking. See [Creating webinar registration tracking links](https://support.zoom.us/hc/en-us/articles/360000315683-Creating-webinar-registration-tracking-links) for details.
        - **id** `string` _requerido_ — Unique Identifier of the tracking source.
        - **source_name** `string` _requerido_ — Name of the source (platform) where the registration URL was shared.
        - **tracking_url** `string` _requerido_ — Tracking URL. The URL that was shared for the registration.

```json
{
  "event": "webinar.registration_approved",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "operator": "admin@example.com",
    "operator_id": "z8yCxjabcdEFGHfp8uQ",
    "object": {
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "id": 1234567890,
      "host_id": "x1yCzABCDEfg23HiJKl4mN",
      "topic": "My Webinar",
      "type": 9,
      "start_time": "2021-07-13T21:44:51Z",
      "duration": 60,
      "timezone": "America/Los_Angeles",
      "occurrences": [
        {
          "occurrence_id": "ABCDE12345",
          "start_time": "2021-07-13T21:44:51Z"
        }
      ],
      "registrant": {
        "id": "iFxeBPYun6SAiWUzBcEkX",
        "first_name": "Jill",
        "last_name": "Chill",
        "email": "jchill@example.com",
        "join_url": "https://example.com",
        "tracking_source": {
          "id": "5516482804110",
          "source_name": "general",
          "tracking_url": "https://example.com/webinar/register/5516482804110/WN_juM2BGyLQMyQ_ZrqiGRhLg"
        }
      }
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST webinar.registration_cancelled`

**webinar.registration_cancelled**

The **Webinar Registration has been canceled** event is triggered whenever one of these two conditions are met: * A registrant cancels their registration for a Webinar created by one of your app users or account users. * A host who is also a user of your app or your Zoom account cancels the registration of a registrant who was previously approved. [Scheduling a Webinar with registration](https://support.zoom.us/hc/en-us/articles/204619915-Scheduling-a-Webinar-with-Registration) requires registrants to complete a brief form before receiving the link to join the Webinar. [Webinar Registration options](https://support.zoom.us/hc/en-us/articles/202835649-Webinar-Registration-Customization#h_b74e0e26-5f3f-40d4-a3de-949dbfd85882) can be customized by a Zoom admin or a Webinar host. This customization allows them to choose whether to approve attendees automatically or manually. ## Prerequisites * Pro or a higher plan with Webinar license. * **Event Subscriptions** must be enabled for your [Marketplace app](https://marketplace.zoom.us/user/build) with the following configurations: * A valid **Event Notification Endpoint URL** * The **Webinar Registration has been canceled** subscription enabled under the **Webinar** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:write:admin`,`webinar:read`,`webinar:write`,`webinar:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:registrant:master`,`webinar:read:registrant`,`webinar:read:registrant:admin`

`operationId`: `Webinar.registration_cancelledWebhook` · tags: `Webinars`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The name of the event.
- **event_ts** `integer` _requerido_ — A timestamp at which the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who created the webinar.
  - **operator** `string` _requerido_ — The email address of the user who canceled the webinar registration. · formato: `email`
  - **operator_id** `string` — The user ID of the user who canceled the webinar registration.
  - **object** `object` _requerido_ — Information about the webinar registration.
    - **uuid** `string` _requerido_ — The webinar's universally unique identifier (UUID). Each webinar instance generates a webinar UUID.
    - **id** `integer` _requerido_ — The webinar ID.
    - **host_id** `string` _requerido_ — The webinar host's user ID.
    - **topic** `string` _requerido_ — The webinar's topic.
    - **type** `integer` _requerido_ — The webinar type: * `5` — A webinar. * `6` — A recurring webinar without a fixed time. * `9` — A recurring webinar with a fixed time. · valores: `5`, `6`, `9`
    - **start_time** `string` _requerido_ — The webinar's start time. · formato: `date-time`
    - **duration** `integer` _requerido_ — The scheduled webinar duration.
    - **timezone** `string` _requerido_ — The webinar's [timezone](https://marketplace.zoom.us/docs/api-reference/other-references/abbreviation-lists#timezones).
    - **occurrences** `object[]` — Information about recurring webinars with fixed times and their occurrences. This only returns when the webinar's `type` value is `9`.
      - `array` de:
        - _cualquiera de:_
          - **object**
            - **occurrence_id** `string` _requerido_ — The webinar occurrence's ID.
            - **start_time** `string` _requerido_ — The webinar's start time. · formato: `date-time`
    - **registrant** `object` _requerido_ — Information about the webinar registrant.
      - **id** `string` _requerido_ — The registrant's ID.
      - **first_name** `string` _requerido_ — The registrant's first name.
      - **last_name** `string` — The registrant's last name.
      - **email** `string` _requerido_ — The registrant's email address. · formato: `email`
      - **tracking_source** `object` — Information about the source tracking. See [Creating webinar registration tracking links](https://support.zoom.us/hc/en-us/articles/360000315683-Creating-webinar-registration-tracking-links) for details.
        - **id** `string` _requerido_ — Unique Identifier of the tracking source.
        - **source_name** `string` _requerido_ — Name of the source (platform) where the registration URL was shared.
        - **tracking_url** `string` _requerido_ — Tracking URL. The URL that was shared for the registration.

```json
{
  "event": "webinar.registration_cancelled",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "operator": "admin@example.com",
    "operator_id": "z8yCxjabcdEFGHfp8uQ",
    "object": {
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "id": 1234567890,
      "host_id": "x1yCzABCDEfg23HiJKl4mN",
      "topic": "My Webinar",
      "type": 9,
      "start_time": "2021-07-13T21:44:51Z",
      "duration": 60,
      "timezone": "America/Los_Angeles",
      "occurrences": [
        {
          "occurrence_id": "ABCDE12345",
          "start_time": "2021-07-13T21:44:51Z"
        }
      ],
      "registrant": {
        "id": "iFxeBPYun6SAiWUzBcEkX",
        "first_name": "Jill",
        "last_name": "Chill",
        "email": "jchill@example.com",
        "tracking_source": {
          "id": "5516482804110",
          "source_name": "general",
          "tracking_url": "https://example.com/webinar/register/5516482804110/WN_juM2BGyLQMyQ_ZrqiGRhLg"
        }
      }
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST webinar.registration_created`

**webinar.registration_created**

The **Webinar Registration has been created** event is triggered every time someone registers for a Webinar created by one of your app users or account users. Zoom users with a [Webinar Plan](https://zoom.us/webinar) have access to creating and managing Webinars. [Zoom Video Webinar](https://support.zoom.us/hc/en-us/articles/200917029-Getting-Started-With-Webinar) allows users to broadcast a Zoom meeting to up to 1000 attendees. [Scheduling a Webinar with registration](https://support.zoom.us/hc/en-us/articles/204619915-Scheduling-a-Webinar-with-Registration) requires your registrants to complete a brief form before receiving the link to join the Webinar. ## Prerequisites * Pro or a higher plan with Webinar license. * **Event Subscriptions** must be enabled for your [Marketplace App](https://marketplace.zoom.us/user/build) with the following configurations: * A valid **Event notification endpoint URL** * The **Webinar Registration has been created** subscription enabled under the **Meeting** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:write:admin`,`webinar:read`,`webinar:write`,`webinar:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:registrant:master`,`webinar:read:registrant`,`webinar:read:registrant:admin`

`operationId`: `Webinar.registration_createdWebhook` · tags: `Webinars`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The name of the event.
- **event_ts** `integer` _requerido_ — A timestamp at which the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who created the webinar.
  - **object** `object` _requerido_ — Information about the webinar registration.
    - **uuid** `string` _requerido_ — The webinar's universally unique identifier (UUID). Each webinar instance generates a webinar UUID.
    - **id** `integer` _requerido_ — The webinar ID.
    - **host_id** `string` _requerido_ — The webinar host's user ID.
    - **topic** `string` _requerido_ — The webinar's topic.
    - **type** `integer` _requerido_ — The webinar type: * `5` — A webinar. * `6` — A recurring webinar without a fixed time. * `9` — A recurring webinar with a fixed time. · valores: `5`, `6`, `9`
    - **start_time** `string` _requerido_ — The webinar's start time. · formato: `date-time`
    - **duration** `integer` _requerido_ — The scheduled webinar duration.
    - **timezone** `string` _requerido_ — The webinar's [timezone](https://marketplace.zoom.us/docs/api-reference/other-references/abbreviation-lists#timezones).
    - **occurrences** `object[]` — Information about recurring webinar with fixed times and their occurrences. This only returns when the webinar's `type` value is `9`.
      - `array` de:
        - _cualquiera de:_
          - **object**
            - **occurrence_id** `string` _requerido_ — The webinar occurrence's ID.
            - **start_time** `string` _requerido_ — The webinar's start time. · formato: `date-time`
    - **registrant** `object` _requerido_ — Information about the webinar registrant.
      - **id** `string` _requerido_ — The registrant's ID.
      - **first_name** `string` _requerido_ — The registrant's first name.
      - **last_name** `string` — The registrant's last name.
      - **email** `string` _requerido_ — The registrant's email address. · formato: `email`
      - **address** `string` — The registrant's address.
      - **city** `string` — The registrant's city.
      - **country** `string` — The registrant's two-letter [country code](https://marketplace.zoom.us/docs/api-reference/other-references/abbreviation-lists#countries).
      - **zip** `string` — The registrant's ZIP or postal code.
      - **state** `string` — The registrant's state or province.
      - **phone** `string` — The registrant's phone number.
      - **industry** `string` — The registrant's industry.
      - **org** `string` — The registrant's organization.
      - **job_title** `string` — The registrant's job title.
      - **purchasing_time_frame** `string` — The registrant's purchasing time frame: * `Within a month` * `1-3 months` * `4-6 months` * `More than 6 months` * `No timeframe` · valores: ``, `Within a month`, `1-3 months`, `4-6 months`, `More than 6 months`, `No timeframe`
      - **role_in_purchase_process** `string` — The registrant's role in the purchase process: * `Decision Maker` * `Evaluator/Recommender` * `Influencer` * `Not involved` · valores: ``, `Decision Maker`, `Evaluator/Recommender`, `Influencer`, `Not involved`
      - **no_of_employees** `string` — The registrant's number of employees: * `1-20` * `21-50` * `51-100` * `101-250` * `251-500` * `501-1,000` * `1,001-5,000` * `5,001-10,000` * `More than 10,000` · valores: ``, `1-20`, `21-50`, `51-100`, `101-250`, `251-500`, `501-1,000`, `1,001-5,000`, `5,001-10,000`, `More than 10,000`
      - **comments** `string` — The registrant's questions and comments.
      - **custom_questions** `object[]` — Information about custom questions.
        - `array` de:
          - _cualquiera de:_
            - **object**
              - **title** `string` _requerido_ — The title of the custom question.
              - **value** `string` _requerido_ — The custom question's response value. This has a limit of 128 characters.
      - **status** `string` _requerido_ — The registrant's registration approval status: * `approve` — Approved registrant. * `pending` — Registration approval pending. · valores: `approved`, `pending`
      - **join_url** `string` _requerido_ — The URL to join the webinar.
      - **tracking_source** `object` — Information about the source tracking. See [Creating webinar registration tracking links](https://support.zoom.us/hc/en-us/articles/360000315683-Creating-webinar-registration-tracking-links) for details.
        - **id** `string` _requerido_ — Unique Identifier of the tracking source.
        - **source_name** `string` _requerido_ — Name of the source (platform) where the registration URL was shared.
        - **tracking_url** `string` _requerido_ — Tracking URL. The URL that was shared for the registration.

```json
{
  "event": "webinar.registration_created",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "object": {
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "id": 1234567890,
      "host_id": "x1yCzABCDEfg23HiJKl4mN",
      "topic": "My Webinar",
      "type": 9,
      "start_time": "2021-07-13T21:44:51Z",
      "duration": 60,
      "timezone": "America/Los_Angeles",
      "occurrences": [
        {
          "occurrence_id": "ABCDE12345",
          "start_time": "2021-07-13T21:44:51Z"
        }
      ],
      "registrant": {
        "id": "iFxeBPYun6SAiWUzBcEkX",
        "first_name": "Jill",
        "last_name": "Chill",
        "email": "jchill@example.com",
        "address": "1800 Amphibious Blvd.",
        "city": "Mountain View",
        "country": "US",
        "zip": "94045",
        "state": "CA",
        "phone": "5550100",
        "industry": "Food",
        "org": "Cooking Org",
        "job_title": "Chef",
        "purchasing_time_frame": "1-3 months",
        "role_in_purchase_process": "Influencer",
        "no_of_employees": "1-20",
        "comments": "Looking forward to the Webinar",
        "custom_questions": [
          {
            "title": "What do you hope to learn from this Webinar?",
            "value": "Look forward to learning how you come up with new recipes and what other services you offer."
          }
        ],
        "status": "approved",
        "join_url": "https://example.com",
        "tracking_source": {
          "id": "5516482804110",
          "source_name": "general",
          "tracking_url": "https://example.com/webinar/register/5516482804110/WN_juM2BGyLQMyQ_ZrqiGRhLg"
        }
      }
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST webinar.registration_denied`

**webinar.registration_denied**

The **Webinar Registration has been denied** event is triggered every time one of your app users or account users denies a user's registration. [Scheduling a Webinar with registration](https://support.zoom.us/hc/en-us/articles/204619915-Scheduling-a-Webinar-with-Registration) requires registrants to complete a brief form before receiving the link to join the Webinar.[Webinar Registration options](https://support.zoom.us/hc/en-us/articles/202835649-Webinar-Registration-Customization#h_b74e0e26-5f3f-40d4-a3de-949dbfd85882) can be customized by a Zoom admin or a Webinar host. This customization allows them to choose whether to approve attendees automatically or manually. When the registration is set to be approved manually, a pending registrant can be denied from joining the Webinar. To deny a registrant manually, navigate to your Webinars page and click on the name of the Webinar. Click **Edit** to the right of **Manage Attendees** option, select the user and click **Deny**. Alternatively, the registrant can be denied using the [**Update registrant's status**](/docs/api-reference/zoom-api/methods#operation/webinarRegistrantStatus) API. ## Prerequisites * Pro or a higher plan with Webinar license. * **Event Subscriptions** must be enabled for your [Marketplace app](https://marketplace.zoom.us/user/build) with the following configurations: * A valid **Event Notification Endpoint URL**. * The **Webinar Registration has been denied** subscription enabled under the **Webinar** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:write:admin`,`webinar:read`,`webinar:write`,`webinar:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:registrant:master`,`webinar:read:registrant`,`webinar:read:registrant:admin`

`operationId`: `Webinar.registration_deniedWebhook` · tags: `Webinars`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The name of the event.
- **event_ts** `integer` _requerido_ — A timestamp at which the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who created the webinar.
  - **operator** `string` _requerido_ — The email address of the user who denied the webinar registration. · formato: `email`
  - **operator_id** `string` _requerido_ — The user ID of the user who denied the webinar registration.
  - **object** `object` _requerido_ — Information about the webinar registration.
    - **uuid** `string` _requerido_ — The webinar's universally unique identifier (UUID). Each webinar instance generates a webinar UUID.
    - **id** `integer` _requerido_ — The webinar ID.
    - **host_id** `string` _requerido_ — The webinar host's user ID.
    - **topic** `string` _requerido_ — The webinar's topic.
    - **type** `integer` _requerido_ — The webinar type: * `5` — A webinar. * `6` — A recurring webinar without a fixed time. * `9` — A recurring webinar with a fixed time. · valores: `5`, `6`, `9`
    - **start_time** `string` _requerido_ — The webinar's start time. · formato: `date-time`
    - **duration** `integer` _requerido_ — The scheduled webinar duration.
    - **timezone** `string` _requerido_ — The webinar's [timezone](https://marketplace.zoom.us/docs/api-reference/other-references/abbreviation-lists#timezones).
    - **occurrences** `object[]` — Information about recurring webinars with fixed times and their occurrences. This only returns when the webinar's `type` value is `9`.
      - `array` de:
        - _cualquiera de:_
          - **object**
            - **occurrence_id** `string` _requerido_ — The webinar occurrence's ID.
            - **start_time** `string` _requerido_ — The webinar's start time. · formato: `date-time`
    - **registrant** `object` _requerido_ — Information about the webinar registrant.
      - **id** `string` _requerido_ — The registrant's ID.
      - **first_name** `string` _requerido_ — The registrant's first name.
      - **last_name** `string` — The registrant's last name.
      - **email** `string` _requerido_ — The registrant's email address. · formato: `email`
      - **tracking_source** `object` — Information about the source tracking. See [Creating webinar registration tracking links](https://support.zoom.us/hc/en-us/articles/360000315683-Creating-webinar-registration-tracking-links) for details.
        - **id** `string` _requerido_ — Unique Identifier of the tracking source.
        - **source_name** `string` _requerido_ — Name of the source (platform) where the registration URL was shared.
        - **tracking_url** `string` _requerido_ — Tracking URL. The URL that was shared for the registration.

```json
{
  "event": "webinar.registration_created",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "object": {
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "id": 1234567890,
      "host_id": "x1yCzABCDEfg23HiJKl4mN",
      "topic": "My Webinar",
      "type": 9,
      "start_time": "2021-07-13T21:44:51Z",
      "duration": 60,
      "timezone": "America/Los_Angeles",
      "occurrences": [
        {
          "occurrence_id": "ABCDE12345",
          "start_time": "2021-07-13T21:44:51Z"
        }
      ],
      "registrant": {
        "id": "iFxeBPYun6SAiWUzBcEkX",
        "first_name": "Jill",
        "last_name": "Chill",
        "email": "jchill@example.com",
        "tracking_source": {
          "id": "5516482804110",
          "source_name": "general",
          "tracking_url": "https://example.com/webinar/register/5516482804110/WN_juM2BGyLQMyQ_ZrqiGRhLg"
        }
      }
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST webinar.sharing_ended`

**webinar.sharing_ended**

The **Webinar Sharing Ended** event is triggered every time one of your app users or account users stop sharing their screen during a Webinar. Zoom supports [screen sharing](https://support.zoom.us/hc/en-us/articles/201362153-Screen-Sharing-and-Annotations) by host or panelists on desktop, tablet and mobile devices running Zoom during webinars. ## Prerequisites * Pro or a higher plan with Webinar license. * **Event Subscriptions** must be enabled for your [Marketplace app](https://marketplace.zoom.us/user/build) with the following configurations: * A valid **Event Notification Endpoint URL**. * The **Webinar Sharing Ended** subscription enabled under the **Webinar** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:write:admin`,`webinar:read`,`webinar:write`,`webinar:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:participant_sharing:master`,`webinar:read:participant_sharing`,`webinar:read:participant_sharing:admin`

`operationId`: `Webinar.sharing_endedWebhook` · tags: `Webinars`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The name of the event.
- **event_ts** `integer` _requerido_ — A timestamp at which the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who created the webinar.
  - **object** `object` _requerido_ — Information about the webinar.
    - **id** `string` _requerido_ — The webinar ID.
    - **uuid** `string` _requerido_ — The webinar's universally unique identifier (UUID). Each webinar instance generates a webinar UUID.
    - **host_id** `string` _requerido_ — The webinar host's user ID.
    - **topic** `string` _requerido_ — The webinar's topic.
    - **type** `integer` _requerido_ — The webinar type: * `5` — A webinar. * `6` — A recurring webinar without a fixed time. * `9` — A recurring webinar with a fixed time. · valores: `5`, `6`, `9`
    - **start_time** `string` _requerido_ — The webinar's start time.
    - **timezone** `string` — The webinar's [timezone](https://marketplace.zoom.us/docs/api-reference/other-references/abbreviation-lists#timezones).
    - **duration** `integer` _requerido_ — The scheduled webinar duration.
    - **participant** `object` _requerido_ — Information about the webinar participant.
      - **user_id** `string` _requerido_ — The participant's webinar user ID. This value is assigned to a participant upon joining a webinar and is only valid for the duration of the webinar.
      - **user_name** `string` — The participant's display name.
      - **id** `string` — The participant's universally unique ID (UUID): * If the participant joins the webinar by logging into Zoom, this value is the `id` value in the [**Get a user**](/api-reference/zoom-api/methods#operation/user) API response. * If the participant joins the webinar **without** logging into Zoom, this returns an empty string value.
      - **sharing_details** `object` _requerido_ — Information about the webinar's screenshare.
        - **content** `string` _requerido_ — The type of shared content: * `application` — An application. For example, a web browser. * `whiteboard` — The [classic whiteboard](https://support.zoom.us/hc/en-us/articles/205677665-Sharing-a-whiteboard). * `desktop` — A user's desktop. * `airplay` — A user's [AirPlay (Apple screen mirroring)](https://support.zoom.us/hc/en-us/articles/204726885-Sharing-screen-using-Apple-screen-mirroring-AirPlay-). * `camera` — A user's camera. * `unknown` — An unrecognized application, such as a third party app. · valores: `application`, `whiteboard`, `desktop`, `airplay`, `camera`, `unknown`
        - **link_source** `string` _requerido_ — The Dropbox sharing method: * `deep_link` — A [deep link](https://en.wikipedia.org/wiki/Deep_linking). * `in_meeting` — A link shared via Zoom. * An empty string value if the link source is **not** a Dropbox link. · valores: ``, `deep_link`, `in_meeting`
        - **file_link** `string` _requerido_ — The Dropbox file's link. This field returns an empty string value if the file link is **not** from a Dropbox source.
        - **date_time** `string` _requerido_ — The screenshare's date and time. · formato: `date-time`
        - **source** `string` _requerido_ — The source from which the file was shared: * `dropbox` — A Dropbox source. * An empty string if the source is **not** Dropbox. · valores: ``, `dropbox`

```json
{
  "event": "webinar.sharing_ended",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "object": {
      "id": "1234567890",
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "host_id": "x1yCzABCDEfg23HiJKl4mN",
      "topic": "My Webinar",
      "type": 9,
      "start_time": "2021-07-13T21:44:51Z",
      "timezone": "America/Los_Angeles",
      "duration": 60,
      "participant": {
        "user_id": "ABCDE12345",
        "user_name": "JillChill",
        "sharing_details": {
          "content": "application",
          "link_source": "in_meeting",
          "file_link": "",
          "date_time": "2021-07-13T21:56:00Z",
          "source": "dropbox"
        }
      }
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST webinar.sharing_started`

**webinar.sharing_started**

The **Webinar Sharing Started** event is triggered every time one of your app users or account users share their screen during a Webinar. Zoom supports [screen sharing](https://support.zoom.us/hc/en-us/articles/201362153-Screen-Sharing-and-Annotations) by host or panelists on desktop, tablet and mobile devices running Zoom during Webinars. ## Prerequisites * Pro or a higher plan with Webinar license. * **Event Subscriptions** must be enabled for your [Marketplace app](https://marketplace.zoom.us/user/build) with the following configurations: * A valid **Event Notification Endpoint URL**. * The **Webinar Sharing Started** subscription enabled under the **Meeting** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:write:admin`,`webinar:read`,`webinar:write`,`webinar:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:participant_sharing:master`,`webinar:read:participant_sharing`,`webinar:read:participant_sharing:admin`

`operationId`: `Webinar.sharing_startedWebhook` · tags: `Webinars`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The name of the event.
- **event_ts** `integer` _requerido_ — A timestamp at which the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who created the webinar.
  - **object** `object` _requerido_ — Information about the webinar.
    - **id** `string` _requerido_ — The webinar ID.
    - **uuid** `string` _requerido_ — The webinar's universally unique identifier (UUID). Each webinar instance generates a webinar UUID.
    - **host_id** `string` _requerido_ — The webinar host's user ID.
    - **topic** `string` _requerido_ — The webinar's topic.
    - **type** `integer` _requerido_ — The webinar type: * `5` — A webinar. * `6` — A recurring webinar without a fixed time. * `9` — A recurring webinar with a fixed time. · valores: `5`, `6`, `9`
    - **start_time** `string` _requerido_ — The webinar's start time.
    - **timezone** `string` — The webinar's [timezone](https://marketplace.zoom.us/docs/api-reference/other-references/abbreviation-lists#timezones).
    - **duration** `integer` _requerido_ — The scheduled webinar duration.
    - **participant** `object` _requerido_ — Information about the webinar participant.
      - **user_id** `string` _requerido_ — The participant's webinar user ID. This value is assigned to a participant upon joining a webinar and is only valid for the duration of the webinar.
      - **user_name** `string` — The participant's display name.
      - **id** `string` — The participant's universally unique ID (UUID): * If the participant joins the webinar by logging into Zoom, this value is the `id` value in the [**Get a user**](/api-reference/zoom-api/methods#operation/user) API response. * If the participant joins the webinar **without** logging into Zoom, this returns an empty string value.
      - **sharing_details** `object` _requerido_ — Information about the webinar's screenshare.
        - **content** `string` _requerido_ — The type of shared content: * `application` — An application. For example, a web browser. * `whiteboard` — The [classic whiteboard](https://support.zoom.us/hc/en-us/articles/205677665-Sharing-a-whiteboard). * `desktop` — A user's desktop. * `airplay` — A user's [AirPlay (Apple screen mirroring)](https://support.zoom.us/hc/en-us/articles/204726885-Sharing-screen-using-Apple-screen-mirroring-AirPlay-). * `camera` — A user's camera. * `unknown` — An unrecognized application, such as a third party app. · valores: `application`, `whiteboard`, `desktop`, `airplay`, `camera`, `unknown`
        - **link_source** `string` _requerido_ — The Dropbox sharing method: * `deep_link` — A [deep link](https://en.wikipedia.org/wiki/Deep_linking). * `in_meeting` — A link shared via Zoom. * An empty string value if the link source is **not** a Dropbox link. · valores: ``, `deep_link`, `in_meeting`
        - **file_link** `string` _requerido_ — The Dropbox file's link. This field returns an empty string value if the file link is **not** from a Dropbox source.
        - **date_time** `string` _requerido_ — The screenshare's date and time. · formato: `date-time`
        - **source** `string` _requerido_ — The source from which the file was shared: * `dropbox` — A Dropbox source. * An empty string value if the source is **not** Dropbox. · valores: ``, `dropbox`

```json
{
  "event": "webinar.sharing_started",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "object": {
      "id": "1234567890",
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "host_id": "x1yCzABCDEfg23HiJKl4mN",
      "topic": "My Webinar",
      "type": 9,
      "start_time": "2021-07-13T21:44:51Z",
      "timezone": "America/Los_Angeles",
      "duration": 60,
      "participant": {
        "user_id": "ABCDE12345",
        "user_name": "JillChill",
        "id": "iFxeBPYun6SAiWUzBcEkX",
        "sharing_details": {
          "content": "application",
          "link_source": "in_meeting",
          "file_link": "",
          "date_time": "2021-07-13T21:55:52Z",
          "source": "dropbox"
        }
      }
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST webinar.started`

**webinar.started**

The **Start Webinar** event is triggered every time a user in your account or your app starts a webinar. Zoom users with a [Webinar Plan](https://zoom.us/webinar) have permissions for creating and managing webinars. [Zoom Video Webinar](https://support.zoom.us/hc/en-us/articles/200917029-Getting-Started-With-Webinar) allows users to broadcast a Zoom meeting to up to 1000 attendees. A webinar host can [start a webinar](https://support.zoom.us/hc/en-us/articles/200917029-Getting-Started-With-Webinar#h_816c5048-c9d3-4930-894d-af63cd41de3d) from the Zoom Client or from the [Zoom Web Portal](https://zoom.us). ## Prerequisites * Pro or a higher plan with Webinar license. * **Event Subscriptions** must be enabled for your [Marketplace app](https://marketplace.zoom.us/user/build) with the following configurations: * A valid **Event Notification Endpoint URL**. * The **Start Webinar** subscription enabled under the **Webinar** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:write:admin`,`webinar:read`,`webinar:write`,`webinar:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:webinar:master`,`webinar:read:webinar`,`webinar:read:webinar:admin`

`operationId`: `Webinar.startedWebhook` · tags: `Webinars`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The name of the event.
- **event_ts** `integer` _requerido_ — A timestamp when the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who started the webinar.
  - **object** `object` _requerido_ — Information about the webinar.
    - **id** `string` _requerido_ — The webinar ID.
    - **uuid** `string` _requerido_ — The webinar's universally unique identifier (UUID). Each webinar instance generates a webinar UUID.
    - **host_id** `string` _requerido_ — The webinar host's user ID.
    - **host_email** `string` _requerido_ — The meeting host's email address. · formato: `email`
    - **topic** `string` _requerido_ — The webinar's topic.
    - **type** `integer` _requerido_ — The webinar type. * `5` - A webinar. * `6` - A recurring webinar without a fixed time. * `9` - A recurring webinar with a fixed time. · valores: `5`, `6`, `9`
    - **start_time** `string` _requerido_ — The webinar's start time. · formato: `date-time`
    - **timezone** `string` _requerido_ — The webinar's [timezone](https://marketplace.zoom.us/docs/api-reference/other-references/abbreviation-lists#timezones).
    - **duration** `integer` _requerido_ — The scheduled webinar duration.

```json
{
  "event": "webinar.started",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "object": {
      "id": "1234567890",
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "host_id": "x1yCzABCDEfg23HiJKl4mN",
      "host_email": "jchill@example.com",
      "topic": "My Webinar",
      "type": 9,
      "start_time": "2021-07-13T21:44:51Z",
      "timezone": "America/Los_Angeles",
      "duration": 60
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.

---

## `POST webinar.updated`

**webinar.updated**

The **Webinar has been updated** event is triggered every time one of your app users or account users updates a webinar. Zoom users with a [webinar plan](https://zoom.us/webinar) have access to creating and managing webinars. [Zoom Video Webinar](https://support.zoom.us/hc/en-us/articles/200917029-Getting-Started-With-Webinar) allows users to broadcast a Zoom meeting to up to 1000 attendees. A scheduled webinar can be updated either by the user who created it or by a user with admin privileges. Users can update a webinar manually by logging into the [Zoom Web Portal](https://zoom.us/), navigating to the webinar that needs to be updated from the [Webinars](https://zoom.us/webinar/list) page and clicking on the **Edit this Webinar** button. Alternatively, users can also use the [**Update a webinar**](/docs/api-reference/zoom-api/methods#operation/webinarUpdate) API to schedule a webinar programmatically. ## Prerequisites * Have a Pro or a higher plan with webinar license. * Enable **Event Subscriptions** for your [Marketplace app](https://marketplace.zoom.us/user/build) with: * A valid **Event Notification Endpoint URL**. * The **Webinar has been updated** subscription enabled under the **Webinar** event. **[Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:admin`,`webinar:write:admin`,`webinar:read`,`webinar:write`,`webinar:master` **[Granular Scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/):** `webinar:read:webinar:master`,`webinar:read:webinar`,`webinar:read:webinar:admin`

`operationId`: `Webinar.updatedWebhook` · tags: `Webinars`

### Request body — `application/json` (requerido)

- **event** `string` _requerido_ — The event's name.
- **event_ts** `integer` _requerido_ — A timestamp when the event occurred. · formato: `int64`
- **payload** `object` _requerido_
  - **account_id** `string` _requerido_ — The account ID of the user who updated the webinar.
  - **operator** `string` _requerido_ — The email address of the user who updated the webinar. · formato: `email`
  - **operator_id** `string` _requerido_ — The user ID of the user who updated the webinar.
  - **scope** `string` — The type of operation performed. * `all` - The change was applied to all webinars. * `single` - The change was applied only to a single webinar. · valores: `single`, `all`
  - **object** `object` _requerido_ — Information about the webinar.
    - **id** `integer` _requerido_ — The webinar ID. · formato: `int64`
    - **uuid** `string` — The webinar's universally unique identifier (UUID). Each webinar instance generates a webinar UUID.
    - **host_id** `string` — The webinar host's user ID.
    - **topic** `string` — The webinar's topic.
    - **type** `integer` — The webinar type. * `5` - A webinar. * `6` - A recurring webinar without a fixed time. * `9` - A recurring webinar with a fixed time. · valores: `5`, `6`, `9`
    - **start_time** `string` — The webinar's start time.
    - **duration** `integer` — The scheduled webinar duration.
    - **timezone** `string` — The webinar's [timezone](https://marketplace.zoom.us/docs/api-reference/other-references/abbreviation-lists#timezones).
    - **password** `string` — The password required to join the webinar.
    - **agenda** `string` — The webinar's agenda.
    - **registration_url** `string` — The webinar's registration URL.
    - **occurrences** `object[]` — Information about recurring webinar with fixed times and their occurrences. This only returns when the webinar's `type` value is `9`.
      - `array` de:
        - _cualquiera de:_
          - **object**
            - **occurrence_id** `string` _requerido_ — The webinar occurrence's ID.
            - **start_time** `string` _requerido_ — The webinar's start time. · formato: `date-time`
            - **duration** `integer` — The scheduled webinar duration.
            - **status** `string` — The webinar occurrence status: * `available` * `deleted` · valores: `available`, `deleted`
    - **settings** `object` — Information about the updated webinar settings. This **only** returns updated webinar settings.
      - **host_video** `boolean` — Whether to start the webinar with the host's video on.
      - **panelists_video** `boolean` — Whether to turn panelists' video on when they join the webinar.
      - **practice_session** `boolean` — Whether to enable the [**Enable Practice Session**](https://support.zoom.us/hc/en-us/articles/206316975-Webinar-Practice-Session) feature.
      - **approval_type** `integer` — The [approval type](https://support.zoom.us/hc/en-us/articles/204619915-Scheduling-a-webinar-with-registration) for webinar registrants. * `0` - Automatically approve registrants. * `1` - Manually approve registrants. * `2` - Webinar registration not required. · valores: `0`, `1`, `2`
      - **registration_type** `integer` — The webinar registration setting for recurring webinars: * `1` - Attendees register once and can attend any of the webinar occurrences. * `2` - Attendees must register for each occurrence to attend. * `3` - Attendees register once and can select one or more occurrences to attend. · valores: `1`, `2`, `3`
      - **audio** `string` — The available audio options for participants joining the webinar. * `telephony` - Telephony only. * `voip` - VoIP only. * `both` - Both Telephony and VoIP. · valores: `telephony`, `voip`, `both`
      - **auto_recording** `string` — The [automatic recording](https://support.zoom.us/hc/en-us/articles/202921119-Automatic-Recording) settings for the webinar. * `local` - Record and save to the local device. * `cloud` - Record and save to the cloud. * `none` - Automatic recording disabled. · valores: `local`, `cloud`, `none`
      - **enforce_login** `boolean` — Whether to only allow signed in users to join the webinar.
      - **meeting_authentication** `boolean` — Whether only authenticated users can join the webinar.
      - **authentication_option** `string` — The [authentication](https://support.zoom.us/hc/en-us/articles/4406604615693) option ID value.
      - **authentication_name** `string` — The authentication name set in the [authentication profile](https://support.zoom.us/hc/en-us/articles/360037117472).
      - **authentication_domains** `string` — A list of the allowed authenticated domains.
      - **language_interpretation** `object` — The webinar's [language interpretation settings](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0064768). Make sure to add the language in the web portal in order to use it in the API. See link for details. **Note:** This feature is only available for certain Webinar add-on, Education, and Business and higher plans. If this feature is not enabled on the host's account, this setting will **not** be applied to the webinar. This is not supported for simulive webinars.
        - **enable** `boolean` — Whether to enable [language interpretation](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0064768) for the webinar.
        - **interpreters** `object[]` — Information about the webinar's language interpreters.
          - `array` de:
            - **email** `string` — The interpreter's email address. · formato: `email`
            - **interpreter_languages** `string` — A comma-separated list of the interpreter's languages. The string must contain exactly two languages. To get this value, use the `language_interpretation` object's `languages` and `custom_languages` values in the [**Get user settings**](https://developers.zoom.us/docs/api/users/#tag/users/GET/users/{userId}/settings) API response. **languages**: System-supported languages include `English`, `Chinese`, `Japanese`, `German`, `French`, `Russian`, `Portuguese`, `Spanish`, and `Korean`. **custom_languages**: User-defined languages added by the user. For example, an interpreter translating between English and French should use `English,French`.
      - **sign_language_interpretation** `object` — The webinar's [sign language interpretation settings](https://support.zoom.us/hc/en-us/articles/9644962487309-Using-sign-language-interpretation-in-a-meeting-or-webinar). Make sure to add the language in the web portal in order to use it in the API. See link for details. **Note:** If this feature is not enabled on the host's account, this setting will **not** be applied to the webinar.
        - **enable** `boolean` — Whether to enable [sign language interpretation](https://support.zoom.us/hc/en-us/articles/9644962487309-Using-sign-language-interpretation-in-a-meeting-or-webinar) for the webinar.
        - **interpreters** `object[]` — Information about the webinar's sign language interpreters.
          - `array` de:
            - **email** `string` — The interpreter's email address. · formato: `email`
            - **sign_language** `string` — The interpreter's sign language. To get this value, use the `sign_language_interpretation` object's `languages` and `custom_languages` values in the [**Get user settings**](https://developers.zoom.us/docs/api/rest/reference/zoom-api/methods#operation/userSettings) API response.
      - **allow_host_control_participant_mute_state** `boolean` — Whether to allow host and co-hosts to fully control the mute state of participants.
      - **email_in_attendee_report** `boolean` — Whether to include guest's email addresses in webinars' attendee reports.
    - **recurrence** `object` — Information about [recurring webinars](https://marketplace.zoom.us/docs/api-reference/other-references/recurrence-object-definitions).
      - **type** `integer` — The recurring webinar type. * `1` - Daily. * `2` - Weekly. * `3` - Monthly. · valores: `1`, `2`, `3`
      - **repeat_interval** `integer` — The webinar's repeat interval. * For daily intervals, a maximum of `90` days. * For a weekly interval, a maximum of `12` weeks. * For monthly intervals, a maximum of `3` months.
      - **weekly_days** `string` — A comma-separated list of the days of the week when the recurring weekly webinar occurs. * `1` - Sunday * `2` - Monday * `3` - Tuesday * `4` - Wednesday * `5` - Thursday * `6` - Friday * `7` - Saturday
      - **monthly_day** `integer` — The day of the month when the recurring monthly webinar occurs. The value ranges from 1 to 31.
      - **monthly_week_day** `integer` — The day of the week when the recurring monthly webinar is scheduled. * `1` - Sunday * `2` - Monday * `3` - Tuesday * `4` - Wednesday * `5` - Thursday * `6` - Friday * `7` - Saturday · valores: `1`, `2`, `3`, `4`, `5`, `6`, `7`
      - **end_times** `integer` — The number of times the recurring webinar will occur before it is canceled. · default: `1`
      - **end_date_time** `string` — The recurring webinar's final ending date and time before it is canceled, in UTC format. · formato: `date-time`
      - **monthly_week** `integer` — The week of the month when a recurring webinar occurs. * `-1` - The last week of the month. * `1` - The first week. * `2` - The second week. * `3` - The third week. * `4` - The fourth week. · valores: `-1`, `1`, `2`, `3`, `4`
  - **time_stamp** `integer` _requerido_ — The webinar's update timestamp, in milliseconds. · formato: `int64`
  - **old_object** `object` _requerido_

```json
{
  "event": "webinar.updated",
  "event_ts": 1626230691572,
  "payload": {
    "account_id": "AAAAAABBBB",
    "operator": "admin@example.com",
    "operator_id": "z8yCxjabcdEFGHfp8uQ",
    "scope": "single",
    "object": {
      "id": 1234567890,
      "uuid": "4444AAAiAAAAAiAiAiiAii==",
      "host_id": "x1yCzABCDEfg23HiJKl4mN",
      "topic": "My Webinar",
      "type": 9,
      "start_time": "2021-07-13T21:44:51Z",
      "duration": 60,
      "timezone": "America/Los_Angeles",
      "password": "XYz@BC!D1087",
      "agenda": "Overview of Webinar Topics",
      "registration_url": "https://example.com",
      "occurrences": [
        {
          "occurrence_id": "ABCDE12345",
          "start_time": "2021-07-13T21:44:51Z",
          "duration": 60,
          "status": "available"
        }
      ],
      "settings": {
        "host_video": true,
        "language_interpretation": {
          "enable": true,
          "interpreters": [
            {
              "email": "interpreter@example.com",
              "interpreter_languages": "English,French"
            }
          ]
        },
        "sign_language_interpretation": {
          "enable": true,
          "interpreters": [
            {
              "email": "interpreter@example.com",
              "sign_language": "American"
            }
          ]
        },
        "email_in_attendee_report": true,
        "allow_host_control_participant_mute_state": true
      },
      "old_object": {
        "id": 1234567890,
        "settings": {
          "participant_video": false,
          "join_before_host": true,
          "language_interpretation": {
            "enable": true,
            "interpreters": [
              {
                "email": "interpreter@example.com",
                "interpreter_languages": "English,Japanese"
              }
            ]
          },
          "sign_language_interpretation": {
            "enable": true,
            "interpreters": [
              {
                "email": "interpreter@example.com",
                "sign_language": "French"
              }
            ]
          },
          "email_in_attendee_report": false,
          "allow_host_control_participant_mute_state": false
        }
      }
    }
  }
}
```

### Respuestas

**`200`** — Successfully received the webhook event.
