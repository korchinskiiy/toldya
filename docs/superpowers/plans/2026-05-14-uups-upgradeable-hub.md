# UUPS-Upgradeable `ToldyaHub` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `ToldyaHub` from a direct deployment to a UUPS-upgradeable contract behind an `ERC1967Proxy`, with foundry-upgrades-plugin-validated upgrades, a new `Upgrade.s.sol` script, expanded test coverage, and a documented `contracts/.env.example`.

**Architecture:** Replace `constructor` with `initialize` (under `Initializable`), demote `stakeToken` from `immutable` to a regular storage slot, swap base classes for their `*Upgradeable` variants, add `UUPSUpgradeable` with an `onlyOwner _authorizeUpgrade` hook, and a `uint256[50] __gap`. Deploy via `Upgrades.deployUUPSProxy(...)` from `openzeppelin-foundry-upgrades`. Upgrades go through the same plugin, which runs Node-based storage-layout validation against the deployed implementation before broadcasting.

**Tech Stack:** Solidity 0.8.26, Foundry (already configured, `via_ir = true`), `@openzeppelin/contracts` v5.6.1 (already installed), `@openzeppelin/contracts-upgradeable` v5.6.0 (new), `openzeppelin-foundry-upgrades` (new, latest tag), `@openzeppelin/upgrades-core` Node package (transitive dep of the plugin's validation step).

**Reference spec:** [docs/superpowers/specs/2026-05-14-uups-upgradeable-hub-design.md](../specs/2026-05-14-uups-upgradeable-hub-design.md)

---

## Task 1: Install dependencies and configure Foundry

**Files:**
- Modify: `contracts/remappings.txt`
- Modify: `contracts/foundry.toml`
- Create: `contracts/package.json` (Node deps for the plugin's safety checks)
- Create: `contracts/.gitignore` additions (`node_modules/`)
- Install: `contracts/lib/openzeppelin-contracts-upgradeable`
- Install: `contracts/lib/openzeppelin-foundry-upgrades`

Note: `contracts/lib/` is gitignored in the repo root `.gitignore`, so libs are dev-local. `contracts/.env*` follows the same pattern.

- [ ] **Step 1: Install OZ Upgradeable contracts**

Run from the repo root:

```bash
cd contracts && forge install --no-commit --no-git OpenZeppelin/openzeppelin-contracts-upgradeable@v5.6.0
```

Expected: directory `contracts/lib/openzeppelin-contracts-upgradeable/` exists with a `contracts/` subdir containing `proxy/utils/Initializable.sol`, `access/OwnableUpgradeable.sol`, `utils/PausableUpgradeable.sol`, `utils/ReentrancyGuardUpgradeable.sol`, `proxy/utils/UUPSUpgradeable.sol`.

- [ ] **Step 2: Install foundry-upgrades plugin**

```bash
cd contracts && forge install --no-commit --no-git OpenZeppelin/openzeppelin-foundry-upgrades
```

Expected: directory `contracts/lib/openzeppelin-foundry-upgrades/` exists with `src/Upgrades.sol`.

- [ ] **Step 3: Update `contracts/remappings.txt`**

Append two lines so it reads:

```
forge-std/=lib/forge-std/src/
@openzeppelin/=lib/openzeppelin-contracts/
@openzeppelin-contracts-upgradeable/=lib/openzeppelin-contracts-upgradeable/contracts/
openzeppelin-foundry-upgrades/=lib/openzeppelin-foundry-upgrades/src/
```

Why two separate `@openzeppelin*` remappings: the non-upgradeable and upgradeable packages both publish under `@openzeppelin/contracts/...` paths internally, and the plugin expects the upgradeable one resolvable via the second remapping. Using `@openzeppelin-contracts-upgradeable/` as the alias avoids collision.

- [ ] **Step 4: Update `contracts/foundry.toml`**

Replace the `[profile.default]` block with:

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
test = "test"
script = "script"
solc_version = "0.8.26"
evm_version = "shanghai"
optimizer = true
optimizer_runs = 200
via_ir = true
ffi = true
ast = true
build_info = true
extra_output = ["storageLayout"]
```

All four new keys (`ffi`, `ast`, `build_info`, `extra_output`) are required by the foundry-upgrades plugin's layout-validation pipeline. Without them, deploy/upgrade scripts fail with an opaque error about missing build artifacts.

- [ ] **Step 5: Initialize Node deps for the plugin**

The plugin shells out to `@openzeppelin/upgrades-core` (Node package) to do storage-layout safety analysis. Create `contracts/package.json`:

```json
{
  "name": "toldya-contracts",
  "private": true,
  "devDependencies": {
    "@openzeppelin/upgrades-core": "^1.32.0"
  }
}
```

Then run:

```bash
cd contracts && npm install
```

Expected: `contracts/node_modules/` populated, `contracts/package-lock.json` created. Both are already covered by the root `.gitignore` (`node_modules/`).

- [ ] **Step 6: Verify clean build**

```bash
cd contracts && forge clean && forge build
```

Expected: build succeeds, no warnings related to the new libs. (The existing `ToldyaHub.sol` is unchanged at this point, so it still compiles cleanly.)

- [ ] **Step 7: Verify existing tests still pass**

```bash
cd contracts && forge test
```

Expected: all existing tests in `test/ToldyaHub.t.sol` pass.

- [ ] **Step 8: Commit**

```bash
cd contracts && git add foundry.toml remappings.txt package.json
git commit -m "$(cat <<'EOF'
build(contracts): add OZ Upgradeable + foundry-upgrades plugin

Installs @openzeppelin/contracts-upgradeable v5.6.0 and the
openzeppelin-foundry-upgrades plugin (lib/, gitignored) plus the
@openzeppelin/upgrades-core Node dep the plugin shells out to for
storage-layout safety analysis. Updates foundry.toml with ffi/ast/
build_info/storageLayout — all four required by the plugin.

Preparation for UUPS conversion; no contract changes yet.
EOF
)"
```

---

## Task 2: TDD seed — write a failing initializer test

**Files:**
- Modify: `contracts/test/ToldyaHub.t.sol` (add one new test at the bottom)

- [ ] **Step 1: Add failing test**

Append to `contracts/test/ToldyaHub.t.sol` (before the closing `}` of `contract ToldyaHubTest`):

```solidity
// -----------------------------------------------------------------------
// UUPS upgradeability
// -----------------------------------------------------------------------

