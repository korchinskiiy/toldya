# Terms of Service

**Effective date:** 15 May 2026
**Protocol version:** Toldya v1.x

> **This document is not legal advice.** Prediction market legality varies
> significantly by jurisdiction. Consult counsel before operating an instance
> or participating with real assets.

---

## 1. Acceptance

By accessing, using, or deploying any component of the Toldya protocol ("the
Protocol") — including the smart contracts, oracle service, frontend, or mobile
app — you ("User", "Operator") agree to these Terms of Service ("Terms"). If
you do not agree, do not use the Protocol.

---

## 2. Who may use the Protocol

### 2.1 Age and capacity

You must be at least 18 years old (or the legal gambling/wagering age in your
jurisdiction, if higher) and have full legal capacity to enter into binding
agreements.

### 2.2 Jurisdictional restrictions

**Prediction market participation is prohibited or restricted in many
jurisdictions.** The Protocol may not be used by:

- Persons or entities located in, citizens of, or residents of any jurisdiction
  where prediction markets, wagering contracts, or crypto-asset services of
  this type are prohibited or require a licence you have not obtained. This
  includes, without limitation, the United States (where CFTC-unregistered
  event contracts are generally prohibited), most Canadian provinces, and other
  jurisdictions with gambling or financial-instrument restrictions on prediction
  markets.
- Entities or individuals on the OFAC SDN List, EU consolidated sanctions list,
  UK HM Treasury consolidated list, or equivalent national lists.
- Any person acting in violation of applicable gambling, wagering, or
  financial-services law.

By using the Protocol you represent and warrant that none of the above
applies to you, and that your use is lawful in your jurisdiction.

### 2.3 Not gambling or financial advice

Toldya markets are informal, escrow-based P2P bets. They are **not**:

- Regulated gambling products.
- CFTC-registered event contracts or swaps.
- Investment products or securities.
- Financial advice of any kind.

Whether participation constitutes gambling, wagering, or a financial
instrument under your local law is a question you must resolve with local
counsel before participating.

---

## 3. What the Protocol is (and is not)

### 3.1 Open-source infrastructure

The Toldya maintainers:

- Do not operate any production instance.
- Do not hold or custody user stakes (the `ToldyaHub` smart contract does).
- Do not guarantee the accuracy of AI oracle verdicts.
- Do not act as a gambling operator, bookmaker, exchange, or financial
  institution.

### 3.2 AI oracle

Market resolution is performed by an AI oracle service that calls an LLM
(Claude via Anthropic API) to evaluate the question and resolution criteria.

**The oracle may produce incorrect verdicts.** There is no on-chain dispute
path in v1. If the oracle resolves incorrectly, the only remedy is the hub
owner replacing the oracle address. Do not create or participate in markets
with stakes material enough that an incorrect verdict would cause significant
harm.

### 3.3 No early withdrawal or position trading

Once you stake, funds are locked until resolution or voiding. There is no
mechanism to exit your position early or trade it to another party.

---

## 4. User responsibilities

You are solely responsible for:

1. **Legality.** Confirming that creating and participating in prediction
   markets is lawful in your jurisdiction.
2. **Tax.** Winnings may be taxable income or gambling gains in your
   jurisdiction. You are responsible for all tax reporting and payment.
3. **Key security.** The wallet private key you use to stake is solely your
   responsibility. Lost keys mean lost funds.
4. **Market quality.** If you create a market, you are responsible for writing
   clear, unambiguous resolution criteria that an AI oracle can evaluate
   objectively.
5. **Oracle selection.** If you operate an instance, you are responsible for
   operating a reliable oracle and replacing it if it malfunctions.

---

## 5. Prohibited uses

The Protocol must not be used to:

- Create or participate in markets that involve illegal subject matter (e.g.,
  outcomes of criminal activity, CSAM, sanctioned entities).
- Manipulate the AI oracle by encoding adversarial prompts in question or
  criteria fields.
- Operate a public-facing wagering service without required gambling licences.
- Facilitate money laundering or terrorist financing.

---

## 6. Risks

You acknowledge the material risks summarised below. The full catalogue is in
[`docs/risk-disclosure.md`](docs/risk-disclosure.md).

| Risk | Summary |
|---|---|
| Smart-contract risk | Bugs may cause permanent fund loss |
| AI oracle risk | Incorrect AI verdict locks losing-side funds |
| No dispute path | v1 has no on-chain recourse if oracle errs |
| Stake lockup | Funds locked until resolution; no early exit |
| Regulatory risk | Prediction market legality varies; may become illegal |
| Token volatility | TAIKO price exposure while stakes are locked |

---

## 7. Intellectual property

Released under [MIT License](LICENSE). No trademark rights granted. Forks
must not impersonate the upstream project.

---

## 8. Disclaimers

**THE PROTOCOL IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND.** The
maintainers do not warrant that AI oracle verdicts are correct, that funds
will be recoverable in all circumstances, or that the Protocol is lawful in
your jurisdiction.

---

## 9. Limitation of liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE TOLDYA MAINTAINERS AND TAIKO LABS
ARE NOT LIABLE FOR ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL, OR PUNITIVE
DAMAGES, INCLUDING LOSS OF STAKED ASSETS, ARISING FROM YOUR USE OF THE
PROTOCOL. AGGREGATE DIRECT LIABILITY IS CAPPED AT USD 100.

---

## 10. Indemnification

You agree to indemnify and hold harmless the Toldya maintainers and Taiko Labs
from any claims arising from: (a) your use of the Protocol in violation of
law; (b) markets you create or participate in; (c) your operation of an
instance without required licences.

---

## 11. Governing law and disputes

These Terms are governed by the laws of the Cayman Islands. Disputes are
resolved by binding arbitration under UNCITRAL rules, seat Singapore, single
arbitrator, proceedings in English. Class arbitration is waived.

---

## 12. Amendments

Changes announced via tagged release. Continued use after the effective date
constitutes acceptance.

---

*Questions: open a GitHub Discussion at the repository.*
