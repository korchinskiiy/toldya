"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {useAccount} from "wagmi";
import {Balance} from "./Balance";
import {ConnectButton} from "./ConnectButton";

export function Header() {
    const pathname = usePathname();
    const {address} = useAccount();

    const navItems = [
        {href: "/", label: "Feed", match: (p: string) => p === "/"},
        {href: "/markets", label: "Markets", match: (p: string) => p.startsWith("/markets")},
        {
            href: address ? `/profile/${address}` : "/profile",
            label: "Profile",
            match: (p: string) => p.startsWith("/profile"),
        },
    ];

    return (
        <header className="header">
            <div className="row" style={{gap: "1.5rem", flexWrap: "wrap"}}>
                <Link href="/" className="brand">
                    <span className="brand-dot" />
                    <span>toldya</span>
                </Link>
                <nav className="nav-links">
                    {navItems.map((item) => (
                        <Link
                            key={item.label}
                            href={item.href}
                            className={`nav-link ${item.match(pathname) ? "active" : ""}`}
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>
            </div>
            <div className="nav-actions">
                <Link href="/create" className="btn">
                    + new bet
                </Link>
                <Balance />
                <ConnectButton />
            </div>
        </header>
    );
}
