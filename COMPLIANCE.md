# Compliance posture

Toldya provides escrow-based P2P prediction market infrastructure. It does not
operate markets, custody funds directly (the smart contract does), or hold
gambling or financial-services licences. **Toldya provides the rails; operators
and users carry the compliance burden for their jurisdiction.**

This document is informational, not legal advice. Operators must consult
counsel — particularly gambling and financial-services counsel — before
deploying Toldya for public use.

**Related legal documents:**

| Document | Audience | Purpose |
|---|---|---|
| [`TERMS.md`](TERMS.md) | All users & operators | Terms of Service — use restrictions, liability |
| [`docs/risk-disclosure.md`](docs/risk-disclosure.md) | All users | Risk catalogue |
| [`docs/privacy-policy.md`](docs/privacy-policy.md) | All users & operators | Privacy Policy (GDPR/CCPA) |
| [`SECURITY.md`](SECURITY.md) | Security researchers | Vulnerability reporting |

---

## 1. Gambling and wagering law

Toldya markets are YES/NO escrow bets. In most jurisdictions this constitutes
**gambling or wagering**, which is subject to licensing and regulation.

Indicative posture per jurisdiction (NOT legal advice):

| Jurisdiction | Likely regime | Notes |
|---|---|---|
| United States | CFTC event-contract rules; state gambling law | CFTC-unregistered prediction markets are generally prohibited for US persons. Most state gambling laws also apply. |
| United Kingdom | Gambling Act 2005; UKGC licence | Remote gambling operator licence required for B2C services. |
| European Union | Varies by member state | Many states require gambling licences; some permit social/informal betting with restrictions. |
| Australia | Interactive Gambling Act 2001 | Online wagering services to Australians require an Australian licence. |

**Each operator must seek gambling or financial-services legal advice before
accepting real-value stakes from third parties.**

---

## 2. Financial instruments

In some jurisdictions, prediction markets may be classified as financial
instruments, swaps, or derivatives. Operators serving sophisticated users or
offering high-stakes markets should analyse whether financial-instrument
regulation (MiFID II, CFTC swap rules, etc.) applies.

---

## 3. AML and sanctions

The Protocol does not screen participants. Operators must:

- Integrate OFAC SDN and applicable sanctions list screening at the point of
  user onboarding.
- Implement AML / KYC controls if required by local gambling or financial law.
- Maintain transaction records for audit purposes.

---

## 4. AI oracle compliance

The oracle sends market question and criteria text to an LLM provider
(Anthropic Claude by default). If market content includes personal data:

- A data-processing agreement (DPA) with the LLM provider is required under
  GDPR.
- Users must be informed that market content is sent to a third-party AI.

Operators should include this disclosure in their privacy policy.

---

## 5. Tax reporting

Operators may be required to report user winnings to tax authorities (e.g.,
US Form W-2G for gambling winnings, EU DAC8). The Protocol does not generate
tax documents. Operators must implement their own reporting pipeline using
on-chain data.

---

## 6. Consumer protection

Operators serving non-professional users should implement:

- Responsible-gambling disclosures and links to support resources.
- Stake limits appropriate to the user base.
- Clear display of AI oracle limitations and the absence of a dispute path.

---

## Operator checklist (pre-deployment)

- [ ] Gambling / financial-services counsel engaged.
- [ ] Required gambling or VASP licences obtained.
- [ ] Sanctions screening implemented at user onboarding.
- [ ] KYC/AML controls implemented if required.
- [ ] User-facing terms of service published (references or adopts `TERMS.md`).
- [ ] Risk disclosure published (references or adopts `docs/risk-disclosure.md`).
- [ ] Privacy policy published (references or adopts `docs/privacy-policy.md`).
- [ ] LLM provider DPA in place.
- [ ] Tax reporting pipeline implemented and tested.
- [ ] Responsible-gambling disclosures shown to users.
- [ ] Smart-contract audit completed before public mainnet launch.
