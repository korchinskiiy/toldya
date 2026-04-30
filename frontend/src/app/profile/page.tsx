"use client";

import {useEffect} from "react";
import {useRouter} from "next/navigation";
import {useAccount} from "wagmi";
import {Header} from "@/components/Header";

export default function ProfileRedirect() {
    const {address} = useAccount();
    const router = useRouter();

    useEffect(() => {
        if (address) router.replace(`/profile/${address}`);
    }, [address, router]);

    return (
        <div className="container">
            <Header />
            {!address ? (
                <div className="empty">
                    <p>Connect your wallet to see your profile.</p>
                </div>
            ) : (
                <p className="muted">Loading…</p>
            )}
        </div>
    );
}