function test_initialize_revertsIfCalledTwice() public {
    vm.expectRevert(); // OZ v5 throws InvalidInitialization
    hub.initialize(token, address(mockOracle), treasury, address(this));
}
```

- [ ] **Step 2: Run the test, watch it fail**

```bash
cd contracts && forge test --match-test test_initialize_revertsIfCalledTwice -vv
```

Expected: compilation FAILS with `Member "initialize" not found or not visible after argument-dependent lookup in contract ToldyaHub`. This is the TDD seed driving Task 3.

---

## Task 3: Convert `ToldyaHub` to UUPS-upgradeable (the big surgical task)

**Files:**
- Modify: `contracts/src/ToldyaHub.sol` (full surgical rewrite of imports, inheritance, constructor, storage; logic untouched)
- Modify: `contracts/test/ToldyaHub.t.sol` (replace direct `new ToldyaHub(...)` with proxy deploy in `setUp`)
- Modify: `contracts/script/Deploy.s.sol` (use `Upgrades.deployUUPSProxy`)

This task contains a lot of code because the contract refactor is structural and must be applied atomically — partial application leaves the project non-compiling.

- [ ] **Step 1: Replace the top of `contracts/src/ToldyaHub.sol`**

Replace lines 1–18 (imports + contract header) with:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin-contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin-contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin-contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin-contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin-contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {IOracle} from "./interfaces/IOracle.sol";

/// @title ToldyaHub
/// @notice Escrow-style P2P prediction markets. Anyone can open a YES/NO market
///         on any question. Stakers commit TAIKO into one of two pools; once the
///         deadline passes an AI oracle resolves the outcome and the winning pool
///         splits the entire pot pro-rata to net stake. If only one side has any
///         stake at resolution, the market is voided and stakers are refunded.
contract ToldyaHub is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;
```

