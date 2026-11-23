---
title: "Updating an App"
source: "https://developers.zoom.us/docs/distribute/published-apps/updating/"
capturado: "2026-11-23"
---

# Updating an App

Updating an app that has already been published requires functional and security reviews similar to the original [Submission Review](/docs/distribute/app-submission/submit-apps-review/) process.

> **Note**
>
> To ensure we can test the new features and changes you made to your application, make sure you use the **Development Client ID** in your update request.

## Update Process

To update an app which has already been published:

1. Login to the [Zoom App Marketplace](https://marketplace.zoom.us/).
2. Click **Manage** to open the **Created Apps** page and then select the app you want to update.
3. Make your changes and then select **App Submission** in the left navigation pane.
4. On the **App Submission** page complete any required fields.
5. (**recommended**) For updates involving scope changes, subscribers will need to reauthorize your app once it's approved. Use the **Release Notes for User** section to explain what's changing, why reauthorization is needed, and how it improves their experience.
6. Select **Send Updates**.

    > **Note**
    >
    > The Zoom App Marketplace team reviews updated metadata content, scopes, and app features. If scope changes grant access to new data, feature sets extend beyond the app's original intent, or significant discrepancies exist between the app's description and its functionality, the Zoom Marketplace team may request a new security review.

## Release Notes for Users

Because this update changes scopes, subscribers will need to reauthorize your app once it's approved. Use the **Release Notes for User** section to explain what's changing, why reauthorization is needed, and how it improves their experience.

## What to expect

### What happens to my existing app on the Marketplace while my updated app is undergoing review?

There is no disruption to your published app while Zoom is reviewing your updated app. Zoom Developer Dashboard does not currently include version control for published apps. When your app passes the review and is activated, we post it to the Marketplace, and replace the previous app with the updated app.

> **Note**
>
> If you had selected **Activate my app immediately after it is approved**, the updated app is available on the Marketplace immediately after it is approved.
>
> If you had selected **I will manually activate my app**, the updated app is available only after you activate it.

### What can users expect?

**New subscribers** will see only the updated app.

**Existing users** can continue using their current authorization for 90 days. After that, [refresh tokens](/docs/integrations/oauth/#refreshing-an-access-token) for the old scopes expire, requiring reauthorization with the new scopes to maintain access.

**Controlling email notifications (for user-level apps)** Account administrators can enable Zoom to send email notifications to their users when updates are available for their app.

> **Note**
>
> This is controlled by Zoom account administrators, not developers.

1. Login to the [Zoom App Marketplace](https://marketplace.zoom.us/) as an admin, and click **Manage**.
2. Under **Admin App Management**, click **Notifications**.
3. Enable **App Updates**.
4. Click **Add email**.
5. Add emails to be notified, and click **Save**.

### How much time does it take for a review?

The amount of time needed for a review depends on the scale and scope of updates to your app.

Changes to the metadata of your application such as the description, name or images, only need to go through the **functional review** without undergoing an additional functional test.

Changes to scope, features, or data access need to go through both a **functional** review and a **security** review. Review time may take up to 5 business days.

> **Implementation Detail**
>
> You must provide a test plan to test each **new** scope you are requesting. And you must use the **development credentials** for any update request.

For more information about using development credentials for update requests, we recommend checking the [Zoom DevForum](https://devforum.zoom.us/t/why-does-your-marketplace-app-require-a-production-environment/75931)
