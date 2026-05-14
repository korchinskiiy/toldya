// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {UUPSUpgradeable} from "@openzeppelin-contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @notice Upgrades a deployed ToldyaHub proxy to a new implementation.
///         Must be invoked by the proxy owner (signed with DEPLOYER_PK).
///
/// @dev Pre-flight: deploy the new implementation contract separately and
///      set NEW_IMPL_ADDRESS to its address. The plugin-based layout safety
///      check has been replaced with a manual workflow — run
///      `forge inspect ToldyaHub storage-layout` against both impls and
///      diff before broadcasting. Passing empty bytes for `data` unless the
///      new impl exposes a reinitializer that must be called atomically.
contract Upgrade is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address proxy = vm.envAddress("HUB_PROXY_ADDRESS");
        address newImpl = vm.envAddress("NEW_IMPL_ADDRESS");

        vm.startBroadcast(pk);
        UUPSUpgradeable(proxy).upgradeToAndCall(newImpl, "");
        vm.stopBroadcast();

        console2.log("Upgraded proxy", proxy);
        console2.log("New impl     ", newImpl);
    }
}
