// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {ToldyaHub} from "../src/ToldyaHub.sol";
import {MockToken} from "../src/mocks/MockToken.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address oracle = vm.envAddress("ORACLE_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
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
        console2.log("ToldyaHub deployed", address(hub));

        vm.stopBroadcast();
    }
}
