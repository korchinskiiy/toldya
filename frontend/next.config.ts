import type {NextConfig} from "next";

const nextConfig: NextConfig = {
    reactStrictMode: true,
    webpack: (config) => {
        // Silence "Module not found" warnings from wagmi's optional peer deps
        // (MetaMask SDK + WalletConnect's logger pull in mobile/dev-only modules
        //  that we don't actually need in this app).
        config.externals.push("pino-pretty", "lokijs", "encoding");
        return config;
    },
};

export default nextConfig;
