import "@walletconnect/react-native-compat";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {WagmiAdapter} from "@reown/appkit-wagmi-react-native";
import {createAppKit} from "@reown/appkit-react-native";
import {authConnector} from "@reown/appkit-auth-wagmi-react-native";
import {ALLOWED_CHAIN, REOWN_PROJECT_ID} from "./chain";

const metadata = {
    name: "toldya",
    description:
        "P2P prediction markets for everyday bets between friends. Open a YES/NO " +
        "market, friends stake TAIKO, an AI agent settles after the deadline.",
    url: "https://toldya-nine.vercel.app",
    icons: ["https://toldya-nine.vercel.app/icon.svg"],
    redirect: {
        native: "toldya://",
        universal: "https://toldya-nine.vercel.app",
    },
};

const auth = authConnector({
    projectId: REOWN_PROJECT_ID,
    metadata,
});

export const wagmiAdapter = new WagmiAdapter({
    networks: [ALLOWED_CHAIN] as never,
    projectId: REOWN_PROJECT_ID,
    connectors: [auth as never],
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;

createAppKit({
    projectId: REOWN_PROJECT_ID,
    metadata,
    adapters: [wagmiAdapter],
    networks: [ALLOWED_CHAIN] as never,
    defaultNetwork: ALLOWED_CHAIN as never,
    storage: AsyncStorage as never,
    // Reown's RN v2 types are still landing — features.email and features.socials
    // are exposed by the runtime but not in the published TS types yet, so we
    // cast through `unknown` here. Drop this when @reown/appkit-react-native
    // re-exports its proper Features type.
    features: {
        email: true,
        socials: ["google"],
    } as unknown as never,
});
