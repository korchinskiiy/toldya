// Deterministic, dependency-free avatar: two soft circles + a base hue, all
// derived from a hash of the address. Same address → same avatar everywhere.

function hashAddress(addr: string, salt: number): number {
    let h = 2166136261 ^ salt;
    const lower = addr.toLowerCase();
    for (let i = 0; i < lower.length; i++) {
        h ^= lower.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function hslFor(addr: string, salt: number): string {
    const h = hashAddress(addr, salt);
    const hue = h % 360;
    const sat = 60 + (h % 25);
    const light = 50 + ((h >> 4) % 18);
    return `hsl(${hue} ${sat}% ${light}%)`;
}

export function Avatar({address, size = 36}: {address: string; size?: number}) {
    const c1 = hslFor(address, 1);
    const c2 = hslFor(address, 2);
    const c3 = hslFor(address, 3);
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 36 36"
            style={{
                borderRadius: "50%",
                flexShrink: 0,
                display: "block",
                background: c1,
            }}
            aria-hidden
        >
            <circle cx="26" cy="11" r="14" fill={c2} opacity="0.85" />
            <circle cx="8" cy="26" r="13" fill={c3} opacity="0.75" />
        </svg>
    );
}
