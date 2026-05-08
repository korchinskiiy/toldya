import {defineChain} from "viem";

const rpcUrl =
    process.env.EXPO_PUBLIC_RPC_URL ?? "https://rpc.hoodi.taiko.xyz";

export const taikoHoodi = defineChain({
    id: 167013,
    name: "Taiko Hoodi",
    nativeCurrency: {name: "Ether", symbol: "ETH", decimals: 18},
    rpcUrls: {default: {http: [rpcUrl]}},
    blockExplorers: {
        default: {name: "Taikoscan", url: "https://hoodi.taikoscan.io"},
    },
    testnet: true,
});

export const ALLOWED_CHAIN = taikoHoodi;

function requireAddress(name: string, value: string | undefined): `0x${string}` {
    if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0+$/.test(value)) {
        throw new Error(
            `${name} is not set. Add it to mobile/.env (and re-export with EXPO_PUBLIC_ prefix).`,
        );
    }
    return value as `0x${string}`;
}

export const HUB_ADDRESS = requireAddress(
    "EXPO_PUBLIC_HUB_ADDRESS",
    process.env.EXPO_PUBLIC_HUB_ADDRESS,
);

export const TOKEN_ADDRESS = requireAddress(
    "EXPO_PUBLIC_TOKEN_ADDRESS",
    process.env.EXPO_PUBLIC_TOKEN_ADDRESS,
);

export const REOWN_PROJECT_ID =
    process.env.EXPO_PUBLIC_REOWN_PROJECT_ID ?? "";
