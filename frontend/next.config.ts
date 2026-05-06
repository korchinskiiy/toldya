import type {NextConfig} from "next";

const nextConfig: NextConfig = {
    reactStrictMode: true,
    webpack: (config) => {
        // Wagmi pulls in MetaMask SDK + WalletConnect's logger, which optionally
        // load mobile/dev-only modules we don't use. Mark them external so the
        // bundler doesn't try (and warn loudly) to resolve them.
        config.externals.push(
            "pino-pretty",
            "lokijs",
            "encoding",
            "@react-native-async-storage/async-storage",
        );
        return config;
    },
    images: {
        // User-uploaded evidence is hosted on Vercel Blob.
        remotePatterns: [
            {protocol: "https", hostname: "*.public.blob.vercel-storage.com"},
        ],
    },
};

export default nextConfig;
