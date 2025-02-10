name: Bug Report
description: Create a bug report
#title: ""
labels: ["bug"]
#assignees:
#  -
body:
  - type: markdown
    attributes:
      value: |
        Thanks for taking the time to fill out this bug report.
        Please check the existing issues before raising a bug.
  - type: textarea
    attributes:
      label: Summary
      description: A clear and specific description of what the bug is.
    validations:
      required: true
  - type: textarea
    attributes:
      label: Steps to reproduce the bug
      placeholder: |
        1. Go to '...'
        2. Click on '...'
        3. Scroll down to '...'
    validations:
      required: false
  - type: textarea
    attributes:
      label: Actual Result
      description: What is the reproducible outcome?
      placeholder: provide your TX JSON if its related to transactions
    validations:
      required: true
  - type: textarea
    attributes:
      label: Expected Result
      description: A clear and concise description of what you expected to happen.
      placeholder: No errors observed.
    validations:
      required: true
  - type: input
    attributes:
      label: SDK version
      description: Provide release or Git revision are you using here
      placeholder: "0.2.0"
    validations:
      required: true
  - type: checkboxes
    attributes:
      label: Environment type
      description: You may select more than one.
      options:
        - label: Node.js
        - label: Browser
        - label: Browser Extension
        - label: Other
  - type: textarea
    attributes:
      label: Environment details
      description: Provide details and versions of your environemnt
      placeholder: |
        Browser: Version 1.36.111 Chromium: 99.0.4844.51
        Node.js: v14.15.0