---
title: "App management"
source: "https://developers.zoom.us/docs/build-flow/basic-info/app-mgmt/"
capturado: "2026-11-23"
---

# App management

When selecting an app management option, consider the following:

-   It determines who can add and manage your app: admins or users.
-   It affects which Zoom products your app can use. Some products require user-managed apps.
-   It impacts the in-client features available to your app. Some products require user-managed apps.
-   It affects available features, scopes, and permissions. If you change it later, make sure to review and confirm your selections again.

## Who can add and manage your app

-   **Admin-managed apps**

    Admins must add these apps, and the account admin manages them for all users. These apps can access Zoom APIs to manage users, reports, and account content.

    Example: An internal dashboard that creates and manages meetings on behalf of users.

-   **User-managed apps**

    Individual users can add and manage these apps, which require authentication for each user. These apps can access Zoom APIs to manage a user's content.

    Example: A calendar extension that allows users to create their own meetings.

**Note**: You can create apps with either admin-level or user-level scopes, but there's no app type that combines both. For now, the workaround is to create separate apps and assign the necessary scopes to each.
For example, here are two separate apps for the same service, but with different scopes: one for users and one for administrators.

![](/img/app-type-calendly-example.png)

## Zoom product and in-client feature dependencies

This is a list of the features available to your app based on the app type.

### Admin-managed app type

<table>
<tbody>
<tr>
<th width="20%">Works In</th>
<th width="40%">In-Client Feature</th>
<th width="40%">Accessible in Zoom Client</th>
</tr>

<tr>
    <td valign="top">
        <a href="/docs/zoom-apps/create/">Meetings</a>
    </td>
    <td valign="top">
        <ul>
            <li>none</li>
        </ul>
    </td>
    <td>
        <ul>
            <li>Desktop (default)</li>
            <li>
                <a href="/docs/rooms/za/za-szr/">Zoom Rooms</a>
            </li>
            <li>
                <a href="/docs/zoom-apps/reference-apps/">Reference apps</a>
            </li>
        </ul>
    </td>
</tr>

<tr>
    <td valign="top">
        <a href="/docs/zoom-apps/guides/webinar/">Webinars</a>
    </td>
    <td valign="top">
        <ul>
            <li>none</li>
        </ul>
    </td>
    <td>
        <ul>
            <li>Desktop (default)</li>
            <li>
                <a href="/docs/rooms/za/za-szr/">Zoom Rooms</a>
            </li>
        </ul>
    </td>
</tr>

<tr>
    <td valign="top">
        <a href="/docs/rooms/za/za-szr/">Rooms</a>
    </td>
    <td valign="top">
        <ul>
            <li>none</li>
        </ul>
    </td>
    <td valign="top">
        <ul>
            <li>Desktop (default)</li>
            <li>
                <a href="/docs/rooms/za/za-szr/">Zoom Rooms</a>
            </li>
        </ul>
    </td>
</tr>

<tr>
    <td valign="top">
        <a href="/docs/chat/">Zoom Chat</a>
    </td>
    <td valign="top">
        <ul>
            <li>
                <a href="/docs/chat/capabilities/">Zoom Chat Subscriptions</a>
            </li>
            <li>
                <a href="/docs/chat/za-sdk-features/#app-shortcuts">
                    App Shortcuts
                </a>
            </li>
        </ul>
    </td>
    <td valign="top">
        <ul>
            <li>Desktop (default)</li>
        </ul>
    </td>
</tr>

<tr>
    <td valign="top">
        <a href="https://support.zoom.us/hc/en-us/articles/4410916881421-Getting-started-with-Zoom-Whiteboard">
            Whiteboard
        </a>
    </td>
    <td valign="top">
        <ul>
            <li>none</li>
        </ul>
    </td>
    <td valign="top">
        <ul>
            <li>Desktop (default)</li>
        </ul>
    </td>
</tr>

<tr>
    <td>
        <a href="/docs/events/">Events</a>
    </td>
    <td>
        <ul>
            <li>none</li>
        </ul>
    </td>
    <td valign="top">
        <ul>
            <li>Desktop (default)</li>
        </ul>
    </td>
