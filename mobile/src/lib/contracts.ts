// ABIs mirror the web app. Keep these in sync with frontend/src/lib/contracts.ts
// when contracts change — for now they share a hand-written abi rather than a
// generated one, which is fine for a small surface area.

export const hubAbi = [
    {
        type: "function",
        name: "createMarket",
        stateMutability: "nonpayable",
        inputs: [
            {name: "question", type: "string"},
            {name: "criteria", type: "string"},
            {name: "deadline", type: "uint64"},
            {name: "side", type: "uint8"},
            {name: "amount", type: "uint256"},
            {name: "oracleEnabled", type: "bool"},
        ],
        outputs: [{name: "marketId", type: "uint256"}],
    },
    {
        type: "function",
        name: "stake",
        stateMutability: "nonpayable",
        inputs: [
            {name: "marketId", type: "uint256"},
            {name: "side", type: "uint8"},
            {name: "amount", type: "uint256"},
        ],
        outputs: [],
    },
    {
        type: "function",
        name: "claim",
        stateMutability: "nonpayable",
        inputs: [{name: "marketId", type: "uint256"}],
        outputs: [],
    },
    {
        type: "function",
        name: "nextMarketId",
        stateMutability: "view",
        inputs: [],
        outputs: [{name: "", type: "uint256"}],
    },
    {
        type: "function",
        name: "getMarket",
        stateMutability: "view",
        inputs: [{name: "marketId", type: "uint256"}],
        outputs: [
            {
                type: "tuple",
                components: [
                    {name: "creator", type: "address"},
                    {name: "deadline", type: "uint64"},
                    {name: "status", type: "uint8"},
                    {name: "oracleEnabled", type: "bool"},
                    {name: "question", type: "string"},
                    {name: "criteria", type: "string"},
                    {name: "yesPool", type: "uint256"},
                    {name: "noPool", type: "uint256"},
                ],
            },
        ],
    },
    {
        type: "function",
        name: "previewClaim",
        stateMutability: "view",
        inputs: [
            {name: "marketId", type: "uint256"},
            {name: "user", type: "address"},
        ],
        outputs: [{name: "", type: "uint256"}],
    },
] as const;

export const erc20Abi = [
    {
        type: "function",
        name: "approve",
        stateMutability: "nonpayable",
        inputs: [
            {name: "spender", type: "address"},
            {name: "amount", type: "uint256"},
        ],
        outputs: [{type: "bool"}],
    },
    {
        type: "function",
        name: "balanceOf",
        stateMutability: "view",
        inputs: [{name: "owner", type: "address"}],
        outputs: [{type: "uint256"}],
    },
] as const;

export const STATUS_LABELS = ["Live", "Resolving", "YES won", "NO won", "Voided"] as const;
