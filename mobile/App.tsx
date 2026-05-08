import "react-native-get-random-values";
import "./src/lib/appkit";
import {WagmiProvider} from "wagmi";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {wagmiConfig} from "./src/lib/appkit";
import {HomeScreen} from "./src/screens/HomeScreen";

const queryClient = new QueryClient();

export default function App() {
    return (
        <WagmiProvider config={wagmiConfig}>
            <QueryClientProvider client={queryClient}>
                <HomeScreen />
            </QueryClientProvider>
        </WagmiProvider>
    );
}
