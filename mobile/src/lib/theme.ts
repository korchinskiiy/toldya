// Shared design tokens — mirrors the web app's palette so the look stays in
// sync. Importing from one place keeps the visual identity consistent across
// every screen / sheet.

export const colors = {
    bg: "#fafaf7",
    bgElevated: "#ffffff",
    bgHover: "#f4f4f0",
    border: "rgba(15, 15, 15, 0.08)",
    borderStrong: "rgba(15, 15, 15, 0.18)",

    text: "#0d0d0d",
    textMuted: "#6b6b6b",
    textFaint: "#9a9a9a",

    accent: "#d97706",
    accentHover: "#b45309",
    accentBg: "rgba(217, 119, 6, 0.10)",
    accentYellow: "#facc15",

    yes: "#d97706",
    yesBg: "#fde68a",
    yesText: "#78350f",

    no: "#71717a",
    noBg: "#d4d4d8",
    noText: "#27272a",

    danger: "#dc2626",
};

export const radii = {sm: 6, md: 12, lg: 18, pill: 999};

export const shadow = {
    card: {
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 16,
        shadowOffset: {width: 0, height: 4},
        elevation: 2,
    },
    soft: {
        shadowColor: "#000",
        shadowOpacity: 0.04,
        shadowRadius: 12,
        shadowOffset: {width: 0, height: 2},
        elevation: 1,
    },
};

export const HOODI_FAUCET_URL = "https://hoodi.ethpandaops.io/";
// Anything under 0.001 ETH is "not enough for a single approve + stake".
export const MIN_GAS_WEI = 1_000_000_000_000_000n;