- [ ] **Step 2: Demote `stakeToken` from `immutable` to regular storage**

In `contracts/src/ToldyaHub.sol`, find:

```solidity
    IERC20 public immutable stakeToken;
```

Replace with:

```solidity
    // STORAGE LAYOUT — DO NOT REORDER.
    // Append-only. To add a field, consume a slot from `__gap` at the bottom.
    // Reordering or removing any field breaks deployed proxies.
    // Note: fields appended to the `Market` struct are safe because Market lives
    // in a `mapping` (per-key slot is computed from key + struct base, so adding
    // fields at the end of Market just consumes higher slots).
    IERC20 public stakeToken;
```

- [ ] **Step 3: Replace the constructor with disable + initializer**

Find the existing constructor:

```solidity
    constructor(IERC20 _stakeToken, address _oracle, address _treasury) Ownable(msg.sender) {
        stakeToken = _stakeToken;
        oracle = IOracle(_oracle);
        treasury = _treasury;
    }
```

Replace with:

```solidity
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice One-time initializer for the proxy. Called atomically by the
    ///         deploy script via `ERC1967Proxy(impl, initData)`. Cannot be
    ///         called again on the proxy, and cannot be called on the
    ///         implementation contract at all (disabled by the constructor).
    /// @param _stakeToken ERC-20 used for all stakes in this hub.
    /// @param _oracle    Address of the IOracle implementation (Veto proxy in prod).
    /// @param _treasury  Recipient of protocol fees.
    /// @param _owner     Initial owner. Holds upgrade authority. Use a multisig
    ///                   in production.
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

    /// @notice UUPS upgrade authorization. Owner-only. A compromised owner key
    ///         can deploy a malicious implementation and drain funds — use a
    ///         multisig + timelock in production.
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
```

- [ ] **Step 4: Add `__gap` at the bottom of the contract**

Find the last closing `}` of the `ToldyaHub` contract. Immediately before it, add:

```solidity

    /// @dev Reserved storage slots for future upgrades. Each new state variable
    ///      added in a future implementation must consume one slot from this
    ///      array (e.g. shrink to `uint256[49]` and add `uint256 newField;`
    ///      above it). Reordering or skipping breaks proxy storage.
    uint256[50] private __gap;
```

- [ ] **Step 5: Update test `setUp` to deploy via proxy**

In `contracts/test/ToldyaHub.t.sol`, update the imports at the top to add:

```solidity
import {Upgrades} from "openzeppelin-foundry-upgrades/Upgrades.sol";
```

Then replace the `setUp` function:

```solidity
    function setUp() public {
        token = new MockToken();
        mockOracle = new MockOracle();
        hub = _deployHub(token, address(mockOracle), treasury, address(this));

        vm.warp(START);

        address[3] memory users = [rob, tom, sam];
        for (uint256 i = 0; i < users.length; i++) {
            token.mint(users[i], 1_000 ether);
            vm.prank(users[i]);
            token.approve(address(hub), type(uint256).max);
        }
    }

    function _deployHub(
        MockToken token_,
        address oracle_,
        address treasury_,
        address owner_
    ) internal returns (ToldyaHub) {
        address proxy = Upgrades.deployUUPSProxy(
            "ToldyaHub.sol",
            abi.encodeCall(
                ToldyaHub.initialize,
                (IERC20(address(token_)), oracle_, treasury_, owner_)
            )
        );
        return ToldyaHub(proxy);
    }
```

Note: the `IERC20` cast requires importing `IERC20`. Add to the test file's imports:

```solidity
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
```

- [ ] **Step 6: Update `Deploy.s.sol` to deploy via proxy**

Replace the entire body of `contracts/script/Deploy.s.sol` with:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {ToldyaHub} from "../src/ToldyaHub.sol";
import {MockToken} from "../src/mocks/MockToken.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Upgrades} from "openzeppelin-foundry-upgrades/Upgrades.sol";

contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(pk);

        // Oracle is the address of an IOracle implementation (typically the
        // Veto proxy on Hoodi). Treasury defaults to the deployer. Both can
        // be rotated later via setOracle / setTreasury on the hub. Defaulting
        // oracle to the deployer is convenient for local devnets where a
        // MockOracle isn't deployed; production deploys MUST set
        // ORACLE_ADDRESS to the Veto proxy.
        address oracle = vm.envOr("ORACLE_ADDRESS", deployer);
        address treasury = vm.envOr("TREASURY_ADDRESS", deployer);
        address tokenAddr = vm.envOr("STAKE_TOKEN", address(0));

        vm.startBroadcast(pk);

        IERC20 token;
        if (tokenAddr == address(0)) {
            MockToken t = new MockToken();
            token = IERC20(address(t));
            console2.log("MockToken deployed", address(t));
        } else {
            token = IERC20(tokenAddr);
        }

        // Deploys ToldyaHub implementation, then an ERC1967Proxy pointing at
        // it, then atomically calls initialize through the proxy in a single
        // tx batch. Deployer is the initial owner (upgrade authority). Swap
        // to a multisig with setOwner() / Ownable2Step before mainnet.
        address proxy = Upgrades.deployUUPSProxy(
            "ToldyaHub.sol",
            abi.encodeCall(
                ToldyaHub.initialize,
                (token, oracle, treasury, deployer)
            )
        );

        vm.stopBroadcast();

        console2.log("Deployer ", deployer);
        console2.log("Oracle   ", oracle);
        console2.log("Treasury ", treasury);
        console2.log("Token    ", address(token));
        console2.log("Hub proxy", proxy);
    }
}
```

- [ ] **Step 7: Build**

```bash
cd contracts && forge build
```

Expected: clean build, no errors.

- [ ] **Step 8: Run all tests**

```bash
cd contracts && forge test -vv
```

Expected: every existing test passes, plus `test_initialize_revertsIfCalledTwice` (from Task 2) now passes. If anything fails, fix before committing.

- [ ] **Step 9: Commit**

```bash
cd contracts && git add src/ToldyaHub.sol test/ToldyaHub.t.sol script/Deploy.s.sol
git commit -m "$(cat <<'EOF'
feat(hub): convert ToldyaHub to UUPS-upgradeable

- Replace constructor with initializer; disable initializers on the
  implementation so it cannot be hijacked.
- Demote `stakeToken` from immutable to regular storage (required for
  proxies; behaviorally identical to callers — no setter exposed).
- Swap Ownable/Pausable/ReentrancyGuard for their Upgradeable variants.
- Add UUPSUpgradeable + onlyOwner _authorizeUpgrade.
- Reserve 50 storage slots via __gap for future state additions.
- Deploy.s.sol now deploys via Upgrades.deployUUPSProxy (atomic
  impl + proxy + initialize) and logs the proxy address as the
  canonical hub address.
- Test setUp deploys via a _deployHub() helper; all existing pinning
  tests pass unchanged because the proxy is transparent to callers.

The deployer becomes the initial owner (upgrade authority). Replace
with a multisig + timelock before mainnet — see spec risk callouts.
EOF
)"
```

---

## Task 4: Add `Upgrade.s.sol` script

**Files:**
- Create: `contracts/script/Upgrade.s.sol`

- [ ] **Step 1: Write the upgrade script**

Create `contracts/script/Upgrade.s.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {Upgrades} from "openzeppelin-foundry-upgrades/Upgrades.sol";

