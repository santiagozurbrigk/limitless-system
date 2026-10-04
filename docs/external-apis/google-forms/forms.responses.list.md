---
source: https://developers.google.com/workspace/forms/api/reference/rest/v1/forms.responses/list
captured: 2026-10-03
---



Method: forms.responses.list  |  Google Forms  |  Google for Developers

Skip to main content

Google

Workspace

/

English

Deutsch

Español

Español – América Latina

Français

Indonesia

Italiano

Polski

Português – Brasil

Tiếng Việt

Türkçe

Русский

עברית

العربيّة

فارسی

हिंदी

বাংলা

ภาษาไทย

中文 – 简体

中文 – 繁體

日本語

한국어

Sign in

Google Forms

To give form creators more control over who can respond, we're introducing granular controls for responders. Forms created with the API after June 30, 2026 will have an unpublished state by default. To learn more, see API changes to Google Forms .

Home

Google Workspace

Google Forms

Reference

Send feedback

Method: forms.responses.list

Stay organized with collections

Save and categorize content based on your preferences.

HTTP request

Path parameters

Query parameters

Request body

Response body

JSON representation

Authorization scopes

Try it!

List a form's responses.

HTTP request

GET https://forms.googleapis.com/v1/forms/{formId}/responses
The URL uses gRPC Transcoding syntax.

Path parameters

Parameters

formId

string

Required. ID of the Form whose responses to list.

Query parameters

Parameters

filter

string

Which form responses to return. Currently, the only supported filters are:

timestamp > N

which means to get all form responses submitted after (but not at) timestamp N . *

timestamp >= N

which means to get all form responses submitted at and after timestamp N .
For both supported filters, timestamp must be formatted in RFC3339 UTC "Zulu" format. Examples: "2014-10-02T15:01:23Z" and "2014-10-02T15:01:23.045123456Z".

pageSize

integer

The maximum number of responses to return. The service may return fewer than this value. If unspecified or zero, at most 5000 responses are returned.

pageToken

string

A page token returned by a previous list response. If this field is set, the form and the values of the filter must be the same as for the original request.

Request body

The request body must be empty.

Response body

Response to a ListFormResponsesRequest.

If successful, the response body contains data with the following structure:

JSON representation

{
"responses" : [
{
object ( FormResponse )
}
] ,
"nextPageToken" : string
}

Fields

responses[]

object ( FormResponse )

The returned form responses. Note: The formId field is not returned in the FormResponse object for list requests.

nextPageToken

string

If set, there are more responses. To get the next page of responses, provide this as pageToken in a future request.

Authorization scopes

Requires one of the following OAuth scopes:

https://www.googleapis.com/auth/drive

https://www.googleapis.com/auth/drive.file

https://www.googleapis.com/auth/forms.responses.readonly

For more information, see the Authorization guide .

Send feedback

Except as otherwise noted, the content of this page is licensed under the Creative Commons Attribution 4.0 License , and code samples are licensed under the Apache 2.0 License . For details, see the Google Developers Site Policies . Java is a registered trademark of Oracle and/or its affiliates.

Last updated 2025-02-27 UTC.

Need to tell us more?

[[["Easy to understand","easyToUnderstand","thumb-up"],["Solved my problem","solvedMyProblem","thumb-up"],["Other","otherUp","thumb-up"]],[["Missing the information I need","missingTheInformationINeed","thumb-down"],["Too complicated / too many steps","tooComplicatedTooManySteps","thumb-down"],["Out of date","outOfDate","thumb-down"],["Samples / code issue","samplesCodeIssue","thumb-down"],["Other","otherDown","thumb-down"]],["Last updated 2025-02-27 UTC."],[],["To list form responses, use a `GET` request to the specified URL, including the form's ID in the path. Utilize optional query parameters like `filter`, `pageSize`, and `pageToken` to refine the results. The request body must be empty. The response includes an array of form responses and a `nextPageToken` if additional responses are available. Authorization requires specific OAuth scopes like `drive`, `drive.file`, or `forms.responses.readonly`.\n"]]

