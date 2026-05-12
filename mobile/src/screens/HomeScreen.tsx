import {useCallback, useEffect, useState} from "react";
import {
    SafeAreaView,
    View,
    Text,
    Pressable,
    ScrollView,
    StyleSheet,
    ActivityIndicator,
    StatusBar,
    RefreshControl,
} from "react-native";
import {createPublicClient, http} from "viem";
import {useAccount, useChainId} from "wagmi";
import {AppKit, AppKitButton, useAppKit} from "../components/WalletGate";
import {ALLOWED_CHAIN, HUB_ADDRESS} from "../lib/chain";
import {hubAbi} from "../lib/contracts";
import {colors, radii, shadow} from "../lib/theme";
import {MarketCard, type Market} from "../components/MarketCard";
import {OnboardingPanel} from "../components/OnboardingPanel";
import {CreateMarketSheet} from "../components/CreateMarketSheet";

const publicClient = createPublicClient({
    chain: ALLOWED_CHAIN,
    transport: http(),
});

export function HomeScreen() {
    const {isConnected, address} = useAccount();
    const chainId = useChainId();
    const onRightChain = chainId === ALLOWED_CHAIN.id;
    const {open} = useAppKit();
    const [markets, setMarkets] = useState<Market[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);

    const loadMarkets = useCallback(async () => {
        try {
            const next = (await publicClient.readContract({
                address: HUB_ADDRESS,
                abi: hubAbi,
                functionName: "nextMarketId",
            })) as bigint;
            const ids = Array.from({length: Number(next)}, (_, i) => BigInt(i));
            const fetched = await Promise.all(
                ids.map(async (id) => {
                    const m = (await publicClient.readContract({
                        address: HUB_ADDRESS,
                        abi: hubAbi,
                        functionName: "getMarket",
                        args: [id],
                    })) as Market;
                    return {...m, id};
                }),
            );
            setMarkets(fetched.reverse());
        } catch (err) {
            console.error("market fetch failed", err);
        }
    }, []);

    useEffect(() => {
        (async () => {
            await loadMarkets();
            setLoading(false);
        })();
    }, [loadMarkets]);

    async function refresh() {
        setRefreshing(true);
        await loadMarkets();
        setRefreshing(false);
    }

    return (
        <SafeAreaView style={styles.safe}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.header}>
                <View style={styles.brandRow}>
                    <View style={styles.brandDot} />
                    <Text style={styles.brand}>toldya</Text>
                </View>
                <AppKitButton balance="show" />
            </View>

            <ScrollView
                contentContainerStyle={styles.scroll}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
                }
            >
                {!isConnected && (
                    <View style={styles.hero}>
                        <Text style={styles.heroTitle}>Settle the bet.</Text>
                        <Text style={styles.heroTitle}>Skip the argument.</Text>
                        <Text style={styles.heroSub}>
                            Sign in with Google or email. Open a YES/NO market, friends
                            stake, an AI agent settles it.
                        </Text>
                        <Pressable style={styles.cta} onPress={() => open()}>
                            <Text style={styles.ctaText}>Sign in</Text>
                        </Pressable>
                        <Text style={styles.heroFoot}>No wallet needed · Built on Taiko</Text>
                    </View>
                )}

                {isConnected && !onRightChain && (
                    <View style={styles.warnCard}>
                        <Text style={styles.warnTitle}>Wrong network</Text>
                        <Text style={styles.warnSub}>
                            Your wallet is on chain {chainId}. Switch to {ALLOWED_CHAIN.name} (chain{" "}
                            {ALLOWED_CHAIN.id}) to use toldya.
                        </Text>
                    </View>
                )}

                {isConnected && onRightChain && address && (
                    <>
                        <OnboardingPanel address={address} />
                        <Pressable style={styles.newBtn} onPress={() => setCreateOpen(true)}>
                            <Text style={styles.newBtnText}>+ Open a new market</Text>
                        </Pressable>
                    </>
                )}

                {loading ? (
                    <ActivityIndicator color={colors.accent} style={{marginTop: 32}} />
                ) : markets.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyTitle}>No bets yet — start one.</Text>
                        <Text style={styles.emptySub}>
                            A good toldya bet is short, judgeable, and has a real deadline.
                        </Text>
                    </View>
                ) : (
                    <View>
                        <Text style={styles.sectionH}>Live bets</Text>
                        {markets.map((m) => (
                            <MarketCard
                                key={m.id.toString()}
                                market={m}
                                viewer={isConnected && onRightChain ? address : undefined}
                                onChange={refresh}
                            />
                        ))}
                    </View>
                )}
            </ScrollView>

            {address && (
                <CreateMarketSheet
                    visible={createOpen}
                    onClose={() => setCreateOpen(false)}
                    onSuccess={refresh}
                />
            )}

            <AppKit />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: {flex: 1, backgroundColor: colors.bg},
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 18,
        paddingTop: 8,
        paddingBottom: 16,
    },
    brandRow: {flexDirection: "row", alignItems: "center", gap: 8},
    brandDot: {width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent},
    brand: {fontSize: 22, fontWeight: "700", letterSpacing: -0.5, color: colors.text},
    scroll: {paddingHorizontal: 18, paddingBottom: 60},
    hero: {
        backgroundColor: colors.bgElevated,
        borderRadius: radii.lg,
        padding: 28,
        alignItems: "center",
        marginBottom: 18,
        ...shadow.card,
    },
    heroTitle: {
        fontSize: 30,
        fontWeight: "700",
        letterSpacing: -1,
        color: colors.text,
        textAlign: "center",
        lineHeight: 34,
    },
    heroSub: {
        marginTop: 14,
        marginBottom: 22,
        fontSize: 15,
        color: colors.textMuted,
        textAlign: "center",
        lineHeight: 22,
    },
    cta: {
        backgroundColor: colors.accent,
        paddingHorizontal: 28,
        paddingVertical: 14,
        borderRadius: radii.pill,
    },
    ctaText: {color: "#fff", fontSize: 16, fontWeight: "600"},
    heroFoot: {marginTop: 16, fontSize: 12, color: colors.textFaint},
    warnCard: {
        backgroundColor: colors.bgElevated,
        borderColor: "rgba(220, 38, 38, 0.40)",
        borderWidth: 1,
        borderRadius: radii.lg,
        padding: 18,
        marginBottom: 14,
    },
    warnTitle: {fontSize: 15, fontWeight: "700", color: colors.danger, marginBottom: 4},
    warnSub: {color: colors.textMuted, fontSize: 13, lineHeight: 18},
    newBtn: {
        backgroundColor: colors.accent,
        paddingVertical: 14,
        borderRadius: radii.md,
        alignItems: "center",
        marginBottom: 14,
    },
    newBtnText: {color: "#fff", fontWeight: "700", fontSize: 15},
    emptyCard: {
        backgroundColor: colors.bgElevated,
        borderRadius: radii.lg,
        padding: 28,
        alignItems: "center",
        ...shadow.soft,
    },
    emptyTitle: {fontSize: 17, fontWeight: "700", color: colors.text, marginBottom: 8},
    emptySub: {fontSize: 14, color: colors.textMuted, textAlign: "center"},
    sectionH: {fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: 12, marginTop: 4},
});