/// @notice Upgrades a deployed ToldyaHub proxy to a new implementation.
///         The plugin runs storage-layout safety checks against the previous
///         implementation's saved layout before broadcasting. Must be invoked
///         by the proxy owner (signed with DEPLOYER_PK).
///
/// @dev Set NEW_IMPL_CONTRACT to the filename of the new implementation, e.g.
///      "ToldyaHubV2.sol". The plugin resolves it from build output. Pass an
///      empty bytes string for `data` unless the new impl exposes a
///      reinitializer that must be called atomically with the upgrade.
contract Upgrade is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address proxy = vm.envAddress("HUB_PROXY_ADDRESS");
        string memory newImpl = vm.envString("NEW_IMPL_CONTRACT");

        vm.startBroadcast(pk);
        Upgrades.upgradeProxy(proxy, newImpl, "");
        vm.stopBroadcast();

        console2.log("Upgraded proxy", proxy);
        console2.log("New impl     ", newImpl);
    }
}
```

- [ ] **Step 2: Build**

```bash
cd contracts && forge build
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
cd contracts && git add script/Upgrade.s.sol
git commit -m "feat(contracts): add Upgrade.s.sol for UUPS proxy upgrades"
```

---

## Task 5: Add `ToldyaHubV2Mock` for upgrade tests

**Files:**
- Create: `contracts/test/mocks/ToldyaHubV2Mock.sol`

Test-only mock used by `test_upgradeToAndCall_preservesState` and `test_upgradeToAndCall_succeedsForOwner`. Placed in `test/mocks/` rather than `src/mocks/` because it's strictly a test artifact (the existing `src/mocks/` mocks are referenced by scripts; this one isn't).

- [ ] **Step 1: Create the V2 mock**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ToldyaHub} from "../../src/ToldyaHub.sol";

/// @notice Storage-layout-identical "upgrade" of ToldyaHub used only by
///         upgrade tests. Adds one trivial function to make the upgrade
///         externally observable; consumes zero storage slots.
contract ToldyaHubV2Mock is ToldyaHub {
    function version() external pure returns (string memory) {
        return "v2-mock";
    }
}
```

- [ ] **Step 2: Build**

```bash
cd contracts && forge build
```

Expected: clean build, `ToldyaHubV2Mock.json` appears in `out/`.

- [ ] **Step 3: Commit**

```bash
cd contracts && git add test/mocks/ToldyaHubV2Mock.sol
git commit -m "test(hub): add ToldyaHubV2Mock for UUPS upgrade tests"
```

---

## Task 6: `test_initialize_revertsOnImplementationDirectly`

**Files:**
- Modify: `contracts/test/ToldyaHub.t.sol`

Confirms `_disableInitializers()` in the implementation's constructor works — calling `initialize` on the impl contract (not the proxy) must revert. Critical security test: without it, an attacker could seize the implementation and the upgrade-authority misdirection becomes a real risk vector.

- [ ] **Step 1: Add `Upgrades` import for the `getImplementationAddress` helper**

Already imported in Task 3 step 5. Skip if present.

- [ ] **Step 2: Write the test**

Append below `test_initialize_revertsIfCalledTwice`:

```solidity
function test_initialize_revertsOnImplementationDirectly() public {
    address impl = Upgrades.getImplementationAddress(address(hub));
    vm.expectRevert(); // InvalidInitialization
    ToldyaHub(impl).initialize(token, address(mockOracle), treasury, address(this));
}
```

- [ ] **Step 3: Run**

```bash
cd contracts && forge test --match-test test_initialize_revertsOnImplementationDirectly -vv
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd contracts && git add test/ToldyaHub.t.sol
git commit -m "test(hub): pin _disableInitializers on implementation"
```

---

## Task 7: `test_authorizeUpgrade_onlyOwner`

**Files:**
- Modify: `contracts/test/ToldyaHub.t.sol`

- [ ] **Step 1: Write the test**

Append:

```solidity
function test_authorizeUpgrade_onlyOwner() public {
    // rob is not the owner (the test contract is). Deploy a V2 impl to
    // attempt to upgrade to.
    ToldyaHubV2Mock v2Impl = new ToldyaHubV2Mock();
    vm.prank(rob);
    vm.expectRevert(); // OwnableUnauthorizedAccount(rob)
    hub.upgradeToAndCall(address(v2Impl), "");
}
```

Add the import at the top of the test file:

```solidity
import {ToldyaHubV2Mock} from "./mocks/ToldyaHubV2Mock.sol";
```

- [ ] **Step 2: Run**

```bash
cd contracts && forge test --match-test test_authorizeUpgrade_onlyOwner -vv
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd contracts && git add test/ToldyaHub.t.sol
git commit -m "test(hub): pin onlyOwner gate on UUPS upgrade"
```

---

## Task 8: `test_upgradeToAndCall_succeedsForOwner`

