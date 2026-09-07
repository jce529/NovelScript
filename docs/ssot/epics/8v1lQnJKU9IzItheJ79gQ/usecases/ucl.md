---
id: "doc:JAcmLTnPJ7e-gwcszXTJC"
name: "Social Sign-In Use Case List"
type: "ucl"
scope: "epic"
scopeId: "8v1lQnJKU9IzItheJ79gQ"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"use-case-social-sign-in-google-kakao","title":"Visitor signs in with Google or Kakao","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:8769f48b92cad45f"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Social Sign-In Use Case List

Routing index for the proven social sign-in use case in this epic.

## Use Case Index

| Use case | Actor | Goal | Linked specs |
| --- | --- | --- | --- |
| use-case-social-sign-in-google-kakao | visitor | Sign in with a supported social account to begin an authenticated session | 1 doc |

## use-case-social-sign-in-google-kakao — Visitor signs in with Google or Kakao

A visitor starts social sign-in from the login screen using one of the two supported providers.

Actor: visitor

Goal: Sign in with a supported social account to begin an authenticated session

Claim: A visitor can start sign-in from the login screen by choosing Google or Kakao, and the flow redirects to the callback after the provider step.

Cautions:
- Only Google and Kakao are shown as supported sign-in choices in the provided source.
- The provided source shows OAuth initiation and callback redirection, but it does not prove callback completion behavior.
- No loading, empty, or error UI is shown in the provided source.
