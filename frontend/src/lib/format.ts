import {formatUnits, parseUnits} from "viem";

export function formatTaiko(value: bigint, decimals = 18, maxFrac = 4): string {
    const s = formatUnits(value, decimals);
    if (!s.includes(".")) return s;
    const [whole, frac] = s.split(".");
    return `${whole}.${frac.slice(0, maxFrac).replace(/0+$/, "") || "0"}`;
}

export function parseTaiko(input: string, decimals = 18): bigint {
    return parseUnits(input as `${number}`, decimals);
}

export function deadlineLabel(deadline: bigint): string {
    const ms = Number(deadline) * 1000;
    const diff = ms - Date.now();
    const abs = Math.abs(diff);
    const mins = Math.round(abs / 60000);
    if (mins < 60) return diff > 0 ? `in ${mins}m` : `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 48) return diff > 0 ? `in ${hours}h` : `${hours}h ago`;
    const days = Math.round(hours / 24);
    return diff > 0 ? `in ${days}d` : `${days}d ago`;
}