**Files:**
- Modify: `contracts/test/ToldyaHub.t.sol`

- [ ] **Step 1: Write the test**

Append:

```solidity
function test_upgradeToAndCall_succeedsForOwner() public {
    // address(this) is the owner (set in setUp via _deployHub).
    Upgrades.upgradeProxy(
        address(hub),
        "ToldyaHubV2Mock.sol",
        ""
    );
    // Proxy now delegates to V2Mock. The version() function only exists on V2.
    assertEq(ToldyaHubV2Mock(address(hub)).version(), "v2-mock");
}
```

- [ ] **Step 2: Run**

```bash
cd contracts && forge test --match-test test_upgradeToAndCall_succeedsForOwner -vv
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd contracts && git add test/ToldyaHub.t.sol
git commit -m "test(hub): pin owner-driven UUPS upgrade succeeds"
```

---

## Task 9: `test_upgradeToAndCall_preservesState`

**Files:**
- Modify: `contracts/test/ToldyaHub.t.sol`

The critical regression test: after an upgrade, all storage must read back identical.

- [ ] **Step 1: Write the test**

Append:

```solidity
function test_upgradeToAndCall_preservesState() public {
    // Create a market with stakes on both sides.
    uint256 marketId = _create(rob, ToldyaHub.Side.Yes, 100 ether);
    vm.prank(tom);
    hub.stake(marketId, ToldyaHub.Side.No, 50 ether);
    vm.prank(sam);
    hub.stake(marketId, ToldyaHub.Side.Yes, 25 ether);

    // Snapshot pre-upgrade state.
    ToldyaHub.Market memory before_ = hub.getMarket(marketId);
    uint256 robYesBefore = hub.yesStake(marketId, rob);
    uint256 tomNoBefore = hub.noStake(marketId, tom);
    uint256 samYesBefore = hub.yesStake(marketId, sam);

    // Upgrade.
    Upgrades.upgradeProxy(address(hub), "ToldyaHubV2Mock.sol", "");

    // Verify all storage survived.
    ToldyaHub.Market memory after_ = hub.getMarket(marketId);
    assertEq(after_.creator, before_.creator);
    assertEq(after_.deadline, before_.deadline);
    assertEq(uint8(after_.status), uint8(before_.status));
    assertEq(after_.yesPool, before_.yesPool);
    assertEq(after_.noPool, before_.noPool);
    assertEq(hub.yesStake(marketId, rob), robYesBefore);
    assertEq(hub.noStake(marketId, tom), tomNoBefore);
    assertEq(hub.yesStake(marketId, sam), samYesBefore);

    // And the new impl is actually live.
    assertEq(ToldyaHubV2Mock(address(hub)).version(), "v2-mock");
}
```

- [ ] **Step 2: Run**

```bash
cd contracts && forge test --match-test test_upgradeToAndCall_preservesState -vv
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd contracts && git add test/ToldyaHub.t.sol
git commit -m "test(hub): pin state preservation across UUPS upgrade"
```

---

## Task 10: Create `contracts/.env.example`

**Files:**
- Create: `contracts/.env.example`

- [ ] **Step 1: Write the file**

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

# Required for Upgrade.s.sol only. Filename of the new implementation contract
# (e.g. "ToldyaHubV2.sol"). The foundry-upgrades plugin resolves it from build
# output and validates storage-layout compatibility before broadcasting.
NEW_IMPL_CONTRACT=

