// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IOracle {
    function requestResolution(uint256 marketId, string calldata question, string calldata criteria)
        external;
}
