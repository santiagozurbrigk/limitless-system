---
title: "Integrations (OAuth apps)"
source: "https://developers.zoom.us/docs/integrations/"
capturado: "2026-11-23"
---

# Integrations (OAuth apps)

A user-managed OAuth app enables you to securely integrate with Zoom APIs and webhooks on behalf of an authorized user.

Using [OAuth 2.0](/docs/integrations/oauth), your app will have specific scoped data access, allowing you to make API requests and receive webhook events on their behalf.

To get started, [create an OAuth app](/docs/integrations/create) on the Zoom App Marketplace. Follow the [OAuth 2.0 authorization](/docs/integrations/oauth) documentation to receive an access token and make API requests.

## Prerequisite

You have read [Before you start](/docs/build-flow/before-you-build/) .

## User-managed OAuth starter App

You can use this sample app as a functional starting point for building user-level OAuth applications with Zoom.

-   [User-managed OAuth starter app](https://github.com/zoom/user-level-oauth-starter)

This app demonstrates solutions for managing user tokens and making Zoom REST API requests on their behalf. It also refreshes access tokens automatically by use of an express middleware.
