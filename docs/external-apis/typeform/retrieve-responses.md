---
source: https://www.typeform.com/developers/responses/reference/retrieve-responses/
captured: 2026-10-03
---

Retrieve responses Group 11 Get Started Guides
Run in Postman
Applications
Login button script
OAuth 2.0 scopes
Personal access token
EU Responses Data Center
Get hands-on
Data portability

MCP Server Guides
Build an MCP connector
Core concepts
Supported tools
Plans and feature access
Testing
Submit feedback

Create API Guides
Walkthroughs
Translations
URL Parameters
Logic Jumps
Image sizes
Score and price
Recall Information
Workspaces

Reference
Retrieve account workspaces
Create account workspace
Retrieve workspaces
Create workspace
Delete workspace
Retrieve workspace
Update workspace

Retrieve forms
Create form
Delete form
Retrieve form
Update form (patch)
Update form
Retrieve custom form messages
Update custom messages

Retrieve translation payload
Retrieve translation statuses
Delete form translation
Retrieve form translation
Update form translation
Auto-translate form

Retrieve images collection
Create image
Delete image
Retrieve image
Retrieve background by size
Retrieve choice image by size
Retrieve image by size

Upload a video file
Batch fetch videos with clip configurations

Retrieve themes
Create theme
Delete theme
Retrieve theme
Update theme (partial update)
Update theme (whole definition)

Responses API Guides
Walkthroughs
JSON response explanation
Right To Be Forgotten (RTBF)
RTBF custom script

Reference
Delete responses
Retrieve responses
Search responses using advanced filters

Download all files uploaded by respondents for a form
Get a file from a response

Get audio master file (download)
Request audio master file generation
Get video master file (download)
Request video master file generation

Webhooks API Guides
Walkthroughs
Example webhook payload
Secure your webhooks

Reference
Retrieve webhooks
Delete webhook
Retrieve single webhook
Create or update webhook

Embed Guides

Vanilla Embed Library
-- Inline embed
-- Modal embeds
-- Configuration
-- URL Parameters
-- Callbacks
React Embed Library
Contributing
Mobile apps
Custom embeds

Responses
Retrieve responses

get https://api.typeform.com /forms/{form_id}/responses

Returns form responses and date and time of form landing and submission. Very recent responses (say within the last 30 minutes) may not be returned. Considering using Typeform webhooks instead for real-time submission data.

Request
Query Parameters
page_size integer
If your typeform has more than 1000 responses, use the since / until or before / after query parameters to narrow the scope of your request.

since string
Limit request to responses submitted since the specified date and time, inclusive. Could be passed as int (timestamp in seconds) or in ISO 8601 format, UTC time, to the second, with T as a delimiter between the date and time ( 2020-03-20T14:00:59 ).

until string
Limit request to responses submitted until the specified date and time, inclusive. Could be passed as int (timestamp in seconds) or in ISO 8601 format, UTC time, to the second, with T as a delimiter between the date and time ( 2020-03-20T14:00:59 ).

after string
Return responses submitted after this cursor (exclusive).

before string
Return responses submitted before this cursor (exclusive).

included_response_ids string
Limit request to the specified response_id values. Use a comma-separated list to specify more than one response_id value.

excluded_response_ids string
Comma-separated list of response_id s to be excluded from the response.

response_type array of array
Limit responses to only those which are of the provided response type. It is expected to be passed as a comma separated list of values, e.g. response_type=partial,completed . This parameter changes since / until filter, so if completed responses are requested it will filter by submitted_at , if partial responses are requested it will filter by staged_at , otherwise - landed_at . Default value is completed .

completed boolean
This query param is deprecated, please use response_type param instead. Limit responses to only those which were started ( completed=false ), but not completed ( completed=true ) (the respondent did not submit their answers). When completed=false , the responses do not have answers , hidden or calculate members. This parameter changes since / until filter, so if completed=true , it will filter by submitted_at , otherwise - landed_at . Default value is completed=true .

sort string
How to sort the returned responses. Default is submitted_at,desc for completed responses, staged_at,desc for partial responses, and landed_at,desc for started responses.

query string
Search for an exact phrase within answer values, hidden field values, and variable values. A response matches when any of the three contains the phrase as a contiguous sequence of words.

fields array of array
Show only specified fields in answers section. If response does not have answers for specified fields, there will be null . Use a comma-separated list to specify more than one field value.

