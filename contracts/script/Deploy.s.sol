// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {ToldyaHub} from "../src/ToldyaHub.sol";
import {MockToken} from "../src/mocks/MockToken.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(pk);

        // Oracle and treasury default to the deployer if not explicitly set.
        // They can be rotated later via setOracle / setTreasury on the hub.
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

        ToldyaHub hub = new ToldyaHub(token, oracle, treasury);
        console2.log("Deployer", deployer);
        console2.log("Oracle  ", oracle);
        console2.log("Treasury", treasury);
        console2.log("Token   ", address(token));
        console2.log("ToldyaHub deployed", address(hub));

        vm.stopBroadcast();
    }
}
