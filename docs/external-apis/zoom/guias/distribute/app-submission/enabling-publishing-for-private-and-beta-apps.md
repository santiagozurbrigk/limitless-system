---
title: "Enabling publishing for private and beta apps"
source: "https://developers.zoom.us/docs/distribute/app-submission/enabling-publishing-for-private-and-beta-apps/"
capturado: "2026-11-23"
---

# Enabling publishing for private and beta apps

Zoom does not allow [private apps](/docs/platform/key-concepts/#private-vs-beta-vs-published-apps) to be published to the Zoom App Marketplace. This distinction exists to allow for control over the sharing of apps outside of a developer account, thereby closing a potential security attack vector. To support developers who have completed the testing of their apps and wish to publish their customer-ready app, the Zoom App Marketplace provides a process to change the state of the app so you can submit it into the publishing process.

1. Sign into the [Zoom App Marketplace](https://marketplace.zoom.us/) as your developer account and click **Manage** to display the **App Dashboard**.
2. Select your app and display its configuration page, click **Activation**.
3. Under **Share your app with others**, click **Change Now**.
4. On the **Enable Publishing** window, click **OK**.
5. You can then submit your app for [publishing](/docs/distribute/).

> **Note**
>
> After the app is published on the Zoom App Marketplace, beta users, or users who have added your app during a test phase, can continue using your app without having to re-authorize it. Users are only required to re-authorize when you [update your app](/docs/distribute/published-apps/updating/).

## Change effects

After the change is confirmed, the Zoom App Marketplace changes the state of the app within its platform for all users. The app page now displays two sets of credentials:

-   **Production** credentials. Zoom reviewers use production credentials to review an app's first publish request.
-   **Development** credentials. Zoom adds development credentials and Zoom reviewers use them to review update requests to an already published app.

Other changes include a new left-hand navigation menu and meta-data entries.

For more information, see [App Review Process](/docs/distribute/app-review-process/).
