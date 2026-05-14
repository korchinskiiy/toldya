# Toldya Contracts

Foundry-based Solidity contracts for ToldyaHub, a UUPS-upgradeable
prediction market hub. Target chain: **Shanghai EVM**.

## Build

```bash
forge build
```

`evm_version = "shanghai"` in `foundry.toml`. The build is configured to keep
deployed bytecode strictly Shanghai-compatible (no `mcopy`, `tload`, `tstore`,
`blobhash`, `blobbasefee`).

## Test

```bash
forge test
```

## Storage discipline (UUPS proxy)

`ToldyaHub` is deployed behind an `ERC1967Proxy`. The implementation's storage
layout is locked once a proxy is in production. Rules:

1. **Never reorder existing state variables.** The variable order in
   `src/ToldyaHub.sol` IS the storage layout.
2. **Never remove state variables.** Removing shifts subsequent variables down
   a slot, corrupting the proxy's state.
3. **To add a new state variable**, decrement the `__gap` array at the bottom
   of the contract by one and declare the new variable immediately above it:

   ```solidity
   uint256 public newField;          // added
   uint256[49] private __gap;        // was [50]
   ```

4. **The `Market` struct (in `mapping(uint256 => Market)`) is safe to extend
   at the end.** Mapping slots are computed from key + struct base, so new
   fields at the end of `Market` just consume higher slots for each key.
5. **Storage from inherited upgradeable parents lives in ERC-7201 namespaced
   slots** (`OwnableUpgradeable`, `PausableUpgradeable`, `UUPSUpgradeable`,
   plus the inline reentrancy guard's hardcoded slot). These do not occupy
   sequential slots in ToldyaHub's layout and are upgrade-safe by construction.

## Storage layout snapshots

Capture the storage layout after every deployment and commit it to `git`. Run:

```bash
forge inspect ToldyaHub storage-layout > storage-layout/ToldyaHub.layout.json
git add storage-layout/ToldyaHub.layout.json
git commit -m "chore(storage): snapshot ToldyaHub layout @ <version>"
```

Before every upgrade, regenerate and diff:

```bash
forge inspect ToldyaHub storage-layout > /tmp/new.layout.json
diff storage-layout/ToldyaHub.layout.json /tmp/new.layout.json
```

The diff must show only **appended entries** (new state slots beyond the
previous ones, plus a correspondingly smaller `__gap`). Any reordering,
removal, or type change is a hard stop — fix the source and re-snapshot.

## Deploy (first time)

```bash
cp .env.example .env  # fill in DEPLOYER_PK, ORACLE_ADDRESS, etc.
forge clean && forge build
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
```

The deploy script:
1. Optionally deploys a `MockToken` if `STAKE_TOKEN` is unset.
2. Deploys the `ToldyaHub` implementation.
3. Deploys an `ERC1967Proxy` pointing at the implementation, with `initialize`
   called atomically in the proxy's constructor.

`DEPLOYER_PK`'s address becomes the **initial owner** (upgrade authority).
Capture the printed `Hub proxy` address — that is the canonical hub address
for all future interactions and upgrades.

Take an initial storage snapshot per the section above.

## Upgrade

Two-step:

```bash
# 1. Deploy the new implementation (no initialize call — the proxy stays).
#    Save the address it logs.
forge create --rpc-url $RPC_URL --private-key $DEPLOYER_PK \
    src/ToldyaHubV2.sol:ToldyaHubV2

# 2. Verify storage-layout safety against the committed snapshot.
forge inspect ToldyaHubV2 storage-layout > /tmp/new.layout.json
diff storage-layout/ToldyaHub.layout.json /tmp/new.layout.json
# Inspect the diff — must be append-only (see "Storage layout snapshots").

# 3. Point the upgrade env vars at the new impl and the existing proxy, then
#    broadcast the upgrade.
# .env must set:
#   HUB_PROXY_ADDRESS=<existing proxy>
#   NEW_IMPL_ADDRESS=<new impl from step 1>
forge script script/Upgrade.s.sol --rpc-url $RPC_URL --broadcast

# 4. Snapshot the new layout (replaces the previous file).
forge inspect ToldyaHubV2 storage-layout > storage-layout/ToldyaHub.layout.json
git add storage-layout/ToldyaHub.layout.json
git commit -m "chore(storage): snapshot ToldyaHub layout post-upgrade"
```

`Upgrade.s.sol` calls `UUPSUpgradeable.upgradeToAndCall(newImpl, "")` on the
proxy, owner-gated by `_authorizeUpgrade(onlyOwner)`. The empty bytes arg
means no re-initializer is called. If a new impl version needs a
re-initializer, pass the encoded call data instead of `""`.

## Notes on the upgrade authority

The deployer is the initial owner and has **full unilateral upgrade authority**.
A compromised owner key can deploy a malicious implementation and drain funds.
Before mainnet:

- Transfer ownership to a multisig (`hub.transferOwnership(multisig)`), or
- Re-deploy inheriting `Ownable2StepUpgradeable` for a two-phase handoff, or
- Add a Timelock in front of the owner so upgrades have a publicly-observable
  delay window.

These are out of scope for the initial UUPS conversion but tracked as a
pre-mainnet hardening requirement.