# Optional: enables `forge script --verify` against the explorer.
ETHERSCAN_API_KEY=
```

- [ ] **Step 2: Sanity-check every var is consumed somewhere**

```bash
cd contracts && grep -nE 'vm\.env(Uint|Address|String|Or)' script/*.sol
```

Expected: matches for `DEPLOYER_PK`, `ORACLE_ADDRESS`, `TREASURY_ADDRESS`, `STAKE_TOKEN`, `HUB_PROXY_ADDRESS`, `NEW_IMPL_CONTRACT`. (`RPC_URL` and `ETHERSCAN_API_KEY` are consumed by `forge` flags, not Solidity.)

- [ ] **Step 3: Commit**

```bash
cd contracts && git add .env.example
git commit -m "docs(contracts): document deploy + upgrade env vars"
```

---

## Task 11: Document storage discipline

**Files:**
- Modify: `README.md` (top-level) — add a short section, or create `contracts/README.md` if no contracts-specific README exists.

- [ ] **Step 1: Check whether `contracts/README.md` exists**

```bash
ls /Users/davidcai/taiko/toldya/contracts/README.md 2>/dev/null && echo "EXISTS" || echo "MISSING"
```

If MISSING, create it; if EXISTS, append a section.

- [ ] **Step 2: Write the storage discipline section**

Either create `contracts/README.md` with the following content, or append it under a new `## Storage discipline` header in the existing README:

````markdown
## Storage discipline (UUPS proxy)

`ToldyaHub` is deployed as a UUPS proxy. The implementation's storage
layout is locked once a proxy is in production. Rules:

1. **Never reorder existing state variables.** The variable order in
   `ToldyaHub.sol` IS the storage layout.
2. **Never remove state variables.** Removing a variable shifts all
   subsequent variables down a slot, corrupting the proxy's state.
3. **To add a new state variable**, decrement the `__gap` array at the
   bottom of the contract by one and declare the new variable
   immediately above it. Example:

   ```solidity
   uint256 public newField;          // added
   uint256[49] private __gap;        // was [50]
   ```

4. **The `Market` struct (in `mapping(uint256 => Market)`) is safe to
   extend at the end.** Mapping slots are computed from key + struct
   base, so new fields at the end of `Market` just consume higher slots
   for each key.

The `openzeppelin-foundry-upgrades` plugin runs storage-layout safety
checks on every `Upgrades.upgradeProxy(...)` call and refuses
incompatible upgrades, but the rules above are the discipline we owe it.

### Deploy

```bash
cp .env.example .env  # fill in DEPLOYER_PK
cd contracts && forge clean && forge build
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
```

### Upgrade

```bash
# .env must set HUB_PROXY_ADDRESS and NEW_IMPL_CONTRACT
cd contracts && forge clean && forge build
forge script script/Upgrade.s.sol --rpc-url $RPC_URL --broadcast
```
````

- [ ] **Step 3: Commit**

```bash
git add contracts/README.md  # or the modified top-level README.md
git commit -m "docs(contracts): document storage discipline and proxy ops"
```

---

## Acceptance criteria (from the spec)

After all tasks complete, verify:

- [ ] `cd contracts && forge test` — all existing tests pass plus 5 new upgrade-specific tests (`test_initialize_revertsIfCalledTwice`, `test_initialize_revertsOnImplementationDirectly`, `test_authorizeUpgrade_onlyOwner`, `test_upgradeToAndCall_succeedsForOwner`, `test_upgradeToAndCall_preservesState`).
- [ ] `Deploy.s.sol` on `anvil` or a local fork: produces a proxy address; `markets`, `stake`, `resolveMarket`, and `claim` all behave as before (smoke test optional but recommended).
- [ ] `Upgrade.s.sol` on the same fork: upgrades the proxy to an identical impl; storage intact.
- [ ] `contracts/.env.example` exists and every variable maps to a real `vm.env*` call or a documented `forge` flag.
- [ ] `forge build` is clean.

## Self-review notes

- Every spec section maps to at least one task: contract surgery (Task 3), tooling (Task 1), deploy script (Task 3), upgrade script (Task 4), test refactor (Task 3 helper), 5 new tests (Tasks 2, 6, 7, 8, 9), env.example (Task 10), docs (Task 11). Risk callouts surface in commit messages and the README section.
- No `TBD`/`TODO`/"appropriate" placeholders. Every code step has the actual code.
- Type/method names checked across tasks: `_deployHub`, `Upgrades.deployUUPSProxy`, `Upgrades.upgradeProxy`, `Upgrades.getImplementationAddress`, `ToldyaHubV2Mock.version()` — all consistent.
- The TDD seed in Task 2 drives the structural change in Task 3, which is the most honest decomposition possible for an all-or-nothing structural refactor. Tasks 6–9 are pinning tests for behavior implemented in Task 3 — explicitly framed as such.
