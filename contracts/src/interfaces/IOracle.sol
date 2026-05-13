// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IOracle {
    enum Status { Open, Answered, Settled }
    enum Outcome { Unset, YES, NO, ABSTAIN }
    function createRequest(string calldata queryCid) external returns (uint256 id);
    function outcomeOf(uint256 id) external view returns (Outcome outcome, Status status);
}
