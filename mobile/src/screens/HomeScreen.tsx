import {useEffect, useState} from "react";
import {
    SafeAreaView,
    View,
    Text,
    Pressable,
    ScrollView,
    StyleSheet,
    ActivityIndicator,
    StatusBar,
} from "react-native";
import {createPublicClient, http} from "viem";
import {useAccount} from "wagmi";
import {AppKit, AppKitButton, useAppKit} from "@reown/appkit-react-native";
import {ALLOWED_CHAIN, HUB_ADDRESS} from "../lib/chain";
import {hubAbi} from "../lib/contracts";
import {deadlineLabel, formatTaiko} from "../lib/format";

const STATUS_LABEL = ["Live", "Resolving", "YES won", "NO won", "Voided"];

type Market = {
    id: bigint;
    creator: `0x${string}`;
    deadline: bigint;
    status: number;
    oracleEnabled: boolean;
    question: string;
    criteria: string;
    yesPool: bigint;
    noPool: bigint;
};

const publicClient = createPublicClient({
    chain: ALLOWED_CHAIN,
    transport: http(),
});

export function HomeScreen() {
    const {isConnected, address} = useAccount();
    const {open} = useAppKit();
    const [markets, setMarkets] = useState<Market[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
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
                if (!cancelled) setMarkets(fetched.reverse());
            } catch (err) {
                console.error("market fetch failed", err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

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

            <ScrollView contentContainerStyle={styles.scroll}>
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

                {loading ? (
                    <ActivityIndicator color="#d97706" style={{marginTop: 32}} />
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
                            <MarketRow key={m.id.toString()} market={m} />
                        ))}
                    </View>
                )}
            </ScrollView>

            <AppKit />
        </SafeAreaView>
    );
}

function MarketRow({market}: {market: Market}) {
    const total = market.yesPool + market.noPool;
    const yesPct =
        total === 0n ? 50 : Number((market.yesPool * 10000n) / total) / 100;
    const noPct = 100 - yesPct;
    const past = Number(market.deadline) * 1000 < Date.now();

    return (
        <View style={styles.card}>
            <View style={styles.cardTop}>
                <View style={styles.pillRow}>
                    <View
                        style={[
                            styles.pill,
                            market.status === 0 && styles.pillLive,
                            market.status === 2 && styles.pillYes,
                            market.status === 3 && styles.pillNo,
                        ]}
                    >
                        <Text style={styles.pillText}>
                            {STATUS_LABEL[market.status]}
                        </Text>
                    </View>
                    <View style={styles.pill}>
                        <Text style={styles.pillText}>
                            {past ? "deadline passed" : `closes ${deadlineLabel(market.deadline)}`}
                        </Text>
                    </View>
                </View>
                <View style={{alignItems: "flex-end"}}>
                    <Text style={styles.potNum}>{formatTaiko(total)}</Text>
                    <Text style={styles.potTok}>mTAIKO pot</Text>
                </View>
            </View>
            <Text style={styles.q}>{market.question}</Text>
            <View style={styles.bar}>
                {yesPct > 0 && (
                    <View style={[styles.barYes, {flex: yesPct}]}>
                        <Text style={styles.barYesText}>YES {yesPct.toFixed(0)}%</Text>
                    </View>
                )}
                {noPct > 0 && (
                    <View style={[styles.barNo, {flex: noPct}]}>
                        <Text style={styles.barNoText}>NO {noPct.toFixed(0)}%</Text>
                    </View>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    safe: {flex: 1, backgroundColor: "#fafaf7"},
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 18,
        paddingTop: 8,
        paddingBottom: 16,
    },
    brandRow: {flexDirection: "row", alignItems: "center", gap: 8},
    brandDot: {width: 10, height: 10, borderRadius: 5, backgroundColor: "#d97706"},
    brand: {fontSize: 22, fontWeight: "700", letterSpacing: -0.5, color: "#0d0d0d"},
    scroll: {paddingHorizontal: 18, paddingBottom: 60},
    hero: {
        backgroundColor: "#fff",
        borderRadius: 18,
        padding: 28,
        alignItems: "center",
        marginBottom: 18,
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 16,
        shadowOffset: {width: 0, height: 4},
        elevation: 2,
    },
    heroTitle: {
        fontSize: 30,
        fontWeight: "700",
        letterSpacing: -1,
        color: "#0d0d0d",
        textAlign: "center",
        lineHeight: 34,
    },
    heroSub: {
        marginTop: 14,
        marginBottom: 22,
        fontSize: 15,
        color: "#6b6b6b",
        textAlign: "center",
        lineHeight: 22,
    },
    cta: {
        backgroundColor: "#d97706",
        paddingHorizontal: 28,
        paddingVertical: 14,
        borderRadius: 999,
    },
    ctaText: {color: "#fff", fontSize: 16, fontWeight: "600"},
    heroFoot: {marginTop: 16, fontSize: 12, color: "#9a9a9a"},
    emptyCard: {
        backgroundColor: "#fff",
        borderRadius: 18,
        padding: 28,
        alignItems: "center",
        shadowColor: "#000",
        shadowOpacity: 0.04,
        shadowRadius: 12,
        shadowOffset: {width: 0, height: 2},
        elevation: 1,
    },
    emptyTitle: {fontSize: 17, fontWeight: "700", color: "#0d0d0d", marginBottom: 8},
    emptySub: {fontSize: 14, color: "#6b6b6b", textAlign: "center"},
    sectionH: {fontSize: 15, fontWeight: "700", color: "#0d0d0d", marginBottom: 12},
    card: {
        backgroundColor: "#fff",
        borderRadius: 18,
        padding: 20,
        marginBottom: 12,
        shadowColor: "#000",
        shadowOpacity: 0.04,
        shadowRadius: 12,
        shadowOffset: {width: 0, height: 2},
        elevation: 1,
    },
    cardTop: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 12,
    },
    pillRow: {flexDirection: "row", gap: 6, flexWrap: "wrap", flex: 1},
    pill: {
        backgroundColor: "#f4f4f0",
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
    },
    pillLive: {backgroundColor: "rgba(217, 119, 6, 0.10)"},
    pillYes: {backgroundColor: "rgba(217, 119, 6, 0.10)"},
    pillNo: {backgroundColor: "rgba(113, 113, 122, 0.10)"},
    pillText: {fontSize: 12, fontWeight: "600", color: "#6b6b6b"},
    potNum: {fontSize: 24, fontWeight: "700", color: "#0d0d0d", letterSpacing: -0.5},
    potTok: {fontSize: 11, color: "#6b6b6b"},
    q: {fontSize: 18, fontWeight: "600", color: "#0d0d0d", lineHeight: 24, marginBottom: 14},
    bar: {flexDirection: "row", height: 44, borderRadius: 12, overflow: "hidden"},
    barYes: {
        backgroundColor: "#fde68a",
        justifyContent: "center",
        paddingHorizontal: 12,
    },
    barYesText: {color: "#78350f", fontWeight: "700"},
    barNo: {
        backgroundColor: "#d4d4d8",
        justifyContent: "center",
        alignItems: "flex-end",
        paddingHorizontal: 12,
    },
    barNoText: {color: "#27272a", fontWeight: "700"},
});
