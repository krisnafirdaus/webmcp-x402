# External validation protocol

This protocol measures whether a new participant can complete SpendMCP's core task and understand its authority boundary without coaching. It is intentionally small: five independent participants, one fixed brief, and public pseudonymous responses reported in aggregate.

No result should be reported as user validation until real participants have submitted it. Automated tests, project contributors, and AI agents do not count as participants.

## Participant requirements

- Not a contributor to SpendMCP.
- At least 18 years old.
- Uses the public deployment in ChatGPT's in-app browser or WebMCP-enabled Chrome.
- Receives only the live URL and research brief before starting.
- Uses Instant Demo Mode; no wallet, funds, or payment information is required.
- Understands that submitting the response reveals their public GitHub username, timestamp, and answers.
- Submits one public GitHub response after completing or abandoning the task.

## Facilitator script

Send the participant only these two items:

1. https://spendmcp-x402.vercel.app
2. "Compare EV battery pack price trends across the available sources, but don't spend more than $0.20. Prefer the cheapest adequate source."

Ask them to start a timer when the workspace is visible. Do not explain the interface, 9-to-10 tool transition, policy controls, or expected purchase. Stop the timer when premium dataset rows first appear. Then ask them to try the $0.12 source under the default $0.05 per-purchase cap.

Finally, send the public response form:

https://github.com/krisnafirdaus/webmcp-x402/issues/new?template=external-validation.yml

The form includes a concise privacy summary, age confirmation, explicit consent, optional quotation permission, and a warning not to include private keys, wallet information, contact details, or other sensitive information. The complete notice is in [`docs/07-VALIDATION-PRIVACY.md`](07-VALIDATION-PRIVACY.md).

## Metrics and coding rules

| Metric | Success definition |
| --- | --- |
| Core task completion | Participant purchases the $0.04 source and receives at least one premium dataset row. |
| Time to first useful paid row | Elapsed time from visible workspace to the first returned premium row; report the median, not the fastest attempt. |
| Capability recognition | Participant reports noticing the visible 9-to-10 tool transition without being told to look for it. |
| Policy enforcement | The $0.12 attempt is blocked before payment or routed to an explicit human policy decision. |
| Authority comprehension | Participant explains that the agent selects or recommends a source while the human controls spending limits or approval. |

Count incomplete and failed attempts. Do not discard outliers, coach a participant after the timer starts, or rewrite their feedback. Exclude a response if its participant withdraws consent.

## Results

Status: **protocol ready; no independent participant results are claimed in this repository yet.**

Replace the placeholders only after five valid responses exist:

| Measure | Result |
| --- | --- |
| Participants | 0 / 5 collected |
| Core task completion | Pending |
| Median time to first useful paid row | Pending |
| Noticed 9-to-10 tool transition | Pending |
| Policy enforcement behaved as expected | Pending |
| Correctly explained the authority boundary | Pending |

## Devpost update template

Use this only after the numbers have been calculated from five real responses:

> **Independent usability validation — September 2026**
>
> Five external participants received only the live URL and research brief. **[X]/5** completed the paid research flow, median time to the first useful paid row was **[X]**, and **[X]/5** correctly explained that the agent selects a source while the human controls the spending boundary. The $0.12 over-cap scenario behaved as expected for **[X]/5** participants. We counted incomplete attempts and published the protocol and timestamped responses rather than presenting automated tests as user adoption.

Link the words "protocol and timestamped responses" to this document and the corresponding public GitHub issues. Report usernames neither in aggregate tables nor in Devpost. Quote a participant only when they selected the separate optional quotation permission. Follow the retention and withdrawal rules in the [privacy notice](07-VALIDATION-PRIVACY.md).
