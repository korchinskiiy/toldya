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
