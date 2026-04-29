import Link from "next/link";
import {ConnectButton} from "./ConnectButton";

export function Header() {
    return (
        <div className="header">
            <div className="row" style={{gap: "1.5rem"}}>
                <Link href="/" className="brand" style={{color: "white"}}>
                    toldya
                </Link>
                <Link href="/create">+ new market</Link>
            </div>
            <ConnectButton />
        </div>
    );
}
