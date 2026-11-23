---
title: "Internal apps (Server-to-server)"
source: "https://developers.zoom.us/docs/internal-apps/"
capturado: "2026-11-23"
---

# Internal apps (Server-to-server)

A **Server-to-Server OAuth app** enables you to securely integrate with Zoom APIs and get your account owner access token without user interaction. This is different from the [OAuth app type](/docs/integrations/), which requires user authentication (see [Using OAuth 2.0](/docs/integrations/oauth/) for details.)

Account administrators or users with [role-based access permissions](https://support.zoom.us/hc/articles/115001078646) to create, edit, or view Server-to-Server OAuth apps can add and manage server-to-server OAuth apps. See [enable permissions](#enable-permissions) for details.

You can also use this app type to get event subscriptions using Webhooks.

## Prerequisite

You have read [Before you start](/docs/build-flow/before-you-build/) .

## Server-to-server OAuth Starter App

Use this sample app as a functional starting point for building server-to-server OAuth applications with Zoom.

-   [Server-to-server OAuth Starter App](https://github.com/zoom/server-to-server-oauth-starter-api)

## Enable permissions

The administrator for a Zoom account must enable the view and edit permissions for Server-to-Server OAuth apps to a developer, as well as the appropriate permissions to add specific [scopes](/docs/internal-apps/oauth-scopes-overview/) to the app.

### Enable the Server-to-Server OAuth role

In the Zoom web portal, the administrator must go to **User Management** > **Roles** > **Role Settings** > **Advanced features** and select the **View** and **Edit** check boxes for **Server-to-Server OAuth app**. See [Using role management](https://support.zoom.us/hc/en-us/articles/115001078646) for details.

![Server-to-Server OAuth app role management](/img/s2s-app01-admin.png)

### Assign permissions to access scopes

The administrator must also assign the appropriate permissions to the developer to enable them to choose these [scopes](/docs/internal-apps/oauth-scopes-overview/) when they create the server-to-server OAuth app.

For example, if a developer wants to use the **View all user meetings** and **View and manage all user meetings** scopes:

![Meeting scopes](/img/s2s-app01c-scopes-add02.png)

The administrator must add the **View** and **Edit Users** permissions to their role:

![Server-to-Server OAuth app role management - View and Edit Users](/img/s2s-app01b-admin-user-permissions.png)