answered_fields array of array
Limit request to only responses that include the specified fields in answers section. Use a comma-separated list to specify more than one field value - response will contain at least one of the specified fields.

Path Parameters
form_id , required
Unique ID for the form. Find in your form URL. For example, in the URL "https://mysite.typeform.com/to/u6nXL7" the form_id is u6nXL7 .

Responses
Status
200 OK Schema
Representation of collection of responses to a specific form.
It is used for displaying results in a human-friendly format.
total_items number
Total number of items in the retrieved collection.

page_count number
Number of pages.

items array of object

Example
{
"items" : [
{
"answers" : [
{
"field" : {
"id" : "hVONkQcnSNRj" ,
"ref" : "my_custom_dropdown_reference" ,
"type" : "dropdown"
} ,
"text" : "Job opportunities" ,
"type" : "text"
} ,
{
"boolean" : false ,
"field" : {
"id" : "RUqkXSeXBXSd" ,
"ref" : "my_custom_yes_no_reference" ,
"type" : "yes_no"
} ,
"type" : "boolean"
} ,
{
"boolean" : true ,
"field" : {
"id" : "gFFf3xAkJKsr" ,
"ref" : "my_custom_legal_reference" ,
"type" : "legal"
} ,
"type" : "boolean"
} ,
{
"field" : {
"id" : "JwWggjAKtOkA" ,
"ref" : "my_custom_short_text_reference" ,
"type" : "short_text"
} ,
"text" : "Lian" ,
"type" : "text"
} ,
{
"email" : "lian1078@other.com" ,
"field" : {
"id" : "SMEUb7VJz92Q" ,
"ref" : "my_custom_email_reference" ,
"type" : "email"
} ,
"type" : "email"
} ,
{
"field" : {
"id" : "pn48RmPazVdM" ,
"ref" : "my_custom_number_reference" ,
"type" : "number"
} ,
"number" : 1 ,
"type" : "number"
} ,
{
"field" : {
"id" : "Q7M2XAwY04dW" ,
"ref" : "my_custom_number2_reference" ,
"type" : "number"
} ,
"number" : 1 ,
"type" : "number"
} ,
{
"field" : {
"id" : "WOTdC00F8A3h" ,
"ref" : "my_custom_rating_reference" ,
"type" : "rating"
} ,
"number" : 3 ,
"type" : "number"
} ,
{
"field" : {
"id" : "DlXFaesGBpoF" ,
"ref" : "my_custom_long_text_reference" ,
"type" : "long_text"
} ,
"text" : "It's a big, busy city. I moved here for a job, but I like it, so I am planning to stay. I have made good friends here." ,
"type" : "text"
} ,
{
"field" : {
"id" : "NRsxU591jIW9" ,
"ref" : "my_custom_opinion_scale_reference" ,
"type" : "opinion_scale"
} ,
"number" : 1 ,
"type" : "number"
} ,
{
"choices" : {
"labels" : [
"New York" ,
"Tokyo"
]
} ,
"field" : {
"id" : "PNe8ZKBK8C2Q" ,
"ref" : "my_custom_picture_choice_reference" ,
"type" : "picture_choice"
} ,
"type" : "choices"
} ,
{
"date" : "2012-03-20T00:00:00Z" ,
"field" : {
"id" : "KoJxDM3c6x8h" ,
"ref" : "my_custom_date_reference" ,
"type" : "date"
} ,
"type" : "date"
} ,
{
"choice" : {
"label" : "A friend's experience in Sydney"
} ,
"field" : {
"id" : "ceIXxpbP3t2q" ,
"ref" : "my_custom_multiple_choice_reference" ,
"type" : "multiple_choice"
} ,
"type" : "choice"
} ,
{
"choices" : {
"labels" : [
"New York" ,
"Tokyo"
]
} ,
"field" : {
"id" : "abISxvbD5t1p" ,
"ref" : "my_custom_ranking_reference" ,
"type" : "ranking"
} ,
"type" : "choices"
} ,
{
"choice" : {
"label" : "Tokyo"
} ,
"field" : {
"id" : "k6TP9oLGgHjl" ,
"ref" : "my_custom_multiple_choice2_reference" ,
"type" : "multiple_choice"
} ,
"type" : "choice"
}
] ,
"calculated" : {
"score" : 2
} ,
"hidden" : { } ,
"landed_at" : "2017-09-14T22:33:59Z" ,
"landing_id" : "21085286190ffad1248d17c4135ee56f" ,
"metadata" : {
"browser" : "default" ,
"network_id" : "respondent_network_id" ,
"platform" : "other" ,
"referer" : "https://user_id.typeform.com/to/lR6F4j" ,
"user_agent" : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/603.3.8 (KHTML, like Gecko) Version/10.1.2 Safari/603.3.8"
} ,
"response_id" : "21085286190ffad1248d17c4135ee56f" ,
"submitted_at" : "2017-09-14T22:38:22Z" ,
"token" : "test21085286190ffad1248d17c4135ee56f" ,
"variables" : [
{
"key" : "score" ,
"number" : 2 ,
"type" : "number"
} ,
{
"key" : "name" ,
"text" : "typeform" ,
"type" : "text"
}
]
} ,
{
"answers" : [
{
"choice" : {
"label" : "New York"
} ,
"field" : {
"id" : "k6TP9oLGgHjl" ,
"ref" : "my_custom_multiple_choice2_reference" ,
"type" : "multiple_choice"
} ,
"type" : "choice"
} ,
{
"field" : {
"id" : "X4BgU2f1K6tG" ,
"ref" : "my_custom_file_upload_reference" ,
"type" : "file_upload"
} ,
"file_url" : "https://api.typeform.com/forms/lT9Z2j/responses/7f46165474d11ee5836777d85df2cdab/fields/X4BgU2f1K6tG/files/afd8258fd453-aerial_view_rural_city_latvia_valmiera_urban_district_48132860.jpg" ,
"type" : "file_url"
} ,
{
"choice" : {
"label" : "Other"
} ,
"field" : {
"id" : "ceIXxpbP3t2q" ,
"ref" : "my_custom_multiple_choice_reference" ,
"type" : "multiple_choice"
} ,
"type" : "choice"
} ,
{
"field" : {
"id" : "hVONkQcnSNRj" ,
"ref" : "my_custom_dropdown_reference" ,
"type" : "dropdown"
} ,
"text" : "Cost of living" ,
"type" : "text"
} ,
{
"field" : {
"id" : "JwWggjAKtOkA" ,
"ref" : "my_custom_short_text_reference" ,
"type" : "short_text"
} ,
"text" : "Sarah" ,
"type" : "text"
} ,
{
"boolean" : true ,
"field" : {
"id" : "RUqkXSeXBXSd" ,
"ref" : "my_custom_yes_no_reference" ,
"type" : "yes_no"
} ,
"type" : "boolean"
} ,
{
"field" : {
"id" : "Fep7sEoBsnvC" ,
"ref" : "my_custom_long_text_reference" ,
"type" : "long_text"
} ,
"text" : "I read a magazine article about travelling to Sydney" ,
"type" : "text"
} ,
{
"boolean" : true ,
"field" : {
"id" : "gFFf3xAkJKsr" ,
"ref" : "my_custom_legal_reference" ,
"type" : "legal"
} ,
"type" : "boolean"
} ,
{
"field" : {
"id" : "BFcpoPU5yJPM" ,
"ref" : "my_custom_short_text_reference" ,
"type" : "short_text"
} ,
"text" : "San Francisco" ,
"type" : "text"
} ,
{
"email" : "sarahbsmith@example.com" ,
"field" : {
"id" : "SMEUb7VJz92Q" ,
"ref" : "my_custom_email_reference" ,
"type" : "email"
} ,
"type" : "email"
} ,
{
"field" : {
"id" : "pn48RmPazVdM" ,
"ref" : "my_custom_number_reference" ,
"type" : "number"
} ,
"number" : 1 ,
"type" : "number"
} ,
{
"field" : {
"id" : "WOTdC00F8A3h" ,
"ref" : "my_custom_rating_reference" ,
"type" : "rating"
} ,
"number" : 3 ,
"type" : "number"
} ,
{
"field" : {
"id" : "Q7M2XAwY04dW" ,
"ref" : "my_custom_number2_reference" ,
"type" : "number"
} ,
"number" : 3 ,
"type" : "number"
} ,
{
"field" : {
"id" : "DlXFaesGBpoF" ,
"ref" : "my_custom_long_text_reference" ,
"type" : "long_text"
} ,
"text" : "It's a rural area. Very quiet. There are a lot of farms...farming is the major industry here." ,
"type" : "text"
} ,
{
"field" : {
"id" : "NRsxU591jIW9" ,
"ref" : "my_custom_opinion_scale_reference" ,
"type" : "opinion_scale"
} ,
"number" : 1 ,
"type" : "number"
} ,
{
"date" : "2016-05-13T00:00:00Z" ,
"field" : {
"id" : "KoJxDM3c6x8h" ,
"ref" : "my_custom_date_reference" ,
"type" : "date"
} ,
"type" : "date"
} ,
{
"choices" : {
"labels" : [
"London" ,
"New York"
]
} ,
"field" : {
"id" : "PNe8ZKBK8C2Q" ,
"ref" : "my_custom_picture_choice_reference" ,
"type" : "picture_choice"
} ,
"type" : "choices"
}
] ,
"calculated" : {
"score" : 4
} ,
"hidden" : { } ,
"landed_at" : "2017-09-14T22:27:38Z" ,
"landing_id" : "610fc266478b41e4927945e20fe54ad2" ,
"metadata" : {
"browser" : "default" ,
"network_id" : "respondent_network_id" ,
"platform" : "other" ,
"referer" : "https://user_id.typeform.com/to/lR6F4j" ,
"user_agent" : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/59.0.3071.115 Safari/537.36"
} ,
"submitted_at" : "2017-09-14T22:33:56Z" ,
"token" : "test610fc266478b41e4927945e20fe54ad2"
} ,
{
"answers" : [
{
"boolean" : false ,
"field" : {
"id" : "RUqkXSeXBXSd" ,
"ref" : "my_custom_yes_no_reference" ,
"type" : "yes_no"
} ,
"type" : "boolean"
} ,
{
"boolean" : true ,
"field" : {
"id" : "gFFf3xAkJKsr" ,
"ref" : "my_custom_legal_reference" ,
"type" : "legal"
} ,
"type" : "boolean"
} ,
{
"field" : {
"id" : "JwWggjAKtOkA" ,
"ref" : "my_custom_short_text_reference" ,
"type" : "short_text"
} ,
"text" : "Paolo" ,
"type" : "text"
} ,
{
"field" : {
"id" : "pn48RmPazVdM" ,
"ref" : "my_custom_number_reference" ,
"type" : "number"
} ,
"number" : 5 ,
"type" : "number"
} ,
{
"field" : {
"id" : "Q7M2XAwY04dW" ,
"ref" : "my_custom_number2_reference" ,
"type" : "number"
} ,
"number" : 5 ,
"type" : "number"
} ,
{
"choices" : {
"labels" : [
"Barcelona" ,
"Sydney"
]
} ,
"field" : {
"id" : "PNe8ZKBK8C2Q" ,
"ref" : "my_custom_picture_choice_reference" ,
"type" : "picture_choice"
} ,
"type" : "choices"
} ,
{
"field" : {
"id" : "WOTdC00F8A3h" ,
"ref" : "my_custom_rating_reference" ,
"type" : "rating"
} ,
"number" : 5 ,
"type" : "number"
} ,
{
"field" : {
"id" : "DlXFaesGBpoF" ,
"ref" : "my_custom_long_text_reference" ,
"type" : "long_text"
} ,
"text" : "I live in a medium-sized European city. It's not too crowded, and the people are nice. I like the weather. It's also easy to travel to many beautiful and interesting vacation destinations from where I live." ,
"type" : "text"
} ,
{
"field" : {
"id" : "NRsxU591jIW9" ,
"ref" : "my_custom_opinion_scale_reference" ,
"type" : "opinion_scale"
} ,
"number" : 4 ,
"type" : "number"
} ,
{
"date" : "1999-08-01T00:00:00Z" ,
"field" : {
"id" : "KoJxDM3c6x8h" ,
"ref" : "my_custom_date_reference" ,
"type" : "date"
} ,
"type" : "date"
} ,
{
"choice" : {
"label" : "Barcelona"
} ,
"field" : {
"id" : "k6TP9oLGgHjl" ,
"ref" : "my_custom_multiple_choice_reference" ,
"type" : "multiple_choice"
} ,
"type" : "choice"
}
] ,
"calculated" : {
"score" : 10
} ,
"hidden" : { } ,
"landed_at" : "2017-09-14T22:24:49Z" ,
"landing_id" : "9ba5db11ec6c63d22f08aade805bd363" ,
"metadata" : {
"browser" : "default" ,
"network_id" : "respondent_network_id" ,
"platform" : "other" ,
"referer" : "https://user_id.typeform.com/to/lR6F4j" ,
"user_agent" : "Mozilla/5.0 (iPhone; CPU iPhone OS 10_2_1 like Mac OS X) AppleWebKit/602.4.6 (KHTML, like Gecko) Version/10.0 Mobile/14D27 Safari/602.1"
} ,
"submitted_at" : "2017-09-14T22:27:34Z" ,
"token" : "test9ba5db11ec6c63d22f08aade805bd363"
} ,
{
"answers" : [ ] ,
"calculated" : {
"score" : 0
} ,
"hidden" : { } ,
"landed_at" : "2017-09-15T09:09:30Z" ,
"landing_id" : "5fcb3f9c162e1fcdaadff4405b741080" ,
"metadata" : {
"browser" : "default" ,
"network_id" : "respondent_network_id" ,
"platform" : "other" ,
"referer" : "https://user_id.typeform.com/to/lR6F4j" ,
"user_agent" : "Mozilla/5.0 (Linux; Android 4.1.2; GT-N7000 Build/JZO54K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.91 Mobile Safari/537.36"
} ,
"submitted_at" : "0001-01-01T00:00:00Z" ,
"token" : "test5fcb3f9c162e1fcdaadff4405b741080"
}
] ,
"page_count" : 1 ,
"total_items" : 4
}
Copy
511 lines

