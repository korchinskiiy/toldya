# Design: Convert `ToldyaHub` to a UUPS-Upgradeable Contract

**Date:** 2026-05-14
**Status:** Approved for implementation

## Goal

Replace the current direct (non-upgradeable) deployment of `ToldyaHub` with a UUPS proxy so the implementation can be upgraded post-deployment without forcing users to migrate to a new hub address. Add a documented `contracts/.env.example` covering both first deployment and upgrades.

## Motivation

The current contract is deployed with `new ToldyaHub(...)` and uses an `immutable` `stakeToken` ([contracts/src/ToldyaHub.sol:87](../../../contracts/src/ToldyaHub.sol#L87), [contracts/script/Deploy.s.sol:35](../../../contracts/script/Deploy.s.sol#L35)) — meaning any bug requires deploying a new hub and abandoning the old one. Existing markets on the old hub stay frozen at the latest state until the `RESOLUTION_TIMEOUT = 14 days` escape hatch lets stakers void and refund. That's a usable last resort but not a viable upgrade story for production.

UUPS gives us in-place upgrades behind a stable proxy address, with upgrade authority gated by `onlyOwner` on the implementation itself (i.e. proxy storage holds the owner; calling `upgradeToAndCall` from a non-owner reverts).

## Approach decision

| Option | Decision |
|---|---|
| **A. UUPS + `openzeppelin-foundry-upgrades` plugin** | **Chosen.** Automatic storage-layout validation on every upgrade. Small tooling cost. |
| B. Manual UUPS, no plugin | Rejected. Storage-layout discipline becomes convention-only; one sloppy reorder bricks storage. |
| C. Transparent proxy | Rejected. Heavier proxy bytecode, separate `ProxyAdmin`, classic admin-caller selector clash. |
| D. Stay non-upgradeable | Rejected per user direction. |

## Contract changes — `contracts/src/ToldyaHub.sol`

### Inheritance swap

All from `@openzeppelin/contracts-upgradeable`:

- `Ownable` → `OwnableUpgradeable`
- `Pausable` → `PausableUpgradeable`
- `ReentrancyGuard` → `ReentrancyGuardUpgradeable`
- Add `Initializable`, `UUPSUpgradeable`

### `stakeToken` loses `immutable`

`IERC20 public immutable stakeToken` → `IERC20 public stakeToken`. Set once in `initialize`, never exposed via a setter. Behaviorally identical to immutable from a caller's standpoint, but storage-compatible with proxies (immutables live in bytecode, not storage, and would not survive an upgrade).

### Constructor → initializer

```solidity
constructor() {
    _disableInitializers();
}

function initialize(
    IERC20 _stakeToken,
    address _oracle,
    address _treasury,
    address _owner
) external initializer {
    __Ownable_init(_owner);
    __Pausable_init();
    __ReentrancyGuard_init();
    __UUPSUpgradeable_init();
    stakeToken = _stakeToken;
    oracle = IOracle(_oracle);
    treasury = _treasury;
}

function _authorizeUpgrade(address) internal override onlyOwner {}
```

`_disableInitializers()` in the empty constructor is non-negotiable — without it, anyone can call `initialize` on the implementation contract directly and seize ownership.

`_owner` becomes an explicit `initialize` parameter (replaces `Ownable(msg.sender)`); set by the deploy script to whoever should hold upgrade authority.

### Storage gap

Add `uint256[50] private __gap;` at the bottom of the contract for future state. Per-`Market` struct fields can be safely appended (struct in `mapping` — slot is computed from key + offset, so adding fields at the end of the struct just consumes higher slots), so no per-struct gap is needed; this is documented inline.

### Storage discipline comment block

Above the state vars, add:

```
// STORAGE LAYOUT — DO NOT REORDER.
// Append-only. To add a field, consume a slot from `__gap` at the bottom.
// Reordering or removing any field breaks deployed proxies.
```

## Deploy script — `contracts/script/Deploy.s.sol`

Replace `new ToldyaHub(token, oracle, treasury)` with the foundry-upgrades plugin call:

```solidity
import {Upgrades} from "openzeppelin-foundry-upgrades/Upgrades.sol";

address proxy = Upgrades.deployUUPSProxy(
    "ToldyaHub.sol",
    abi.encodeCall(
        ToldyaHub.initialize,
        (token, oracle, treasury, deployer)
    )
);
```

The plugin handles: implementation deploy, `ERC1967Proxy` deploy, atomic `initialize` call (no window of uninitialized proxy), and storage-layout snapshot save for future upgrade diffs.

Log both the proxy and implementation addresses; only the proxy matters for users and external integrations.

## Upgrade script — new `contracts/script/Upgrade.s.sol`

```solidity
Upgrades.upgradeProxy(
    vm.envAddress("HUB_PROXY_ADDRESS"),
    "ToldyaHubV2.sol",
    ""
);
```

The plugin validates that the new implementation is storage-compatible with the previously snapshotted layout before broadcasting. Must be run by the proxy owner (signed with `DEPLOYER_PK`).

## Test refactor — `contracts/test/ToldyaHub.t.sol`

**Surgical change:** introduce a `_deployHub()` helper in `setUp` that returns a `ToldyaHub` cast of the proxy address:

```solidity
function _deployHub(IERC20 token_, address oracle_, address treasury_, address owner_)
    internal returns (ToldyaHub)
{
    address proxy = Upgrades.deployUUPSProxy(
        "ToldyaHub.sol",
        abi.encodeCall(ToldyaHub.initialize, (token_, oracle_, treasury_, owner_))
    );
    return ToldyaHub(proxy);
}
```

All existing test bodies stay byte-identical — proxies are transparent to callers, so every pinning test we just landed continues to pass without modification.

### New tests

- `test_initialize_revertsIfCalledTwice` — second call reverts with `InvalidInitialization`.
- `test_initialize_revertsOnImplementationDirectly` — proves `_disableInitializers()` works; calling `initialize` on the impl address (not the proxy) reverts.
- `test_authorizeUpgrade_onlyOwner` — non-owner caller of `upgradeToAndCall` reverts.
- `test_upgradeToAndCall_succeedsForOwner` — owner can upgrade to a new impl; proxy now delegates to it.
- `test_upgradeToAndCall_preservesState` — create a market, stake on both sides, upgrade to an identical impl, then verify `markets`, `yesStake`, `noStake`, `yesPool`, `noPool`, and stakers list all read back unchanged.

## Tooling additions

- Install `openzeppelin-contracts-upgradeable` and `openzeppelin-foundry-upgrades` (via `forge install`, submodule pattern matching existing `lib/forge-std` setup).
- Update `remappings.txt` to map both new namespaces.
- Update `foundry.toml`:
  - `ffi = true`
  - `ast = true`
  - `build_info = true`
  - `extra_output = ["storageLayout"]`
  - The plugin requires all four to run its layout-diff machinery; missing any one produces an opaque error at deploy/upgrade time.
- Document in `contracts/README.md` (or top-level `README.md` if `contracts/` doesn't have one): `forge clean && forge build` before running deploy/upgrade scripts so the plugin can diff layouts against a fresh build.

## Documented env vars — new `contracts/.env.example`

```bash
# RPC for the chain Toldya deploys to. Used by `forge script --rpc-url $RPC_URL`.
# Taiko Hoodi testnet shown.
RPC_URL=https://rpc.hoodi.taiko.xyz

# Deploy signer. Must have native gas on RPC_URL. Becomes the initial owner
# of the ToldyaHub proxy (i.e. can upgrade it via UUPS). Use a multisig in prod.
DEPLOYER_PK=0x...

# Oracle contract address. On Hoodi: the Veto proxy. On local devnet: leave
# unset and the deploy will default to the deployer (useful with MockOracle).
ORACLE_ADDRESS=

# Recipient of protocol fees. Leave unset to default to the deployer.
TREASURY_ADDRESS=

# ERC-20 used for staking. Leave unset to deploy a MockToken (mTAIKO) — use
# this on testnets only. On mainnet, set to the real TAIKO address.
STAKE_TOKEN=

# Required for Upgrade.s.sol only. Address of the deployed ToldyaHub proxy.
HUB_PROXY_ADDRESS=

# Optional: enables `forge script --verify` against the explorer.
ETHERSCAN_API_KEY=
```

Every variable maps to a real `vm.env*` call or a documented `forge` flag. No dead vars.

## Out of scope (separate work)

- **Multi-sig / timelock for upgrade authority.** `DEPLOYER_PK` becoming a single-EOA owner with rug-capable upgrade rights is acceptable for testnet but must be replaced before mainnet. Tracked as a separate hardening item.
- **Multi-token markets** (per-market `stakeToken`). Discussed in this session but explicitly deferred — would require moving `stakeToken` from contract-level storage to a `Market` field and threading it through every transfer/claim path.
- **Migrating existing Hoodi deployment.** Assumed disposable; redeploy fresh on the testnet. If there is live data worth preserving, that becomes a follow-up.
- **Fixing the `ResolutionRequested` event-signature mismatch** between the hub and the oracle watcher (separately discussed). Not part of this refactor.

## Risk callouts

1. **Storage layout is now load-bearing forever.** Any reorder/insert in storage variables (or in struct fields embedded directly in contract storage — not the `Market` mapping case, but any new top-level structs) silently corrupts the proxy's state. Mitigation: the foundry-upgrades plugin runs layout diff on every `upgradeProxy` call and refuses incompatible upgrades.
2. **`_disableInitializers()` is non-negotiable.** Without it, anyone can `initialize` the implementation contract directly and take ownership of it (not the proxy, but it's still a phishing/governance hazard).
3. **Atomic init.** Manual deploy of (impl, proxy) without atomic `initialize` opens a window where the proxy is uninitialized; any caller can race to call `initialize` and become owner. The plugin's `deployUUPSProxy` does this atomically — we use it specifically to avoid the manual footgun.
4. **Owner = full upgrade authority.** A compromised owner key can deploy a malicious implementation that drains the contract. Single-key ownership is acceptable for testnet; multisig/timelock required for mainnet (out of scope here but documented).

## Files touched

| File | Change |
|---|---|
| `contracts/src/ToldyaHub.sol` | Inheritance swap, immutable→storage, constructor→initializer, `_authorizeUpgrade`, `__gap`, storage-discipline comment. |
| `contracts/script/Deploy.s.sol` | Use `Upgrades.deployUUPSProxy`; pass owner as init arg. |
| `contracts/script/Upgrade.s.sol` | **New.** UUPS upgrade entry point. |
| `contracts/test/ToldyaHub.t.sol` | Add `_deployHub()` helper in `setUp`; add 5 new tests. Existing test bodies unchanged. |
| `contracts/foundry.toml` | Enable FFI, build_info, storageLayout. |
| `contracts/remappings.txt` | Map two new OZ namespaces. |
| `contracts/.env.example` | **New.** Documents all 7 env vars used by deploy + upgrade scripts. |
| `contracts/lib/openzeppelin-contracts-upgradeable` | **New submodule.** |
| `contracts/lib/openzeppelin-foundry-upgrades` | **New submodule.** |

## Acceptance criteria

- `forge test` passes with all existing tests unchanged plus 5 new upgrade-specific tests.
- `Deploy.s.sol` on a local fork produces a working proxy where `markets`, `stake`, `resolveMarket`, and `claim` all behave as before.
- `Upgrade.s.sol` on a local fork successfully upgrades a deployed proxy to an identical implementation, with all pre-upgrade storage intact.
- `Upgrade.s.sol` refuses an upgrade to an implementation with a deliberately-reordered storage variable.
- `contracts/.env.example` exists and every documented var is consumed by either a `vm.env*` call or a `forge` flag.