</tr>

</tbody>
</table>

### User-managed app type

<table>
<tbody>
<tr>
<th width="20%">Works In</th>
<th width="40%">In-Client Feature</th>
<th width="40%">Accessible in Zoom Client</th>
</tr>

<tr>
    <td valign="top">
        <a href="/docs/zoom-apps/create/">Meetings</a>
    </td>
    <td valign="top">
        <ul>
            <li>Zoom Apps SDK</li>
            <li>
                <a href="/docs/zoom-apps/guides/guest-mode/">Guest Mode</a>
            </li>
            <li>
                <a href="/docs/zoom-apps/architecture/#authorization-oauth-redirect">
                    In-Client OAuth
                </a>
            </li>
            <li>
                <a href="/docs/zoom-apps/guides/collaborate-mode/">
                    Collaborate Mode
                </a>
            </li>
        </ul>
    </td>
    <td>
        <ul>
            <li>Desktop (default)</li>
            <li>
                <a href="/docs/zoom-apps/guides/mobile/">Mobile</a>
            </li>
            <li>
                <a href="/docs/rooms/za/za-szr/">Zoom Rooms</a>
            </li>
            <li>
                <a href="/docs/zoom-apps/reference-apps/">Reference apps</a>
            </li>
        </ul>
    </td>
</tr>

<tr>
    <td valign="top">
        <a href="/docs/zoom-apps/guides/webinar/">Webinars</a>
    </td>
    <td valign="top">
        <ul>
            <li>Zoom Apps SDK</li>
            <li>
                <a href="/docs/zoom-apps/guides/guest-mode/">Guest Mode</a>
            </li>
            <li>
                <a href="/docs/zoom-apps/architecture/#authorization-oauth-redirect">
                    In-Client OAuth
                </a>
            </li>
            <li>
                <a href="/docs/zoom-apps/guides/collaborate-mode/">
                    Collaborate Mode
                </a>
            </li>
        </ul>
    </td>
    <td valign="top">
        <ul>
            <li>Desktop (default)</li>
            <li>
                <a href="/docs/zoom-apps/guides/mobile/">Mobile</a>
            </li>
            <li>
                <a href="/docs/rooms/za/za-szr/">Zoom Rooms</a>
            </li>
        </ul>
    </td>
</tr>

<tr>
    <td valign="top">
        <a href="/docs/rooms/za/za-szr/">Rooms</a>
    </td>
    <td valign="top">
        <ul>
            <li>none</li>
        </ul>
    </td>
    <td valign="top">
        <ul>
            <li>Desktop (default)</li>
            <li>
                <a href="/docs/zoom-apps/guides/mobile/">Mobile</a>
            </li>
            <li>
                <a href="/docs/rooms/za/za-szr/">Zoom Rooms</a>
            </li>
        </ul>
    </td>
</tr>

<tr>
    <td valign="top">
        <a href="/docs/chat/">Zoom Chat</a>
    </td>
    <td valign="top">
        <ul>
            <li>Zoom Apps SDK</li>
            <li>
                <a href="/docs/chat/capabilities/">Zoom Chat Subscriptions</a>
            </li>
            <li>
                <a href="/docs/chat/za-sdk-features/#app-shortcuts">
                    App Shortcuts
                </a>
            </li>
        </ul>
    </td>
    <td valign="top">
        <ul>
            <li>Desktop (default)</li>
        </ul>
    </td>
</tr>

<tr>
    <td valign="top">
        <a href="https://support.zoom.us/hc/en-us/articles/4410916881421-Getting-started-with-Zoom-Whiteboard">
            Whiteboard
        </a>
    </td>
    <td valign="top">
        <ul>
            <li>none</li>
        </ul>
    </td>
    <td valign="top">
        <ul>
            <li>Desktop (default)</li>
        </ul>
    </td>
</tr>

<tr>
    <td>
        <a href="/docs/events/">Events</a>
    </td>
    <td>
        <ul>
            <li>none</li>
        </ul>
    </td>
    <td valign="top">
        <ul>
            <li>Desktop (default)</li>
        </ul>
    </td>
</tr>

</tbody>
</table>