Status
400 Bad request Schema

code string
A developer-readable snake_case key, indicating some idea of what type of error occurred.

description string
A developer-readable description of the error, expanding on the terse code.

details Path 3 array of object
An optional object containing more detailed info regarding which field the error occurred in.

code string
A developer-readable snake_case key, indicating some idea of what type of error occurred.

description string
A developer-readable description about the field-level error.

field string
Which field the error occurred. This could refer to a field in the request body, request header, or query parameter.

help string
A URL linking to help content, to aid the client developer in resolving the error. This value should be provided whenever available.

in string
Valid values: header body query
The type of field that caused the error.

help string
A URL linking to help content, to aid the client developer in resolving the error. This value should be provided whenever available.

Status
401 Unauthorized Schema

code string
A developer-readable snake_case key, indicating some idea of what type of error occurred.

description string
A developer-readable description of the error, expanding on the terse code.

details Path 3 array of object
An optional object containing more detailed info regarding which field the error occurred in.

code string
A developer-readable snake_case key, indicating some idea of what type of error occurred.

description string
A developer-readable description about the field-level error.

field string
Which field the error occurred. This could refer to a field in the request body, request header, or query parameter.

help string
A URL linking to help content, to aid the client developer in resolving the error. This value should be provided whenever available.

in string
Valid values: header body query
The type of field that caused the error.

