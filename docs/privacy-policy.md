# Privacy Policy

**Effective date:** 15 May 2026
**Protocol version:** Toldya v1.x

> This policy covers the Toldya open-source protocol. If you use a
> third-party-operated instance, that operator's privacy policy applies to
> their data collection.

---

## 1. Who this policy covers

- **Contributors** interacting with the GitHub repository.
- **Developers** running the contracts, oracle, frontend, or mobile app locally.
- **Users** of any official Toldya documentation or reference deployment.

---

## 2. On-chain data

Transactions submitted to the Taiko blockchain are **permanently public**:

- Wallet addresses of market creators and stakers.
- Stake amounts and token balances per market.
- Resolution outcomes.

This data is immutable. Anyone can observe and analyse your on-chain activity.
The stealth-address features present in pico are **not** a feature of Toldya;
your staking address is directly visible on-chain.

---

## 3. Data held locally when running the Protocol

### Oracle service

| Data | Storage | Sent externally |
|---|---|---|
| Market question + criteria | Sent to Anthropic Claude API | Anthropic (see their privacy policy) |
| Oracle signing key | Local `.env` | Never |
| Event subscription state | In-memory | Not sent |

### Frontend / mobile app

The frontend and mobile app interact with the Taiko RPC and the `ToldyaHub`
contract. No user data is collected by the Toldya maintainers through these
components.

---

## 4. AI oracle and third-party LLM

When a market reaches resolution, the oracle service sends the **market
question and resolution criteria** to the configured LLM provider (Anthropic
Claude by default). Anthropic's privacy policy governs how they handle this
data.

**Do not create markets whose question or criteria contain personally
identifiable information, private details about real individuals, or
confidential information**, as this data will be sent to the LLM provider.

---

## 5. GitHub repository data

Governed by [GitHub's Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

---

## 6. Operator data practices

Third-party hub operators may collect:

- IP addresses of users accessing the frontend or mobile app.
- Wallet addresses and staking activity.
- KYC/identity data if required by local gambling or financial law.

Operators who process personal data are independent data controllers under
GDPR and equivalent laws, and must publish their own privacy policy, establish
a lawful basis for processing, and support data subject rights.

---

## 7. Data subject rights

For data held by the Toldya maintainers (GitHub contributor data only):

| Right | How to exercise |
|---|---|
| Access | Contact via GitHub Discussion |
| Erasure | Request deletion (subject to open-source archival limitations) |

On-chain data cannot be erased.

---

## 8. Children's privacy

The Protocol is not directed at persons under 18 (or the lawful wagering age
in the user's jurisdiction, if higher).

---

## 9. Changes

Updated with each major release; changes recorded in git history.

---

## 10. Contact

- GitHub Discussion at the repository.
- Security-sensitive: `security@taiko.xyz`.
