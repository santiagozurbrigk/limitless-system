---
title: "OAuth Information"
source: "https://developers.zoom.us/docs/build-flow/basic-info/oauth-info/"
capturado: "2026-11-23"
---

# OAuth Information

Zoom apps use OAuth 2.0 to securely grant third-party applications access to Zoom APIs without exposing user credentials. The OAuth section in the app build flow helps secure authentication between your app and Zoom, ensuring access is granted to the intended user.

---

> The OAuth values differ in the development and production environments. Keep this in mind when you switch between the **Development** and **Production** environment filters.

![](/img/OAuth-info.png)

-   **OAuth Redirect URL (Required)**

    When users add an app, Zoom displays a consent screen. If the user approves, Zoom generates an authorization code or token and redirects them to the specified URL. To prevent malicious redirections, we require apps to be registered using valid redirect URLs.

    While you can use loopback URLs and other development endpoints for development redirects, avoid using them in production redirects. These resources are not suitable for production-ready end users and may be rejected during the marketplace publishing review.

    > Custom URL schemes are supported only for Zoom Meeting SDK apps. To enable Meeting SDK, go to **Features** > **Embed**.
    >
    > If you are building an SDK app that does not need to be authorized by the end user, use your company's home domain for the OAuth Redirect URL field.

-   **Strict Mode URL (Optional)**: Allows only exact matches of the registered OAuth redirect URLs.
-   **Subdomain Check (Optional)**: Restricts redirects to the same subdomain as the registered OAuth URLs.
-   **OAuth Allow Lists (Required)**: Limits redirects to specified URLs, ensuring users are redirected only to pre-approved endpoints. You can specify:
    -   A complete URL (e.g., https://subdomain.domain.tld/path/to/oauth/callback)
    -   A base URL without a path or query parameters (e.g., https://subdomain.domain.tld)

**Strict mode** and **subdomain checks** help reduce the risk of URL tampering by giving you more control over which URLs can access your app.
See below for examples of what to expect when you enable or disable strict mode and subdomain checks.

---

## Strict mode and subdomain checks disabled

When both strict mode and subdomain checks are disabled, Zoom only verifies the main domain, and doesn't verify subdomains or paths.
In this example, we entered https://zoom.us as the main domain in the Allow List.

![](/img/oauth-strict-subdomain-unchecked.png)

Examples of URLs that will be allowed:

-   https://zoom.us
-   Https://zoom.us/path1/path2
-   Https://zoom.us/pat?hellow=world
-   https://marketplace.zoom.us
-   https://marketplace.zoom.us/path1/path2

---

## Subdomain check enabled

When only the subdomain is enabled, Zoom verifies the main domain and the subdomains.
In this example, we entered https://zoom.us as the main domain in the Allow List.

![](/img/oauth-subdomain-checked.png)

Examples of URLs that will be allowed:

-   https://zoom.us
-   Https://zoom.us/path1/path2
-   Https://zoom.us/pat?hellow=world

Examples of URLs that will not be allowed:

-   https://marketplace.zoom.us
-   https://marketplace.zoom.us/path1/path2

If we add https://marketplace.zoom.us into the allow list, the check then allows the `marketplace` subdomain.

-   https://marketplace.zoom.us
-   https://marketplace.zoom.us/path1/path2

---

## Strict mode enabled

When **strict mode** is enabled, the redirect URL is verified character by character, regardless of whether the subdomain check is enabled.
In this example, we entered https://zoom.us as the main domain in the Allow List.
Only https://zoom.us will be allowed to pass.

![](/img/oauth-strict-checked.png)