help string
A URL linking to help content, to aid the client developer in resolving the error. This value should be provided whenever available.

Status
405 Method not allowed Schema

code string
A developer-readable snake_case key, indicating some idea of what type of error occurred.

description string
A developer-readable description of the error, expanding on the terse code.

details Path 3 array of object
An optional object containing more detailed info regarding which field the error occurred in.

code string
A developer-readable snake_case key, indicating some idea of what type of error occurred.

description string
A developer-readable description about the field-level error.

field string
Which field the error occurred. This could refer to a field in the request body, request header, or query parameter.

help string
A URL linking to help content, to aid the client developer in resolving the error. This value should be provided whenever available.

in string
Valid values: header body query
The type of field that caused the error.

help string
A URL linking to help content, to aid the client developer in resolving the error. This value should be provided whenever available.

Status
500 Internal server error Schema

code string
A developer-readable snake_case key, indicating some idea of what type of error occurred.

description string
A developer-readable description of the error, expanding on the terse code.

details Path 3 array of object
An optional object containing more detailed info regarding which field the error occurred in.

code string
A developer-readable snake_case key, indicating some idea of what type of error occurred.

description string
A developer-readable description about the field-level error.

field string
Which field the error occurred. This could refer to a field in the request body, request header, or query parameter.

help string
A URL linking to help content, to aid the client developer in resolving the error. This value should be provided whenever available.

in string
Valid values: header body query
The type of field that caused the error.

help string
A URL linking to help content, to aid the client developer in resolving the error. This value should be provided whenever available.

