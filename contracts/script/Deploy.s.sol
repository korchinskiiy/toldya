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
        // to a multisig with transferOwnership() before mainnet, or
        // re-deploy inheriting Ownable2StepUpgradeable for a two-phase handoff.
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
