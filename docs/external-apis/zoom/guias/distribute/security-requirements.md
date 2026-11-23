---
title: "Security requirements for Zoom Marketplace apps"
source: "https://developers.zoom.us/docs/distribute/security-requirements/"
capturado: "2026-11-23"
---

# Security requirements for Zoom Marketplace apps

Zoom follows security best practices and guidelines to evaluate and review the security posture of apps submitted to the Zoom Marketplace. These practices are based on the latest industry security standards, with a focus on the unique needs of Zoom apps and their users.

---

## Optimize app data fetching

Apps should follow optimal patterns for requesting and subscribing to data from Zoom. Avoid using long-polling for the Zoom API; instead, subscribe to Webhook events. This improves performance and simplifies monitoring. You can enable **Event Subscriptions** for your app in the **Features** section when creating or managing your app on the **App Dashboard**.

---

## Optimize app authentication and refresh flows

Apps should avoid making frequent requests for OAuth tokens. Instead, request a token once and store it for future use, rather than generating a new token with each API request.

Cache the data returned by Zoom Authentication endpoints, and reuse access tokens until they expire. Once expired, use a refresh token to request a new access token. For more details on this flow, refer to [OAuth 2.0 for User Authorized Apps](/docs/integrations/oauth/).

### Re-authorization flows

Ensure your app includes a re-authorization flow for users who have removed it and wish to use it again. When they attempt to access a Zoom feature, display an error message prompting them to authorize your app once more before proceeding.

---

## OAuth allow list

In the **Add allow lists** field, list all unique URLs that Zoom should accept as valid redirect URLs for your OAuth flows. This security measure ensures users are only redirected to the pre-approved endpoints you provide. Include either the complete URL (e.g., https://subdomain.domain.tld/path/to/oauth/callback) or just the base URL (e.g., https://subdomain.domain.tld).

This is a required step to secure your app and protect against unwanted tampering. To minimize the risk of sensitive data leakage, only include URLs that match those in your **Redirect URL for OAuth** field.

Before submitting your app, ensure that you are following the guidelines regarding your URLs:

-   Use HTTPS for all URLs.
-   Use fully-qualified domain names (FQDN), avoiding localhost addresses.
-   Do not use [ngrok](https://ngrok.com/) domains, unless you can prove ownership.
-   Avoid default Heroku app domains (e.g., app_name.herokuapp.com); instead, use custom domains. If using external domains, provide a justification for adding them to the allow list.

---

## Technical design

The following information pertains to the Technical Design section of the app build flow.

If you answer "Yes" to any questions in the Application Development section, you must provide supporting documentation for the applicable security practices. This documentation is treated as confidential and used for the security review.

For Authorization URL approval (also referred to as Publishable URL approval), the following evidence is mandatory:

-   SSDLC documentation.
-   SAST scan results.
-   DAST scan results.
-   Privacy Policy.
-   Any three of the following five artifacts: executive summary of a penetration test, security policy, incident management and response policy, vulnerability management procedures, or infrastructure/dependency management policy.

SAST and DAST results must be provided as screenshots or official scanner-generated output. Custom-written summaries are not accepted as scan evidence.

Apps requesting Authorization URL approval must also support TLS 1.2 or higher.

These additional evidence requirements are specific to Authorization URL approval. They do not make the same supporting artifacts mandatory for Marketplace publication. Apps submitted for publication remain subject to the standard Marketplace review and security requirements.

For other Technical Design attestations, provide supporting evidence in an appropriate format, such as screenshots, PDFs, diagrams, or documentation, where applicable.

---

## Follow security best practices

### Software Development Lifecycle (SDLC) framework

Adopt a secure SDLC and ensure your coding practices align with industry standards.

### Proactive application scanning and penetration scanning

Before deploying new features, perform Static Application Security Testing (SAST), Dynamic Application Security Testing (DAST), and Open Source Component Analysis (OSCA) on both source code and the application itself. Regular penetration testing (pen testing) should also be conducted to identify and address vulnerabilities proactively.

### Data security (in transit and at rest)

Ensure that data is securely managed to prevent leakage or unauthorized access. This includes encrypting data both in transit (e.g., using TLS 1.2 or higher) and at rest. Regularly rotate encryption keys, secrets, and passwords to maintain security.

### Coding to mitigate security vulnerabilities

Developers should write code with security in mind, avoiding common vulnerabilities. This includes implementing input validation, proper authentication, and error handling. Verify user access and permissions before granting access to sensitive information. Apply the Principle of Least Privilege and Role-Based Access Control (RBAC) to restrict access.

---

## Logging and monitoring

Implement logging systems to monitor app usage and data access. Log key events, such as who accessed what data and when. Use Security Information and Event Management (SIEM) systems to detect suspicious activity and quickly address issues.

---

## Patching and updates

Regularly update your backend systems, libraries, and dependencies to address security vulnerabilities before they can be exploited. This includes updating tools, packages, and open-source components, as well as maintaining processes for updating production environments.

---

## Resources

-   [NIST - SSDF](https://csrc.nist.gov/Projects/ssdf)
-   [NIST Minimum code verification](https://www.nist.gov/itl/executive-order-14028-improving-nations-cybersecurity/recommended-minimum-standards-vendor-or)
-   [OWASP - Top 10](https://owasp.org/www-project-top-ten/)
-   [OWASP Vulnerabilities List](https://owasp.org/www-community/vulnerabilities/)
-   [SDLC](https://owasp.org/www-project-integration-standards/writeups/owasp_in_sdlc/)
-   [GDPR](https://gdpr.eu/)
-   [PCI](https://www.pcisecuritystandards.org/)
