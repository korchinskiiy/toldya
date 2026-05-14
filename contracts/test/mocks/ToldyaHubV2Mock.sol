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
