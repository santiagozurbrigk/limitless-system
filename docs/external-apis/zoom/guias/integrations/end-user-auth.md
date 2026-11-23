---
title: "End user authorization"
source: "https://developers.zoom.us/docs/integrations/end-user-auth/"
capturado: "2026-11-23"
---

# End user authorization

This document describes the process of handling a user installation for your app.

For more information on managing the App Marketplace, reference:

-   [Installing and uninstalling apps from Marketplace](https://support.zoom.us/hc/en-us/articles/4423045745037)
-   [Pre-approving and approving apps in Zoom App Marketplace](https://support.zoom.us/hc/en-us/articles/360027829671-Pre-approving-and-approving-apps-in-Zoom-App-Marketplace)
-   [Managing the Zoom App Marketplace](https://support.zoom.us/hc/en-us/articles/360032447812-Managing-the-Zoom-App-Marketplace)

## Requesting a user's authorization

A user may add an app using the [Authorization URL](/docs/distribute/app-submission/authorization-url-faq) or through the listing on the App Marketplace. Published apps may also be discovered and added within the Zoom client in the 'Apps' tab.

To prompt a user to authorize your app, direct them to your app's Authorization URL. This URL is formed from the base OAuth authorize endpoint (`https://zoom.us/oauth/authorize`), your app's information, details about the OAuth type, and any optional state parameters. For example:

`https://zoom.us/oauth/authorize?response_type=code&client_id={your_client_ID}&redirect_uri={your_oauth_redirect_URL}`

See [OAuth 2.0 - Request user authorization](/docs/integrations/oauth#step-1-request-user-authorization) for full details.

**User-level apps** may be added by any individual user on an account. They typically do not require additional role permissions, as their requested access is scoped to themselves.

**Account-level apps** (apps with admin) scopes must be authorized by a user with the corresponding account-level permissions. An app requesting the report:read:admin scope, for example, would need the admin-level Role Permissions to view Usage reports. See [Using role management](https://support.zoom.us/hc/en-us/articles/115001078646-Using-role-management) for more information.

## Pre-approval request flow for users

A Zoom account may require an app be pre-approved by a Marketplace admin before the end user may authorize it. If your app has not been pre-approved by the end user's Marketplace admin, the user may request pre-approval from the admin.

For a user's guide to app pre-approval, see [Pre-approving and approving apps in Zoom App Marketplace](https://support.zoom.us/hc/en-us/articles/360027829671-Pre-approving-and-approving-apps-in-Zoom-App-Marketplace).

## Deauthorization

All apps made available to end users must provide the proper ability for users to remove or deauthorize the app and receive deauthorization notifications from Zoom.

When a user chooses to remove or deauthorize a public app, Zoom sends a [Deauthorization Event Notification](/docs/api/marketplace/events/#tag/app_deauthorized/POSTapp_deauthorized) as an HTTP POST request to the app's Deauthorization Notification Endpoint URL. This signed request contains information on the User and the time of deauthorization.

All apps published publicly to the Zoom App Marketplace receive a webhook notification for each user deauthorization event.

Private apps or apps in development do not trigger deauthorization notifications.

Below is an example Deauthorization request body, sent to an app's Deauthorization Notification Endpoint URL:

```json
{
    "event": "app_deauthorized",
    "payload": {
        "account_id": "EabCDEFghiLHMA",
        "user_id": "z9jkdsfsdfjhdkfjQ",
        "signature": "827edc3452044f0bc86bdd5684afb7d1e6becfa1a767f24df1b287853cf73000",
        "deauthorization_time": "2019-06-17T13:52:28.632Z",
        "client_id": "ADZ9k9bTWmGUoUbECUKU_a"
    }
}
```

### Security validation

It is highly recommended for all apps to verify that requests received by the Deauthorization Notification Endpoint URL are requests sent from Zoom to prevent vulnerability to denial-of-service attacks.

> The verification token will be deprecated in October 2023. We recommend that you replace the verification token with the secret token to verify event notifications from Zoom. See [Using Webhooks - verify webhook events](/docs/api/webhooks/#verify-webhook-events) for details.

## Active Apps Notifier (AAN)

Active Apps Notifier (AAN) is an in-meeting and in-webinar feature of the Zoom client. It informs users about Marketplace apps that have real-time access to content and user data shared during an ongoing meeting or a webinar. AAN displays icons along with a tooltip in the meeting/webinar window when a host or another participant uses an app that has real-time access to meeting/webinar content (audio, video or chat).

With AAN, users in a meeting or a webinar can see the app that is accessing content, the type of the content that is being accessed along with information regarding the account that approved the app.

The AAN feature is supported in 5.6.7 and higher versions of the Zoom desktop client, Zoom mobile app, Zoom Rooms for Conference Room and the Zoom web client.

The Zoom Meeting SDK version 5.9.0 and higher supports the AAN. See the [Active Apps Notifier use case](/docs/meeting-sdk/ui-notices#active-apps-notifier-aan-use-case) in the UI legal notices page for Meeting SDK for details.
