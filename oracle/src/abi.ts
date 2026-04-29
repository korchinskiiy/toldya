// Minimal ABI surface used by the oracle agent.
// Keep in sync with contracts/src/ToldyaHub.sol.
export const hubAbi = [
    {
        type: "event",
        name: "ResolutionRequested",
        inputs: [
            {indexed: true, name: "marketId", type: "uint256"},
            {indexed: false, name: "question", type: "string"},
            {indexed: false, name: "criteria", type: "string"},
        ],
    },
    {
        type: "event",
        name: "MarketResolved",
        inputs: [
            {indexed: true, name: "marketId", type: "uint256"},
            {indexed: false, name: "outcome", type: "uint8"},
        ],
    },
    {
        type: "function",
        name: "resolveMarket",
        stateMutability: "nonpayable",
        inputs: [
            {name: "marketId", type: "uint256"},
            {name: "yesWon", type: "bool"},
        ],
        outputs: [],
    },
    {
        type: "function",
        name: "markets",
        stateMutability: "view",
        inputs: [{name: "", type: "uint256"}],
        outputs: [
            {name: "creator", type: "address"},
            {name: "deadline", type: "uint64"},
            {name: "status", type: "uint8"},
            {name: "question", type: "string"},
            {name: "criteria", type: "string"},
            {name: "yesPool", type: "uint256"},
            {name: "noPool", type: "uint256"},
        ],
    },
] as const;
