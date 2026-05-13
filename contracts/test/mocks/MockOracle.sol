// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IOracle} from "../../src/interfaces/IOracle.sol";

contract MockOracle is IOracle {
    uint256 public nextId;
    mapping(uint256 => string) public queryCidOf;
    mapping(uint256 => Outcome) public outcomes;
    mapping(uint256 => Status) public statuses;

    function createRequest(string calldata queryCid) external returns (uint256 id) {
        id = nextId++;
        queryCidOf[id] = queryCid;
        statuses[id] = Status.Open;
    }

    function outcomeOf(uint256 id) external view returns (Outcome outcome, Status status) {
        return (outcomes[id], statuses[id]);
    }

    function setResult(uint256 id, Outcome outcome, Status status) external {
        outcomes[id] = outcome;
        statuses[id] = status;
    }
}
