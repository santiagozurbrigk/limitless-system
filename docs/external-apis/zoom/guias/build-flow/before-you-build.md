---
title: "Before you start"
source: "https://developers.zoom.us/docs/build-flow/before-you-build/"
capturado: "2026-11-23"
---

# Before you start

We highly recommend you familiarize yourself with these concepts and terms before starting to create apps on the Zoom platform. Understanding these core concepts — role permissions, app distribution (audience and listing), and management models — will help you plan, design, and deploy applications more effectively on the Zoom platform.

## Check role permissions

Before creating or managing apps on the Zoom Developer Platform, your Zoom account user profile must have the necessary developer permissions enabled. Zoom uses [role-based access control](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0064983) (RBAC) to dictate what account members can manage.

To assign users the role-permissions required to create and edit apps:

1. Log into the Zoom web portal as an admin.
2. Go to **User Management** > **Roles** > **All**.
3. Find the role you want to change permissions for, then click the **Edit** button.
4. Go to **Role Settings** > **Advanced features**.
5. Select the **View and Edit** checkboxes for **Zoom for developers**.
   ![](/img/UBF-role-prerequisite.png)

> **Deprecated legacy permissions**
>
> We have flagged these legacy granular role permissions for deprecation:
>
> -   OAuth
> -   Chatbot
> -   Meeting SDK
>
> The separate role permissions were part of the legacy app creation process, which had separate app types. With the consolidation of separate app types into the single **General app** type, the separate permissions were no longer needed.

---

## Adding apps versus installing apps

In Zoom, apps are _added_, not installed. Unlike traditional software, Zoom apps don't download or install files on a user's device. Instead, adding an app creates a secure connection between Zoom and a third-party service through APIs, allowing the app to access authorized data and features.

Although the terms are sometimes used interchangeably, understanding this distinction helps explain how Zoom integrations work.

---

## Choose your app management model

When you create an app, one of the first decisions is to choose its management model, either **admin-managed** or **user-managed**. Your choice affects:

-   Who can add and manage the app.
-   Which Zoom products and in-client features the app can use. Some products and features require a user-managed app.
-   The app's available features, scopes, and permissions. If you change the management model later, review and update your app configuration as needed.

### Admin-managed apps

Account admins add and manage these apps for users in their organization. Admin-managed apps support organization-wide use cases, such as user provisioning, account reporting, and administrative dashboards.

**Example:** An internal dashboard that creates and manages meetings on behalf of users.

### User-managed apps

Individual users add and manage these apps for their own Zoom accounts. Each user must authorize the app through OAuth. User-managed apps support personal workflows, such as calendar integrations and meeting scheduling tools.

**Example:** A calendar integration that lets users create and manage their own meetings.

---

## Choose how to distribute your app

This section explains Zoom app types and your options for setting who can access an app, how the app is distributed, and whether it appears in the Zoom App Marketplace. These selections do not affect the features or capabilities you build into the app.

Understanding the differences can help you choose the right distribution method based on whether you're developing an internal app, testing with external users, or making your app broadly available.

-   **App type** has to do with how the app is distributed and whether it must go through Marketplace review. Available options: internal, private, beta, published (listed), published (unlisted).
-   **Audience** is about who can discover and install a published app. Available options: External Zoom users or users within your Zoom account.
-   **Discoverability** is about whether a published app appears in Marketplace search results. Available options: Listed (published to Marketplace) or Unlisted.

These are the **app types**, **distribution method**, and typical **use cases**.

-   **Internal apps** are published to the App Marketplace but can be discovered and installed only by users on your Zoom account. They have the benefit of restricted access similar to a private app, but without the overhead of needing an authorization URL for distribution.
-   **Private** apps are the most restrictive in distribution and access. They are not published to the Zoom App Marketplace. Access is restricted to only users on your Zoom account. Distribution is done by sharing an [authorization URL](/docs/distribute/sharing-private-and-beta-apps/#generating-an-authorization-url). Typical use cases are internal tools, automation, or apps used only by your organization.
-   **Beta** apps are intended for external testing before public release; they are not published to the Zoom App Marketplace. Distribution is done by sharing an [authorization URL](/docs/distribute/sharing-private-and-beta-apps/#generating-an-authorization-url), and you must request approval from Zoom. The testing is limited by the number of external users and for a limited time.
-   **Published (Listed)** apps are available to all Zoom users on the Zoom App Marketplace, and are required to go through a rigorous quality and security [review](/docs/distribute/app-review-process/). Installation can still be restricted to specific users, domains, or organizations. For more information, see [Controlling app access on the Marketplace](/docs/distribute/app-submission/app-access/).
-   **Published (Unlisted)** apps are available to all Zoom users and can join external meetings, but are not listed in the Zoom App Marketplace. For more information, see [Publishing your app - unlisted apps](/docs/build-flow/app-listing/eu-and-discoverability/#app-discoverability).

    > **Review required**
    >
    > Unlisted apps still require app meta data, such as images, descriptions, categories, because the information is displayed on the active apps notification (AAN) and on users' added apps page. The app will fail app review if it doesn't have the required meta data.

### Audience and discoverability

The table shows how Zoom app publishing configurations relate to visibility and distribution. It shows app types, their intended audience, Marketplace discoverability, and distribution method.

<table>
    <thead>
        <tr>
            <th>App type</th>
            <th>Intended audience</th>
            <th>Marketplace discoverability</th>
            <th>Distribution method</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>
                <strong>Published (Internal audience)</strong>
            </td>
            <td>Visible only to users within my Zoom account</td>
            <td>Visible only to users in your Zoom account</td>
            <td>Internal Marketplace listing</td>
        </tr>
        <tr>
            <td>
                <strong>Private</strong>
            </td>
            <td>Users within your Zoom account only</td>
            <td>Not listed (not published)</td>
            <td>Authorization URL</td>
        </tr>
        <tr>
            <td>
                <strong>Beta</strong>
            </td>
            <td>
                Limited external testers (and users within your Zoom account)
            </td>
            <td>Not listed (not published)</td>
            <td>Approved authorization URL</td>
        </tr>
        <tr>
            <td>
                <strong>Published (Listed)</strong>
            </td>
            <td>External Zoom users</td>
            <td>
                <strong>Listed</strong> in the Zoom App Marketplace and
                searchable
            </td>
            <td>Zoom App Marketplace</td>
        </tr>
        <tr>
            <td>
                <strong>Published (Unlisted)</strong>
            </td>
            <td>External Zoom users</td>
            <td>
                <strong>Not listed</strong> in Marketplace search results
            </td>
            <td>Direct installation link</td>
        </tr>
    </tbody>
</table>

**Audience** is the intended users of the app.

-   **External Zoom users** can discover and install your app from the Zoom App Marketplace after it passes Zoom's review process. You can still limit installation to specific users, domains, or organizations.
-   **Users within my Zoom account** can discover and install the app only if they belong to your Zoom account. These apps are intended for internal use and don't require the standard Marketplace review.
    For more information, see [Audience](/docs/build-flow/publish/#audience).

**Discoverability** is how findable the app is; on the Zoom App Marketplace.

-   Select **Publish my app to the Zoom App Marketplace** to make your app publicly discoverable.
-   Select **Set my app as Unlisted** if you don't want your app to appear in Marketplace search results. Unlisted apps can still be installed by anyone who has the direct installation link, making them useful for sharing apps with external users while limiting public visibility.

For more information, see [App discoverability](/docs/build-flow/app-listing/eu-and-discoverability/#app-discoverability).
