---
title: "Access"
source: "https://developers.zoom.us/docs/build-flow/access/"
capturado: "2026-11-23"
---

# Access

The **Access** tab is available for all apps. These features allow you to access Zoom data via APIs and Event Subscriptions.

-   **Secret Token** - Zoom sends the secret token in each event notification. Use this token to verify event notifications sent by Zoom. You can regenerate and copy the secret token for your app on this page.
-   **Verification Token (deprecated)** - Zoom used to send this token for you to use to verify events. It will be deprecated in February of 2025. Use the Secret Token instead.
-   **Event Subscription** - Subscribe to Zoom events and specify the endpoint to receive event notifications. Zoom supports webhooks and a public beta of WebSockets to receive events. The build flow automatically selects any corresponding scopes related to related events.

See [Using Zoom APIs](/docs/api/using-zoom-apis/), [Using webhooks](/docs/api/webhooks/), and [Using WebSockets](/docs/api/websockets/) for details.
