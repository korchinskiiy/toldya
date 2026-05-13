// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Minimal interface for the oracle Toldya consumes. Matches the
///         surface exposed by the deployed Veto contract on Taiko Hoodi.
///         Enum order and values must match Veto's storage layout exactly.
interface IOracle {
    enum Status {
        Open,
        Answered,
        Settled
    }

    enum Outcome {
        Unset,
        YES,
        NO,
        ABSTAIN
    }

    /// @notice Create a new oracle request referencing an IPFS query payload.
    /// @return id The oracle's identifier for this request.
    function createRequest(string calldata queryCid) external returns (uint256 id);

    /// @notice Read the current outcome and status of a request. Status must
    ///         be Settled before the outcome can be trusted as final.
    function outcomeOf(uint256 id) external view returns (Outcome outcome, Status status);
}
