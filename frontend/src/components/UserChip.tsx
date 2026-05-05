import {Avatar} from "@/lib/avatar";

export function UserChip({
    address,
    size = 24,
    bold = false,
}: {
    address: string;
    size?: number;
    bold?: boolean;
}) {
    return (
        <span className="user-chip">
            <Avatar address={address} size={size} />
            <span style={{fontWeight: bold ? 600 : 500}}>
                {address.slice(0, 6)}…{address.slice(-4)}
            </span>
        </span>
    );
}
