# Security Policy

## Status

Toldya is **pre-production software**. Smart contracts have not been audited by
an independent security firm. Do not stake amounts you cannot afford to lose.

## Reporting a vulnerability

Report suspected security issues **privately**. Do not open a public issue.

1. **GitHub private vulnerability advisory** — use the "Security" tab on this
   repository to open a private advisory.

2. **Encrypted email** — `security@taiko.xyz`.

## What to include

- Affected component (`contracts/`, `oracle/`, `frontend/`, `mobile/`).
- Steps to reproduce.
- Expected vs. observed behaviour.
- Severity estimate and reasoning.
- Whether you would like credit in release notes.

## Response SLA

| Phase | Target |
|---|---|
| Acknowledgement | 24 hours |
| Triage (severity + owner + ETA) | 72 hours |
| Patch: critical | 7 days |
| Patch: high | 30 days |
| Patch: medium | 90 days |
| Patch: low | Next release |

## Scope

In scope:

- `ToldyaHub.sol` smart contract once deployed.
- Oracle service signing-key handling and AI prompt handling.
- Frontend/mobile wallet and transaction signing.

Out of scope:

- Documentation typos.
- Issues in third-party providers (Anthropic API, RPC nodes) — report to them.
- Incorrect AI verdicts (a product limitation, not a security vulnerability).

## Oracle manipulation reports

Reports of successful AI-oracle manipulation (crafted market questions/criteria
that reliably produce incorrect verdicts) are treated as **high severity** and
should be reported via the private advisory channel.

## Disclosure

Default embargo: **90 days**. Public release via GitHub Security Advisory and
tagged version. Reporters credited in release notes with consent.

## Bounty

No paid bounty programme at v1. Critical reports may be retroactively rewarded
post-launch subject to board approval.
