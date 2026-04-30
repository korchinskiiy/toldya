export const HUB_ADDRESS = (process.env.NEXT_PUBLIC_HUB_ADDRESS ??
    "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ??
    "0x0000000000000000000000000000000000000000") as `0x${string}`;

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
        name: "triggerResolution",
        stateMutability: "nonpayable",
        inputs: [{name: "marketId", type: "uint256"}],
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
    {
        type: "function",
        name: "yesStake",
        stateMutability: "view",
        inputs: [
            {name: "", type: "uint256"},
            {name: "", type: "address"},
        ],
        outputs: [{name: "", type: "uint256"}],
    },
    {
        type: "function",
        name: "noStake",
        stateMutability: "view",
        inputs: [
            {name: "", type: "uint256"},
            {name: "", type: "address"},
        ],
        outputs: [{name: "", type: "uint256"}],
    },
    {
        type: "function",
        name: "submitEvidence",
        stateMutability: "nonpayable",
        inputs: [
            {name: "marketId", type: "uint256"},
            {name: "cid", type: "string"},
            {name: "mediaType", type: "uint8"},
            {name: "description", type: "string"},
        ],
        outputs: [],
    },
    {
        type: "event",
        name: "EvidenceSubmitted",
        inputs: [
            {indexed: true, name: "marketId", type: "uint256"},
            {indexed: true, name: "submitter", type: "address"},
            {indexed: false, name: "cid", type: "string"},
            {indexed: false, name: "mediaType", type: "uint8"},
            {indexed: false, name: "description", type: "string"},
        ],
    },
] as const;

// Mirrors the on-chain enum (see ToldyaHub.MediaType)
export const MEDIA_TYPE = {Image: 0, Video: 1, Audio: 2, Text: 3} as const;
export type MediaType = (typeof MEDIA_TYPE)[keyof typeof MEDIA_TYPE];

export function detectMediaType(contentType: string): MediaType {
    if (contentType.startsWith("image/")) return MEDIA_TYPE.Image;
    if (contentType.startsWith("video/")) return MEDIA_TYPE.Video;
    if (contentType.startsWith("audio/")) return MEDIA_TYPE.Audio;
    return MEDIA_TYPE.Text;
}

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
        name: "allowance",
        stateMutability: "view",
        inputs: [
            {name: "owner", type: "address"},
            {name: "spender", type: "address"},
        ],
        outputs: [{type: "uint256"}],
    },
    {
        type: "function",
        name: "balanceOf",
        stateMutability: "view",
        inputs: [{name: "owner", type: "address"}],
        outputs: [{type: "uint256"}],
    },
    {
        type: "function",
        name: "decimals",
        stateMutability: "view",
        inputs: [],
        outputs: [{type: "uint8"}],
    },
    {
        type: "function",
        name: "symbol",
        stateMutability: "view",
        inputs: [],
        outputs: [{type: "string"}],
    },
] as const;

export const STATUS_LABELS = ["Open", "Resolving", "Resolved YES", "Resolved NO", "Voided"] as const;
