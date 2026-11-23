---
title: "App Review Guidelines and Principles"
source: "https://developers.zoom.us/docs/distribute/app-review-guidelines/"
capturado: "2026-11-23"
---

# App Review Guidelines and Principles

The Zoom App Marketplace is the leading platform for discovering, deploying, and managing Zoom in-client apps and apps that integrate with Zoom's video-first unified communications platform. Zoom's platform spans video, voice, content sharing, and chat across desktop, mobile devices, and workspaces.

These guidelines describe Zoom's app review process, along with the rules and requirements for apps to be accepted into - and remain in - the Zoom App Marketplace. They also describe best practices and conduct that prevents an application from being available in the App Marketplace.

This is a living document. We expect to add to or amend rules and guidelines as needed. Ensure you have the latest version.

_Published: March, 12, 2023._

---

## Guiding principles

We take a principles-based approach to reviewing apps. The listed principles guide our review process.

-   **Value** - We understand that value comes in many forms, and we encourage creativity in following this principle. Your product should focus on adding value to the user of your app, perhaps by improving their productivity, or facilitating a positive social interaction.
-   **Trust** - Customers feel valued when we show respect for their data and give them confidence their data is secure. Ensure your product accesses only the data needed to complete the task.
-   **Community** - Being a good neighbor is about ensuring the Zoom community continues to be a safe space, and creating safe products for our customers to interact with Zoom. Let's work together to create products that keep the Zoom community kind, supportive, and inclusive.
-   **Children** - Increasingly, children have been using Zoom to keep up with school. When creating products for children, keep in mind the specific measures Zoom requires to protect the security and privacy of our younger users.
    For more information, check out [Zoom's Privacy Statement](https://explore.zoom.us/docs/en-us/privacy.html), [Zoom for K-12/Primary and Secondary Schools Privacy Statement](https://explore.zoom.us/en/schools-privacy-statement/), and our [FERPA Guide](https://explore.zoom.us/docs/doc/FERPA%20Guide.pdf).
-   **Integrity** - Zoom enforces the app guidelines and policies to help provide safe and robust products to our users. Developers that violate the guidelines and policies are removed from the App Marketplace and are banned from the Zoom Developer Platform.

---

Back to [top](#zoom-marketplace-app-review-guidelines-and-principles)

## Security principles

Zoom uses the principles outlined in this section when evaluating and reviewing the security posture of the app. However, these principles by no means encompass all security scenarios.

-   **Security by design** - Use established security frameworks and resources to ensure your application is secure. Security should be a consideration of all features/functionality before development begins. Document and complete security checks in all stages of the application development lifecycle.
-   **Secure data** - User data is sensitive information. Do not present data in plain text. Encrypt data in transit with modern and standard encryption methods. Encrypt any stored Zoom data when stored, and check and verify access to the data before allowing access.
-   **Verify access** - Make sure that you verify accesses and permissions before allowing access to sensitive information.
-   **Conduct your own testing** - Remediate findings prior to submission of your app and on a continuous basis. Our review process should be a validation of your own testing. Any issues found will result in us rejecting your application.
-   **Implement a monitoring/logging system** - Have a mechanism in place to monitor and log the use of applications and access to data. Monitor and review logs for suspicious activity.
-   **Fail securely** - Error and failure mechanisms should not disclose or provide any information which could be used to gain information or unauthorized access to the system or data.
-   **Stay up to date** - Remediate security vulnerabilities in backend systems, dependencies, and open source libraries before they can be used as attack vectors. Consider executing 3rd-party penetration tests and/or implementing a bug bounty program to incentivize good actors to identify vulnerabilities within your app.
-   **Be mindful of common security vulnerabilities** - The [OWASP Top 10](https://owasp.org/Top10/) references the most common types of security vulnerabilities found in web applications. Test, scan, and remediate these common vulnerabilities on an ongoing basis, as they are easy targets for attackers and will be reviewed by our security testing.
-   **Share responsibility** - If you notice suspicious activity or mishandling of Zoom data, notify us immediately. As part of this partnership, we all have vested interests in ensuring Zoom users and data are safe and protected.

---

Back to [top](#zoom-marketplace-app-review-guidelines-and-principles)

## Safety guidelines

It's very important to us at Zoom that our users can safely use the apps available on the Zoom App Marketplace. Ensure that you've read Zoom's safety guidelines and that your app meets the safety requirements.

### Underage users (Under 16)

Pre-requisite: Read Safety Guidelines for Children:

According to Zoom's [TOU](https://www.zoom.com/en/trust/terms/), Zoom is not intended for use by individuals under sixteen (16) years old unless such use is through a School Subscriber using Zoom for Education (K-12).

See [Services Description](https://explore.zoom.us/en/services-description/) for more details

It is not acceptable for apps to directly target children under 16, except through properly managed educational environments. If it's not immediately apparent why a developer has indicated their app collects data from users under 16, we will ask you for a valid explanation.

### Content

Zoom's goal is to make the Zoom experience more productive, organized, engaging, collaborative, happy, and fun. To that end, the Content Moderation Principles that guide how we think about content on Zoom generally also apply to content provided through apps. For more information about and examples of what we consider to be objectionable content, please see our Community Standards. We recommend reviewing these closely, as they are informative about the kind of apps we will approve

### Objectionable content

As a general rule, apps should not include content that is offensive, hateful, insensitive, upsetting, or that promotes illegal activity. Examples of that content include but aren't limited to:

-   Content that promotes violence against, threatens, or harasses other people on the basis of race, ethnicity, national origin, caste, sexual orientation, gender, gender identity, religious affiliation, age, disability, or serious disease. This includes content promoting organizations that advocate or condone those practices.
-   Content that you do not have a right to transmit, including under trademark and copyright laws; or content that is meant to defame others, impersonate anyone, or use another's name or image without their permission.
-   Content that depicts death, violence, or serious physical injury in graphic detail. This includes content showing violent crimes, physical fights, abuse against children and animals, or bodily fluids and gratuitous gore.
-   Content that promotes or encourages trading or engaging in illegal or certain regulated goods or services, like gambling, sexual services, or firearms.
-   Adult content, including pornography and other content intended to cause sexual arousal, and most nudity.

### User-generated content

We require that apps with user-generated content have certain features in place in order to prevent abuse. These features include employment of a method to filter objectionable content from being displayed in the app, and a mechanism for users to report offensive content and receive timely responses.

### Misrepresentations

We want users to be confident that the Zoom App Marketplace is trustworthy and that the app they install will match their basic expectations. For that reason, we will reject or remove apps that attempt to mislead users or misrepresent their primary purpose. For example, we don't allow:

-   Apps that include hidden or undocumented features, or apps whose functionality is unclear to users.
-   Apps whose marketing claims that they include content or functionality that they don't actually offer.
-   Apps that misrepresent the app's developer, owner, primary purpose, or other material details – including by impersonating another person or organization, for example.

### Spam

We don't allow apps that spam or otherwise send unsolicited or excessive messages to users.

### Threats, stalking, and physical harm

Developers and applications are prohibited from harassing, stalking, intimidating, or otherwise threatening users. Apps created for those purposes, or apps with user-generated content that end up being primarily used for those purposes, will be removed.

We also may reject or remove apps that could otherwise risk physical harm to users, including but not limited to apps that urge users to participate in dangerous challenges. We also take seriously the potential for medical apps to provide inaccurate or dangerous information to users, and we review these apps closely.

---

Back to [top](#zoom-marketplace-app-review-guidelines-and-principles)

## Privacy and user data management

Zoom is committed to protecting user privacy. The Zoom Developer Platform makes user personal and device data available to our app developer partners. It is of utmost importance to handle user data appropriately and safely so that Zoom and our partners can provide a safe and trusted experience for our users.

Access and handle user data in accordance with applicable law, Zoom's developer guidelines, and any applicable agreements between you and Zoom.

### Required disclosures

You must be transparent in how you collect and handle users' Personal User Data, which is defined in the next section. That means disclosing your app's access, collection, use, maintenance, and sharing of that data, and ensuring that personal user data is used only for the purposes that you disclose to the user.

### Personal user data

"Personal User Data" is any information about a user, including information that you can associate with an individual user. It includes,
but isn't limited to, meeting content (e.g. audio and video) and profile and contact information as well as data regarding a user's microphone,
camera, device, or usage. "Sensitive User Data" is subset of Personal User Data that includes, but is not limited to: data (other than information
disclosed through audio and video) revealing: (1) racial or ethnic origin; (2) political opinions, religious or philosophical beliefs;
(3) trade union membership; (4) biometric or genetic information; (5) personal health information or information about sexual activity or orientation;
(6) personal financial information; (7) information about children under the age of 16; or (8) payment or authentication information.

All apps must include a link to your privacy policy in your app description page in the App Marketplace.

Together with any in-app disclosures, your app's privacy policy must comprehensively disclose how your app accesses, collects, uses, maintains, and shares Personal User Data. Confirm that any third party with whom your app shares Personal User Data will provide the same or equal protection of Personal User Data as required in Zoom's developer guidelines. Explain your data retention policies and describe how a user can fulfill their Personal User Data access requests, including accessing or deleting the user's Personal User Data.

If your app handles Sensitive User Data, then you must disclose this when you submit your app for review, and your app must obtain the user's explicit consent before any such handling. You must only access, collect, use, and/or share Personal User Data – including Sensitive User Data – that you obtain through the app for purposes directly related to providing the app and improving its features. These functions and features of your app should be ones that a user can reasonably anticipate based on your app's description in the App Marketplace.

Some additional guidance:

-   You may not sell or rent Personal User Data.
-   You may not access Personal User Data for surveillance purposes or to allow or assist any entity to conduct surveillance.
-   You may not use Personal User Data to build profiles based on Zoom users for advertising or marketing purposes, regardless of whether that data is anonymized or aggregated.
-   Apps must not attempt to reverse engineer or otherwise reconstruct user profiles that have been anonymized, aggregated or otherwise de-identified.
-   Apps must not be primarily intended for users under the age of 16. See the 'Safety' section of this document for more information.
-   Ensure your company name matches in the [Privacy Policy](/docs/build-flow/app-listing/links/#privacy-policy-url) and all other documentation you provide to Zoom. See [EU requirements](/docs/distribute/eu-requirements/).
-   See Zoom's guidance on [Privacy attestation](/docs/distribute/app-submission/privacy-attestation/) and practices.

### Permission scopes

Permission requests should make sense to your users. You may only request permissions that are necessary to implement current features or services in your app that are disclosed in your App Marketplace listing. You may not use permissions that give access to user or device data for undisclosed, unimplemented, or disallowed features or purposes.

You must obtain express user consent in order to access "sensitive" permissions that provide access to the user's device, such as camera, microphone, and background.

---

Back to [top](#zoom-marketplace-app-review-guidelines-and-principles)

## Legal guidelines

These guidelines set out our rules and requirements for apps to be accepted into (and remain in) the Zoom App Marketplace. They are intended to provide transparency into our app review process, and to make explicit the kind of content and conduct that will result in a rejection of your app following initial review, or that may risk removal of your app from the Zoom App Marketplace. These guidelines are a living document, and we may add to or amend them as necessary.

### Legal notifications

At Zoom, we want to be transparent about how a user's data is shared when they use Zoom products or features. In order to provide this transparency and fulfill our regulatory obligations, we may require or recommend that you incorporate certain legal notices in your app, depending on the app type. Please review the developer documentation for information on required legal notices.

### Applicable terms

In addition to these guidelines, there are certain terms and conditions that apply to the operation, distribution, and use of your application:

-   The Zoom Terms of Service (or a Master Subscription Agreement, if applicable) govern the use of Zoom products and services generally.
-   The Zoom API License and Terms of Use, which governs your access to and use of our APIs and Meeting SDKs.
-   The Zoom Marketplace Developer Agreement, which governs your ability to publish and distribute your app on the Zoom App Marketplace.

### Intellectual property

All content in your app should be either content that you've created or own, or content that you have a license to use, display, perform, or distribute. Make sure that your app - and the metadata associated with it - does not contain protected third-party content (like trademarks and copyrighted works, such as music) without the permission of that third party. Providing a disclaimer that your use of the content is "unofficial" or a disclaimer that you aren't affiliated with the intellectual property owner isn't sufficient. Assertions that use of third party content without permission is "fair use" or free to use under a open source license, including Creative Common licenses, may be inaccurate and should be evaluated by the developer and their counsel before submission to Zoom.

Zoom complies with all laws regulating platforms' distribution of potentially infringing content, such as the DMCA in the United States. If Zoom receives a complaint asserting a developer's app infringes third party intellectual property rights, the app will be removed from the Marketplace as prescribed by such laws. Information on submitting complaints of trademark and copyright infringement to Zoom may be found [here](https://explore.zoom.us/en/copyright-and-trademark-takedowns/).

Additionally, don't create an app that seems confusingly similar to a Zoom product or service, or as though it was created by or is endorsed by Zoom. You may not use the Zoom trademark in your product name; however, you can use "for Zoom" to describe your app's compatibility. Further information on proper use of the Zoom mark can be found in the [Partner Brand Guide](http://zm.me/partner-branding) and the [Trademark Use Guidelines](https://brand.zoom.com/document/21#/-/partner-resources).

---

Back to [top](#zoom-marketplace-app-review-guidelines-and-principles)

## Resources

-   How to build apps:
    -   [Developer forum](https://devforum.zoom.us/)
    -   [Developer documentation](/docs)
-   How to [distribute apps](/docs/distribute/)
-   How to [Grow your app with Zoom](/docs/distribute/grow-your-app/)
