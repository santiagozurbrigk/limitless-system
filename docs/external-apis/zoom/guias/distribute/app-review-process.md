---
title: "App Review Process"
source: "https://developers.zoom.us/docs/distribute/app-review-process/"
capturado: "2026-11-23"
---

# App Review Process

![marketplace app review process](/img/marketplace_app_review_process-01.jpg)

[Public](/docs/build-flow/before-you-build/#choose-how-to-distribute-your-apps) and [unlisted](/docs/build-flow/before-you-build/#choose-how-to-distribute-your-apps) apps undergo a dedicated review process. Once an app is submitted, the Zoom App Marketplace team conducts the review and either approves the app or provides feedback to the developer on any required remediation work.

The of the review process are:

-   Confirm that the app is ready for use by end-users.
-   Confirm that the app follows best practices for privacy and security to reduce risks to users.

> **Note**
>
> [Private and beta](/docs/build-flow/before-you-build/#choose-how-to-distribute-your-apps) apps do not require review. See [Sharing private and beta apps](/docs/distribute/sharing-private-and-beta-apps).

---

## Submission completeness and branding review

### Submission completeness

Submission completeness is the most basic review. We verify that your app meets the minimal criteria required to be accepted into our review process. Requirements include accurate metadata, technical design documentation, security information. For more information, see [Common reasons for app submission rejection](/docs/distribute/app-submission/common-rejection-issues/).

### Branding

Branding is how you represent your product and how Zoom is presented within your developer domain or app. We review your app to ensure it adheres to [Zoom's branding guidelines](/docs/distribute/app-review-guidelines/#intellectual-property), such as distinctness in app name, meaningful description.

Zoom reserves the right to remove or require a revision to any content, in whole or part, including an app name, that violates:

-   [Zoom's branding requirements](/docs/distribute/app-review-guidelines/#intellectual-property).
-   [Zoom Marketplace Developer Agreement](https://explore.zoom.us/en/marketplace-developer-agreement/).
-   [Zoom Terms of Service](https://explore.zoom.us/en/terms/).
-   [Zoom Community Standards](https://explore.zoom.us/en/community-standards/).
-   Or for any other reason at our sole discretion.

---

Back to [top](/docs/distribute/app-review-process/)

## Functionality, usability, and compliance review

All apps undergo functionality, usability and compliance review to check for user experience issues and technical errors, as well as functional or business logic issues.

### Functionality

We review your app's functionality and confirm that it works as you described. We confirm the installation and uninstallation processes, configuration settings, and user sign-up process. We also attempt to use the Zoom integration within your app to ensure data flow.

### Usability

After confirming your app's functionality, we review its usability. We go through typical tasks and use cases for the target user. In addition, we evaluate whether it has a positive user experience.

-   **Ads and analytics:** Your app should not present advertising to Zoom users or collect user information for marketing purposes. You can aggregate anonymous data for the purposes of running your business. See [Privacy and User Data Management](/docs/distribute/app-review-guidelines/#privacy-and-user-data-management) for more information.
-   **Be frictionless:** Your app should blend into the Zoom experience and not be a nuisance to users. Example: unnecessary pop-ups, unexpected computer audio, or spam.
-   **Be original:** Your app should not copy another app's functionality or design.
-   **Be transparent:** Clearly communicate the implications of using your app to users. A user should be able to understand what any interaction with the app will do, including what data will be collected and who it will be shared with.

### Compliance

Compliance review is done before security testing. We review your technical design documentation, including information you provide about your technology stack, architecture, and data handling; and verify compliance with Zoom's security and privacy requirements.

---

Back to [top](/docs/distribute/app-review-process/)

## Security review

The Zoom App Marketplace Security Review is designed to help protect customer data and ensure the overall integrity and resilience of the ecosystem. This multi-part review focuses on how an app handles data transmission, storage, and potential exposure of sensitive information.

### What does the Security Review include?

-   **Technical design review**: As part of the app submission process, all developers must complete the [Technical Design](/docs/distribute/security-requirements/#technical-design) section of the build flow. The information you provide outlines how the app is built, what security controls are in place, and how it uses data collected via Zoom OAuth scopes. This helps the Zoom Review Team understand the app's architecture and security approach.
-   **OAuth scope evaluation**: The Marketplace Security Review Team verifies that the app only requests the minimum necessary OAuth scopes required for its functionality. Developers may be asked to remove unused or inappropriate scopes.
-   **Security testing**: Apps are tested against the [OWASP Top 10 risks](https://owasp.org/www-project-top-ten/) and undergo a variety of assessments, including:

    -   Verification of least-privilege access.
    -   Web application security scanning.
    -   Manual testing for misuse or vulnerabilities.
    -   Checks for vulnerable libraries.

    > **Note**
    >
    > Load testing or DoS/DDoS simulations are **not** part of security review.

By submitting your application to Zoom, you are responsible for meeting or exceeding industry standards around the security of your app and the data it processes. You also must comply with the relevant laws, policies, and regulations around data security for your app.

Security is a shared responsibility between Zoom and the developer. Developers are encouraged to review Zoom's [Security requirements](/docs/distribute/security-requirements/) and conduct internal reviews prior to submission.

Additional resources, see [Reporting of security test results](/docs/distribute/app-submission/check-review-status/#reporting-of-security-test-results).

---

Back to [top](/docs/distribute/app-review-process/)

## Remediation

The remediation process is available for those apps that don't pass app review. We provide a report explaining the reasons we did not accept the app and action items you can complete to remediate the issues. Once you have completed all open items you can resubmit the app for review.

---

Back to [top](/docs/distribute/app-review-process/)

## Ongoing monitoring

We monitor applications that have passed app review and been published to the App Marketplace to ensure continued compliance with our guidelines. If we find any issues, particularly with respect to the security of your application, we may make recommendations to help you remediate those issues. We expect your cooperation and that you will promptly respond to any request for additional information. In the event that an issue is discovered that presents a significant risk to our users, we may remove your app from use while remediation steps are completed.

An app's review time varies based on app quality, usability, quantity and function of features, and clarity of information (descriptions, images, videos). Testing time is typically the shortest for apps that have properly defined scopes, a clear test plan, and clear descriptive content for listing information. Apps with poorly described scopes, confusing UI, or unclear listing information may require a lengthy review process.

---

Back to [top](/docs/distribute/app-review-process/)

## Resources

-   How to build apps:
    -   [Developer forum](https://devforum.zoom.us/)
    -   [Developer documentation](/docs)
-   How to publish apps:

    -   [Publishing Apps](/docs/distribute/)
    -   [Common reasons for app rejection](/docs/distribute/app-submission/common-rejection-issues/)

-   How to [Grow your app with Zoom](/docs/distribute/grow-your-app)
-   Zoom SDK Apps
    -   [Zoom SDK App review process](/docs/distribute/sdk-feature-review-requirements/)
