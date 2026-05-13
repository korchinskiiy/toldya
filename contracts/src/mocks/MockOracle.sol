// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IOracle} from "../interfaces/IOracle.sol";

/// @notice Test-only mock of IOracle. Records every createRequest call so
///         tests can assert it was/wasn't invoked, and lets tests stub the
///         (outcome, status) returned by outcomeOf for any request id.
contract MockOracle is IOracle {
    struct Stub {
        Outcome outcome;
        Status status;
        bool set;
    }

    uint256 public nextId;
    uint256 public createRequestCallCount;
    string[] public capturedQueryCids;
    mapping(uint256 => Stub) internal _stubs;

    function createRequest(string calldata queryCid) external override returns (uint256 id) {
        id = nextId++;
        createRequestCallCount++;
        capturedQueryCids.push(queryCid);
    }

    function outcomeOf(uint256 id) external view override returns (Outcome outcome, Status status) {
        Stub memory s = _stubs[id];
        return (s.outcome, s.status);
    }

    /// @notice Test helper: stub the outcome+status that outcomeOf returns for `id`.
    function setOutcome(uint256 id, Outcome outcome, Status status) external {
        _stubs[id] = Stub({outcome: outcome, status: status, set: true});
    }

    function capturedQueryCidCount() external view returns (uint256) {
        return capturedQueryCids.length;
    }
}
