// Web stub — AppKit RN's native modules don't bundle for web. The site at
// toldya-nine.vercel.app is the canonical web experience; this stub exists so
// `expo start --web` can render the UI shell for previewing without auth.

import {http, createConfig} from "wagmi";
import {ALLOWED_CHAIN} from "./chain";

export const wagmiConfig = createConfig({
    chains: [ALLOWED_CHAIN],
    transports: {[ALLOWED_CHAIN.id]: http()},
});
