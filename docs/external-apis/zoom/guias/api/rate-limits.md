---
title: "Rate limits"
source: "https://developers.zoom.us/docs/api/rate-limits/"
capturado: "2026-11-23"
---

# Rate limits

Rate limits define the maximum number of requests a single account can make within a given period of time. When you exceed a rate limit, the API request will fail and return a **HTTP 429** status code.

## Rate limit details

-   **Rate limits are applied at the account level.** These rate limits are shared by users for all apps installed on the account.
-   **Rate limits are applied based on your account plan.** Increased rate limits are available for all Business, Enterprise, Education, and Partner accounts. [See pricing for details](https://zoom.us/pricing).
-   **APIs are grouped by request type with unique rate limits for each.**
    -   **Request Type** - the rate-limit category an API belongs to (Light, Medium, Heavy, or Resource-intensive), which determines the quota it uses. Each API endpoint's documentation lists this as its **Rate Limit Label**.
    -   **Rate Limit Type** - how that quota is enforced, either per second (QPS) or as a daily limit.
-   Some APIs have special rate limits at the **user-level**.
-   Some APIs have **limits on concurrent operations** performed on a single resource.

> The Zoom API uses rate limits to ensure that API request traffic is efficiently handled. We may alter these limits as needed. See the [changelog](/changelog) for details.

## Rate limits by account type

Rate limits are applied based on the account plan, either **Free**, **Pro**, and **Business+** (which includes Business, Education, Enterprise & Partners). [Meeting SDK](/docs/meeting-sdk/) is included in these account types. This outlines the rate limits applied to APIs by rate limit type for each account plan.

| Rate Limit Type         | Free                  | Pro         | Business+   |
| ----------------------- | --------------------- | ----------- | ----------- |
| Light APIs              | 4/second, 6000/day    | 30/second   | 80/second   |
| Medium APIs             | 2/second, 2000/day    | 20/second   | 60/second   |
| Heavy APIs              | 1/second, 1000/day    | 10/second\* | 40/second\* |
| Resource-intensive APIs | 10/minute, 30,000/day | 10/minute\* | 20/minute\* |

\* Subject to combined daily rate limits:

-   Pro: 30,000 requests/day for heavy and resource-intensive APIs
-   Business+: 60,000 requests/day for heavy and resource-intensive APIs

### Zoom Build account rate limits

The [Zoom Build account](/docs/build/developer-accounts/) uses the **Pro** rate limit. See [Plans & Pricing for Developer](https://zoom.us/pricing/developer) for pricing.

## User-level rate limits

These are some special user-level rate limits.

### Meeting and Webinar create/update requests

-   100 create/update requests per day (UTC) per user
-   Applies to all Meeting/Webinar IDs hosted by the user
-   Resets at `00:00 UTC` daily

### Registration requests

-   3 requests per day (UTC) for the same registrant in the same meeting/webinar

### Registrant status requests

-   10 requests per day (UTC) for the same registrant in the same meeting/webinar

## Zoom Phone APIs

| Rate Limit Type         | Pro                    | Business+               |
| ----------------------- | ---------------------- | ----------------------- |
| Light APIs              | 20/second              | 40/second               |
| Medium APIs             | 10/second              | 20/second               |
| Heavy APIs              | 5/second, 15,000/day\* | 10/second, 30,000/day\* |
| Resource-intensive APIs | 5/minute, 15,000/day\* | 10/minute, 30,000/day\* |

\* Daily limit shared between heavy and resource-intensive APIs

## Canvas APIs

Canvas-Import

| Plan     | Per Minute | Per Day |
| -------- | ---------- | ------- |
| Free     | 60         | 50,000  |
| Pro      | 300        | 100,000 |
| Business | 600        | 200,000 |

Canvas-Export

| Plan     | Per Minute | Per Day |
| -------- | ---------- | ------- |
| Free     | 60         | 50,000  |
| Pro      | 500        | 200.000 |
| Business | 1000       | 300,000 |

\*Canvas APIs only with these labels will be rate limited.

## Zoom Contact Center APIs

Zoom Contact Center APIs are rate limited by request type and applied based on the account plan:

| Rate Limit Type | Pro                    | Business+               |
| --------------- | ---------------------- | ----------------------- |
| Light APIs      | 20/second              | 40/second               |
| Medium APIs     | 10/second              | 20/second               |
| Heavy APIs      | 5/second, 15,000/day\* | 10/second, 30,000/day\* |

\* Daily limit shared with resource-intensive APIs

## Concurrent request limits

Concurrent requests to a single resource may fail with a `429` HTTP status code. For example:

```plaintext
Too many concurrent requests. A request to disassociate this user has already been made.
```

## Error handling best practices

-   Handle `429` status codes by implementing a wait before retrying.
-   Build retry mechanisms for failed requests.
-   Reduce request frequency where possible.
-   Cache responses to minimize repetitive requests.
-   Use [**webhooks**](/docs/api/webhooks) for data change events instead of polling.

### Error table

This table lists errors you may encounter.

| Limit Type | HTTP Status | Error Message                                                                                                                                |
| ---------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-second | `429`       | `You have reached the maximum per-second rate limit for this API. Try again later.`                                                          |
| Daily      | `429`       | `You have reached the maximum daily rate limit for this API. Refer to the response header for details on when you can make another request.` |
