---
title: "Regenerating Authorization URLs"
source: "https://developers.zoom.us/docs/distribute/app-submission/regenerating-authorization-url/"
capturado: "2026-11-23"
---

# Regenerating Authorization URLs

## When would I need to regenerate my authorization URL?

You regenerate the authorization URL when you have changes to your app and want to make it available to your users.

For example, during beta testing you add additional scopes to your app. To make these updates available to your users, you must regenerate the authorization URL, and send it to them. The changes become available to users after they use the updated URL and add the updated app.

## What are the consequences for existing users?

Users that do not use the updated URL to reauthorize their app can continue to use the existing app but won't have access to the new features.

## How do I communicate the update to my subscribers?

> **Best practice**
>
> You should only share a beta application or an authorization URL with a close group of users who have existing communication paths to your team.

You need to communicate the regenerated URL and a description of the changes to the app to your users. You may also include instructions to the users whether you require them to use the updated version.

To ensure you have a method of communicating changes and updates: you can have users provide their email addresses as a condition for using the app; or you can include a `user:information` scope in your app and pull the user email at authentication time.

## When does my regenerated authorization URL expire?

Your regenerated URL has the same expiration as the original requested authorization URL.

## Resources

-   [Sharing Beta Apps](/docs/distribute/sharing-private-and-beta-apps/)
-   [Authorization URL FAQ](/docs/distribute/app-submission/authorization-url-faq/)
