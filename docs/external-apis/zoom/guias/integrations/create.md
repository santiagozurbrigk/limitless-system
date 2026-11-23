---
title: "Create an OAuth app"
source: "https://developers.zoom.us/docs/integrations/create/"
capturado: "2026-11-23"
---

# Create an OAuth app

By creating an **OAuth app** on the [Zoom App Marketplace](https://marketplace.zoom.us/), you can securely integrate with Zoom APIs and access users' authorized data using a user-based authentication approach. This app type can be either added and managed across an account by account admins (account-level app) or by users individually (user-managed app).

**Note:** To build an app that provides **server-to-server** interaction with Zoom APIs to manage your account, create a [server-to-server OAuth](/docs/internal-apps/s2s-oauth) app.

---

## Prerequisites

-   You have read [Before you start](/docs/build-flow/before-you-build/) .
-   You have a Zoom account.
-   You are either the Zoom account owner, account admin, or have been assigned the **Zoom for developers** role.

To enable the **Zoom for developers** role, log into the Zoom web portal as admin and go to **User Management** > **Roles** > **Role Settings** > **Advanced features**, and select the **View** and **Edit** checkboxes for **Zoom for developers**.

![](/img/UBF-role-prerequisite.png)

For more information, see [Using role management](https://support.zoom.us/hc/en-us/articles/115001078646).

## Step 1: Create a general app

1. Use an account with developer permissions. Go to the [Zoom App Marketplace](https://marketplace.zoom.us/), and sign-in.
2. In the lower-left navigation pane, click **Developer**.

    ![](/img/developer-link-2026.png)

    > **Developer link**
    >
    > The Marketplace only displays the **Developer** link when it detects that the user has the proper developer permissions. If you do not see it displayed, check with your admin that you have the correct permissions assigned.

3. On the **Created apps** page, click **Develop** and select **Build an app**.
4. On the app creation screen, select **General app** and click **Create**.

## Step 2: Maintain basic information

On the **Basic Info** page, add or update information about the app such as the app's name, how the app is managed, app credentials, and OAuth information.

1. Update your app's name. By default, the build flow generates a generic name for your app. To change your app's name, select the edit icon (pencil) and update the name. To save your changes, click anywhere outside of the app name field.

    ![](/img/UBF-app-name.png)

2. In the **Select how the app is managed** section, confirm how you want your app to be managed.

    > The app management type affects the features and scopes available to your app. If you change the app management type later on, make sure you reconfirm the selected features and scopes for your app.

    - **Admin-managed:** Account admins add and manage the app. Depending on the scope, the app can access and manage the user data of users on their account.
    - **User-managed:** Individual users add and manage the app. The app has access to only the user's authorized data.

3. <a id="appCredentials"></a>**App Credentials** - The build flow automatically
   generates app credentials (client ID & client secret) for your app. App credentials
   for development differ from app credentials for production. - Use **development
   credentials** while you are building and testing your app. - Use **production
   credentials** once you are ready to publish your app on the Marketplace.

4. In the **OAuth Information** section, set up OAuth for your app.
    - **OAuth redirect URL (required)**: Enter your development redirect URL or endpoint to set up OAuth between your app and Zoom.
      **Note:** The build flow supports _custom URL schemes_ only for [Zoom Meeting SDK](/docs/meeting-sdk/) apps. To enable your app for Meeting SDK, go to **Features** > **Embed**.
    - **Use Strict Mode URL (optional)**: Allow only the redirects that exactly match the valid OAuth redirect URLs.
    - **Subdomain check (optional)**: Only allow the redirects that exactly match the subdomain of the valid OAuth redirect URLs.
    - **OAuth allow lists (required)**: Add any unique URLs that Zoom should allow as valid redirects for your OAuth flows. This additional security measure ensures that users are only redirected to the pre-approved endpoints you provided. Include either the complete URL (https://subdomain.domain.tld/path/to/oauth/callback) or the base URL without the path and/or query parameters (https://subdomain.domain.tld).

## Step 3: Select Zoom products and features

On the **Features page**, you can do the following:

<table>
<tbody>
<tr>
<th width="20%">Tab</th>
<th width="15%">Relevant for</th>
<th width="65%">What you can do</th>
</tr>

<tr>
<td valign="top"><strong>Access</strong></td>
<td valign="top">All apps</td>
<td>
<ul>
<li>**Token** - Regenerate and copy the secret token for your app.</li>
<li>**Event Subscription** - Subscribe to Zoom events for your app and specify the endpoint to receive the event notifications. The build flow automatically selects any corresponding scopes related to related events.</li>

</ul>
</td>
</tr>

<tr>
    <td valign="top">
        <strong>Surface</strong>
    </td>
    <td valign="top">Zoom apps</td>
    <td>
        <font size="2">
            The <strong>Surface</strong> tab is divided into four sections:
        </font>
        <ul>
            <li>
                <strong>Home URL</strong> and <strong>Domain Allow List</strong>{" "}
                - The Home URL enables you to run a web browser inside the Zoom
                client, and display the Home URL domain inside the in-client web
                browser. In the **Domain Allow List** add URLs you want the Zoom
                client to accept.
            </li>
            <li>
                <strong>Select where to use your app</strong> - Select the Zoom
                products that this app works in. Users can open and use the app
                directly from these products.
            </li>
            <li>
                <strong>In-Client App Features</strong> - Select features to
                include for your in-client app. For more information, see{" "}
                <b>Select in-client app features</b>.
            </li>
            <li>
                <font size="2">
                    <strong>Zoom Client Support</strong> - By default, Zoom apps
                    work in the Zoom Client for desktop. You can choose
                    additional Zoom clients your app works in:
                </font>
                <font size="2">
                    <ul>
                        <li>Mobile</li>
                        <li>Zoom Rooms</li>
                    </ul>
                </font>
            </li>
        </ul>
    </td>
</tr>

<tr>
    <td valign="top">
        <strong>Embed</strong>
    </td>
    <td valign="top">SDK apps</td>
    <td>
        <font size="2">
            You can download Zoom SDKs to embed Zoom in third party
            applications.
        </font>
        <ul>
            <li>Meeting SDK</li>
            <li>Contact Center SDK</li>
            <li>Phone SDK</li>
        </ul>
    </td>
</tr>

<tr>
    <td valign="top">
        <strong>Connect</strong>
    </td>
    <td valign="top">Connector apps</td>
    <td>
        <font size="2">
            Add APIs to integrate third party data into the Zoom platform. See
            the <a href="/docs/build-flow/connect/">Connect documentation</a>{" "}
            for details.
        </font>
        <ul>
            <li>
                Upload a JSON or YML Open API v3.0.0 - 3.1.0 formatted file.
            </li>
            <li>Enter the base URL and authentication type and parameters.</li>
            <li>
                Set up and test endpoints to GET, POST, DELETE, PATCH, or PUT
                data.
            </li>
        </ul>
    </td>
</tr>

</tbody>
</table>

## Select in which Zoom products users can open your app

On the **Surface** tab, you can enable users to open your app directly within the Zoom client.

1. Select the Zoom products that your app works in.

    ![](/img/UBF-select-product2.png)

2. Enter the **Home URL** domain for your product. The Home URL enables you to run a web browser inside the Zoom client, and display the Home URL domain inside the in-client web browser.

    > You must have the required [OWASP response headers](/docs/build-flow/security/owasp/) in your Home URL.

3. In the **Domain Allow List**, add URLs to be accepted by the Zoom client.

## Select in-client app features

The availability of the features depends on the Zoom products you select and your app's **management type**. This is a list of the features available to your app based on the app management type.

**Note:** The management type affects the features and scopes available to your app. If you change the management type later on, make sure you reconfirm the selected features and scopes for your app.

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

## Step 4: Select the scopes (Zoom API methods)

On the **Scopes** page, select the Zoom API methods your app is allowed to call. This defines which information and capabilities are available to your user. See [OAuth Scopes](/docs/integrations/oauth-scopes-overview/) for details.

![](/img/UBF-scopes.png)

1. Select **Add Scopes**.
2. Select the Zoom product and check the desired scopes, then select **Done**.
3. In the **Scope Description** field, explain how the requested scope is necessary for your app.

    > When you add a scope, you are actually submitting a request to the Zoom Security Review team to allow your app to access specific Zoom API endpoints. A key principle in Zoom security practice is minimal access. If the Zoom Security Review team determines the requested scope is not necessary for your app, they may reject the scope request.

## Step 5: Test and preview your app

On the **Local Test** page, add and preview your app and share it with internal users.

**To add** the app for your own account, select **Add App Now** and then **Allow**.

**To see** a summary of your app's details and a preview of your app's listing page on the Zoom App Marketplace, select **Preview Your App Listing Page**.

> For security reasons, we limit the sharing of beta apps. We don't allow beta apps to be published to the Zoom Marketplace, and we allow beta app access only to members of the developer's Zoom account.

To share your app with other users on your account, go to the **Authorization URL** section, and select **Generate** and then **Copy**.

---

## Resources

-   [Build flow overview](/docs/build-flow/)
-   [Submit apps for review](/docs/build-flow/submitting-apps-for-review/)
-   [Publish your apps](docs/distribute/app-submission/submit-apps-review/)
-   [Persistent info](/docs/build-flow/persistent-app-info/)
