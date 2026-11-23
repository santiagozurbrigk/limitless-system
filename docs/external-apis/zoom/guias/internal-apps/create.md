---
title: "Create a Server-to-Server OAuth app"
source: "https://developers.zoom.us/docs/internal-apps/create/"
capturado: "2026-11-23"
---

# Create a Server-to-Server OAuth app

## Prerequisites

-   [A Zoom account](https://support.zoom.us/hc/en-us/articles/360034967471-Getting-started-guide-for-new-users)
-   [Permissions to view and edit server-to-server OAuth apps](/docs/internal-apps/#enable-the-server-to-server-oauth-role)
-   [Permissions for scopes that you will add to the app](/docs/internal-apps/#assign-permissions-to-access-scopes)

## Steps to create a Server-to-Server OAuth app

Follow the steps below to create a Server-to-Server OAuth app to use with [account credentials](/docs/internal-apps/s2s-oauth/#zoom-account-credentials-grant-type).

1. Sign in to your developer account on the [Zoom App Marketplace](https://marketplace.zoom.us/).
2. Select the **Developers** link in the lower left corner to open the **Created Apps** page.
   If you don't see the **Created Apps** page, verify that you have the correct permissions.
3. On the **Created apps** page, in the upper left corner, next to **Developer**, select the plus sign in the blue circle, and then select **Build an app**.
4. On the app creation screen, select **Server-to-Server OAuth app** and click **Create**.
5. **App credentials** - View your account ID, client ID and client secret. You'll use these credentials to authenticate with Zoom.
6. **Information** - Add information about your app, such as a short description, company name, and developer contact information (name and email address required for activation).
7. **Feature** - Toggle whether you'd like to enable event subscriptions. If enabled, choose the event subscriptions you'd like to use. See [Using Zoom Webhooks](/docs/api/webhooks) for details.
8. **Scopes** - Choose **Add Scopes** to search for and add scopes.

    Scopes define the API methods your app can call and determine the information and features available in Zoom. Scopes are limited to specific resources, such as channels or files. If you submit your app to Zoom for review, we'll verify each requested scope based on the app's functionality at that time. Request only the scopes your app needs.

    The [scopes](/docs/internal-apps/oauth-scopes-overview/) you can add to your app depend on your [role permissions](https://support.zoom.us/hc/articles/115001078646). For example, you must have admin-level role permissions to add admin-level scopes to their S2S app.

    > **Note**
    >
    > Changes to an app owner's role permissions also affect the scopes in apps they have **already created**.
    >
    > For example, App_Owner_A has admin-level role permissions, creates an app with admin-level scopes. At a later point, their role permissions are changed to a non-admin level. The app build flow automatically removes any admin-level scopes in the app. To retain the admin-level scopes in the app, [transfer the app ownership](/distribute/app-ownership/transfer-apps-between-accounts/ to a user with admin-level role permissions.

9. **Activation**: When activating your app, if you see errors that prevent activation, please address them. You will not be able to generate an access token to make API calls unless your app is activated. If your app is deactivated, existing tokens will no longer work. You can also choose to **Deactivate your app** in this section.

---

## Remove server-to-server OAuth app

To remove an existing Server-to-Server OAuth app, go to **App Management** > **Created apps** and click **Remove App** in the **Action** menu.

![Created Apps](/img/s2s-app06-created-apps.png)
