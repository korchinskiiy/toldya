export function friendlyError(e: unknown, fallback: string): string {
    const raw = e instanceof Error ? e.message : "";
    const first = raw.split("\n")[0] || fallback;
    if (/insufficient funds|exceeds the balance|cannot estimate gas/i.test(raw)) {
        return "You're out of Hoodi ETH for gas. Top up via the faucet above.";
    }
    if (/user rejected|user denied|cancelled/i.test(raw)) {
        return "Cancelled in your wallet.";
    }
    return first;
}
