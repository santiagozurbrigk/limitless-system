---
title: "Developer lifecycle"
source: "https://developers.zoom.us/docs/build-flow/basic-info/lifecycle/"
capturado: "2026-11-23"
---

# Developer lifecycle

The Zoom platform products, such as [APIs](/docs/api/), [SDKs](/docs/sdk-references/), or [webhooks](/docs/api/webhooks/), each follow their own developer lifecycle. This lifecycle generally outlines how long Zoom supports a product, when it makes updates, and when it retires older versions. This document defines these stages to help you plan maintenance, manage integrations, and avoid service disruptions if a product moves into a new stage of the lifecycle.

## 1. Initial release

The initial release is when a new product becomes publicly available. It's considered stable and ready for developers to use in production. Zoom often provides documentation, sample code, and an initial version nubmer.

**Developer impact**:

-   You can likely begin building or upgrading your integration.
-   It's important to track the version number you're using as future updates will refer to it.

## 2. Deprecation

Deprecation signals that Zoom expects to replace or remove an existing version or feature in the future. It's often still functional, but you're encouraged to migrate to the newer version. Zoom may provide a deprecation notice, which often includes:

-   The date the feature was deprecated.
-   Any recommended alternative.
-   The expected timeline for sunset.

**Developer impact**:

-   Existing integrations generally continue to work, but you should begin migrating.
-   Deprecated versions may stop receiving bug fixes or new features.

## 3. Sunset

During the **sunset** phase, the deprecated version often begins to lose functionality or availability. Zoom may limit new app registrations, restrict certain endpoints, or disable new API keys for the old version.

**Developer impact**:

-   You should finalize your migration during this period.
-   API responses may start returning warnings or partial data.
-   Support from Zoom's developer platform may be reduced or ended.

These lifecycle stages are generally reported in the product documentation and [changelog](/changelog/) with tags such as **Deprecation** or **Breaking change**. Be sure to monitor these resources for any updates.
