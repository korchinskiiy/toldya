import type {Metadata, Viewport} from "next";
import {Providers} from "./providers";
import "./globals.css";

const TITLE = "toldya — settle the bet";
const DESCRIPTION =
    "Open a YES/NO market with friends, stake TAIKO, an AI agent settles it after the deadline. No app, no signup, no opinions.";

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    applicationName: "toldya",
    keywords: [
        "prediction market",
        "peer-to-peer",
        "TAIKO",
        "friends",
        "betting",
        "onchain",
    ],
    openGraph: {
        title: TITLE,
        description: DESCRIPTION,
        type: "website",
        siteName: "toldya",
    },
    twitter: {
        card: "summary_large_image",
        title: TITLE,
        description: DESCRIPTION,
    },
    robots: {index: true, follow: true},
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    themeColor: "#08080c",
};

export default function RootLayout({children}: {children: React.ReactNode}) {
    return (
        <html lang="en">
            <body>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
