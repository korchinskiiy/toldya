# Risk Disclosure

**Effective date:** 15 May 2026
**Protocol version:** Toldya v1.x

> Read this document in full before staking any assets in a Toldya market.
> This is not an exhaustive list of risks. Nothing here is legal or financial
> advice.

---

## 1. Smart-contract risk

The `ToldyaHub` contract governs all stake custody. It has **not** been
audited by an independent security firm prior to v1. Potential consequences:

- Bugs in the stake accounting, claim calculation, or resolution logic could
  cause incorrect fund distribution or permanent loss.
- Reentrancy or integer-overflow vulnerabilities could allow an attacker to
  drain the contract.
- EVM compatibility changes on Taiko could alter expected behaviour.

Keep individual market stakes small during the pre-audit period.

---

## 2. AI oracle risk

Market resolution is performed by an AI oracle (Claude via Anthropic API).

### 2.1 Incorrect verdict

The oracle may produce an incorrect `RESULT:YES` or `RESULT:NO` verdict due to
LLM hallucination, ambiguous resolution criteria, or insufficient evidence. An
incorrect verdict results in losing-side participants not recovering their
stakes.

### 2.2 No on-chain dispute path

Toldya v1 has **no on-chain dispute or appeal mechanism**. If the AI oracle
resolves incorrectly, the only remedy is the hub owner replacing the oracle
address — which has no effect on already-settled markets. Stakes settled by an
incorrect verdict are not recoverable at the protocol level.

### 2.3 Oracle manipulation

Adversarially crafted question or criteria text may manipulate the LLM into
producing a biased verdict. Do not participate in markets where the creator
may have an incentive to write manipulative criteria.

### 2.4 Oracle unavailability

If the oracle service is offline at resolution time, the `ResolutionRequested`
event will go unprocessed. Markets remain in an unresolved state until the
oracle recovers or the hub operator manually intervenes.

---

## 3. Stake lockup risk

**All stakes are locked from deposit until resolution or voiding.** There is
no early withdrawal mechanism. Duration risk includes:

- Market deadline far in the future (weeks or months of locked TAIKO).
- Oracle offline delay extending the post-deadline lockup.
- Hub operator going offline before triggering or processing resolution.

---

## 4. No-contest voidance risk

If only one side (YES or NO) has stakes at the deadline, the market is
voided and all stakes refunded. If you are the sole stakeholder on one side,
your funds are returned but you receive no winnings regardless of the correct
outcome.

---

## 5. TAIKO token volatility risk

Stakes are denominated in TAIKO. TAIKO's USD value may change significantly
between the time you stake and the time you claim. There is no hedging
mechanism within the Protocol.

---

## 6. Regulatory risk

Prediction markets are **heavily regulated or prohibited in many
jurisdictions**, including the United States (CFTC oversight), most Canadian
provinces, and others. Using the Protocol in a jurisdiction where it is
restricted may expose you to civil or criminal liability.

The regulatory landscape for crypto-asset-based prediction markets is
evolving. Your use may become unlawful after you stake but before a market
resolves.

---

## 7. Tax risk

Winnings from prediction markets may constitute taxable income, gambling
winnings, or capital gains in your jurisdiction. The Protocol does not
generate tax documents. You are solely responsible for all tax obligations.

---

## 8. Hub operator risk

If you are a participant in a third-party-operated hub:

- The operator may go offline, preventing resolution triggering.
- The operator may be subject to regulatory action that results in service
  suspension.
- The operator controls the oracle address and may replace or decommission
  it.

---

## 9. Key management risk

The wallet key you use to stake is the sole authority over your stake and
claims. There is no key recovery mechanism. Loss of your private key means
permanent loss of ability to claim winnings.

---

## 10. Your acknowledgement

By using the Protocol you confirm that you:

1. Have read and understood this Risk Disclosure in full.
2. Have read and agreed to the [Terms of Service](../TERMS.md).
3. Understand that AI oracle verdicts may be incorrect and are not disputable
   on-chain.
4. Understand that stakes are locked and non-refundable except by voidance.
5. Have confirmed that your use is lawful in your jurisdiction.
6. Are not relying on the Toldya maintainers for financial, legal, or tax advice.
