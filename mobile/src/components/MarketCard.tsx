import {useState} from "react";
import {View, Text, Pressable, StyleSheet, Share} from "react-native";
import {usePublicClient, useReadContract, useWriteContract} from "wagmi";
import {ALLOWED_CHAIN, HUB_ADDRESS} from "../lib/chain";
import {hubAbi} from "../lib/contracts";
import {deadlineLabel, formatTaiko} from "../lib/format";
import {colors, radii, shadow} from "../lib/theme";
import {friendlyError} from "../lib/errors";
import {BetSheet} from "./BetSheet";

const STATUS_LABEL = ["Live", "Resolving", "YES won", "NO won", "Voided"];

export type Market = {
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

export function MarketCard({
    market,
    viewer,
    onChange,
}: {
    market: Market;
    viewer?: `0x${string}`;
    onChange: () => void;
}) {
    const client = usePublicClient();
    const {writeContractAsync} = useWriteContract();
    const [betOpen, setBetOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const {data: stakers} = useReadContract({
        chainId: ALLOWED_CHAIN.id,
        address: HUB_ADDRESS,
        abi: hubAbi,
        functionName: "getStakers",
        args: [market.id],
        query: {refetchInterval: 6000},
    });
    const stakerList = (stakers as readonly `0x${string}`[] | undefined) ?? [];

    const {data: claimable} = useReadContract({
        chainId: ALLOWED_CHAIN.id,
        address: HUB_ADDRESS,
        abi: hubAbi,
        functionName: "previewClaim",
        args: viewer ? [market.id, viewer] : undefined,
        query: {enabled: Boolean(viewer), refetchInterval: 6000},
    });

    const total = market.yesPool + market.noPool;
    const yesPct = total === 0n ? 50 : Number((market.yesPool * 10000n) / total) / 100;
    const noPct = 100 - yesPct;
    const past = Number(market.deadline) * 1000 < Date.now();
    const isOpen = market.status === 0;
    const resolved = market.status >= 2;
    const isStaker = Boolean(
        viewer && stakerList.map((a) => a.toLowerCase()).includes(viewer.toLowerCase()),
    );
    const userClaim = (claimable as bigint | undefined) ?? 0n;

    async function vote(yesWon: boolean) {
        if (!client) return;
        setBusy(true);
        setErr(null);
        try {
            const hash = await writeContractAsync({
                chainId: ALLOWED_CHAIN.id,
                address: HUB_ADDRESS,
                abi: hubAbi,
                functionName: "voteResolution",
                args: [market.id, yesWon],
            });
            await client.waitForTransactionReceipt({hash});
            onChange();
        } catch (e) {
            setErr(friendlyError(e, "vote failed"));
        } finally {
            setBusy(false);
        }
    }

    async function claim() {
        if (!client) return;
        setBusy(true);
        setErr(null);
        try {
            const hash = await writeContractAsync({
                chainId: ALLOWED_CHAIN.id,
                address: HUB_ADDRESS,
                abi: hubAbi,
                functionName: "claim",
                args: [market.id],
            });
            await client.waitForTransactionReceipt({hash});
            onChange();
        } catch (e) {
            setErr(friendlyError(e, "claim failed"));
        } finally {
            setBusy(false);
        }
    }

    async function share() {
        try {
            await Share.share({
                message: `“${market.question}” — settle this bet on toldya: https://toldya-nine.vercel.app/#market-${market.id.toString()}`,
            });
        } catch {
            // user cancelled — no-op.
        }
    }

    const statusPillStyle =
        market.status === 0
            ? styles.pillLive
            : market.status === 2
            ? styles.pillYes
            : market.status === 3
            ? styles.pillNo
            : styles.pillNeutral;

    return (
        <View style={[styles.card, market.status === 2 && styles.cardYesResolved, market.status === 3 && styles.cardNoResolved]}>
            {market.status === 2 && (
                <View style={[styles.banner, styles.bannerYes]}>
                    <Text style={styles.bannerYesText}>
                        YES won — {formatTaiko(total)} mTAIKO paid out
                    </Text>
                </View>
            )}
            {market.status === 3 && (
                <View style={[styles.banner, styles.bannerNo]}>
                    <Text style={styles.bannerNoText}>
                        NO won — {formatTaiko(total)} mTAIKO paid out
                    </Text>
                </View>
            )}
            {market.status === 4 && (
                <View style={[styles.banner, styles.bannerVoided]}>
                    <Text style={styles.bannerVoidedText}>Voided — stakes refunded</Text>
                </View>
            )}

            <View style={styles.top}>
                <View style={styles.pillRow}>
                    <View style={[styles.pill, statusPillStyle]}>
                        <Text style={styles.pillText}>{STATUS_LABEL[market.status]}</Text>
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
                        {yesPct >= 18 && (
                            <Text style={styles.barYesText}>YES {yesPct.toFixed(0)}%</Text>
                        )}
                    </View>
                )}
                {noPct > 0 && (
                    <View style={[styles.barNo, {flex: noPct}]}>
                        {noPct >= 18 && (
                            <Text style={styles.barNoText}>NO {noPct.toFixed(0)}%</Text>
                        )}
                    </View>
                )}
            </View>

            {/* Resolved + claim available */}
            {viewer && resolved && userClaim > 0n && (
                <Pressable
                    style={[styles.claim, busy && styles.disabled]}
                    onPress={claim}
                    disabled={busy}
                >
                    <Text style={styles.claimText}>
                        {busy ? "…" : `Claim ${formatTaiko(userClaim)} mTAIKO`}
                    </Text>
                </Pressable>
            )}

            {/* Staker on open market: vote/settle */}
            {viewer && isOpen && isStaker && (
                <View style={{marginTop: 14}}>
                    <Text style={styles.actionLabel}>
                        {past ? "Time for a verdict." : "Already know the answer?"}
                    </Text>
                    <View style={styles.voteRow}>
                        <Pressable
                            style={[styles.voteYes, busy && styles.disabled]}
                            onPress={() => vote(true)}
                            disabled={busy}
                        >
                            <Text style={styles.voteYesText}>{busy ? "…" : "Vote YES"}</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.voteNo, busy && styles.disabled]}
                            onPress={() => vote(false)}
                            disabled={busy}
                        >
                            <Text style={styles.voteNoText}>{busy ? "…" : "Vote NO"}</Text>
                        </Pressable>
                    </View>
                    <Text style={styles.tip}>
                        Settles instantly once every bettor agrees. You can change your vote.
                    </Text>
                </View>
            )}

            <View style={styles.foot}>
                <Text style={styles.bettors}>
                    {stakerList.length} {stakerList.length === 1 ? "bettor" : "bettors"}
                </Text>
                <View style={styles.footActions}>
                    {viewer && isOpen && !past && !isStaker && (
                        <Pressable style={styles.footPrimary} onPress={() => setBetOpen(true)}>
                            <Text style={styles.footPrimaryText}>Place a bet</Text>
                        </Pressable>
                    )}
                    <Pressable style={styles.footGhost} onPress={share}>
                        <Text style={styles.footGhostText}>Share</Text>
                    </Pressable>
                </View>
            </View>

            {err && <Text style={styles.err}>{err}</Text>}

            {viewer && (
                <BetSheet
                    visible={betOpen}
                    onClose={() => setBetOpen(false)}
                    onSuccess={onChange}
                    marketId={market.id}
                    question={market.question}
                    yesPct={yesPct}
                    noPct={noPct}
                    pot={total}
                    viewer={viewer}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.bgElevated,
        borderRadius: radii.lg,
        padding: 18,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
        ...shadow.soft,
    },
    cardYesResolved: {borderTopWidth: 2, borderTopColor: "rgba(217, 119, 6, 0.40)"},
    cardNoResolved: {borderTopWidth: 2, borderTopColor: "rgba(113, 113, 122, 0.40)"},
    banner: {
        marginHorizontal: -18,
        marginTop: -18,
        marginBottom: 14,
        paddingHorizontal: 18,
        paddingVertical: 10,
    },
    bannerYes: {backgroundColor: "#fef3c7", borderBottomWidth: 1, borderBottomColor: "rgba(217, 119, 6, 0.40)"},
    bannerYesText: {color: colors.yesText, fontWeight: "700", fontSize: 13},
    bannerNo: {backgroundColor: "#f4f4f5", borderBottomWidth: 1, borderBottomColor: "rgba(113, 113, 122, 0.40)"},
    bannerNoText: {color: colors.noText, fontWeight: "700", fontSize: 13},
    bannerVoided: {backgroundColor: colors.bgHover},
    bannerVoidedText: {color: colors.textMuted, fontWeight: "600", fontSize: 13},
    top: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 12,
        gap: 8,
    },
    pillRow: {flexDirection: "row", gap: 6, flexWrap: "wrap", flex: 1},
    pill: {
        backgroundColor: colors.bgHover,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: radii.pill,
    },
    pillLive: {backgroundColor: colors.accentBg},
    pillYes: {backgroundColor: colors.accentBg},
    pillNo: {backgroundColor: "rgba(113, 113, 122, 0.10)"},
    pillNeutral: {},
    pillText: {fontSize: 12, fontWeight: "600", color: colors.textMuted},
    potNum: {fontSize: 24, fontWeight: "700", color: colors.text, letterSpacing: -0.5, fontVariant: ["tabular-nums"] as never},
    potTok: {fontSize: 11, color: colors.textMuted},
    q: {fontSize: 17, fontWeight: "600", color: colors.text, lineHeight: 23, marginBottom: 12},
    bar: {flexDirection: "row", height: 44, borderRadius: radii.md, overflow: "hidden"},
    barYes: {backgroundColor: colors.yesBg, justifyContent: "center", paddingHorizontal: 12},
    barYesText: {color: colors.yesText, fontWeight: "700"},
    barNo: {
        backgroundColor: colors.noBg,
        justifyContent: "center",
        alignItems: "flex-end",
        paddingHorizontal: 12,
    },
    barNoText: {color: colors.noText, fontWeight: "700"},
    actionLabel: {fontSize: 13, color: colors.text, fontWeight: "600", marginBottom: 8},
    voteRow: {flexDirection: "row", gap: 8},
    voteYes: {
        flex: 1,
        backgroundColor: colors.yesBg,
        borderWidth: 1,
        borderColor: "rgba(217, 119, 6, 0.40)",
        paddingVertical: 12,
        borderRadius: radii.md,
        alignItems: "center",
    },
    voteYesText: {color: colors.yesText, fontWeight: "700"},
    voteNo: {
        flex: 1,
        backgroundColor: colors.noBg,
        borderWidth: 1,
        borderColor: "rgba(113, 113, 122, 0.40)",
        paddingVertical: 12,
        borderRadius: radii.md,
        alignItems: "center",
    },
    voteNoText: {color: colors.noText, fontWeight: "700"},
    tip: {fontSize: 11, color: colors.textFaint, marginTop: 8},
    claim: {
        marginTop: 12,
        backgroundColor: colors.accent,
        paddingVertical: 14,
        borderRadius: radii.md,
        alignItems: "center",
    },
    claimText: {color: "#fff", fontWeight: "700", fontSize: 15},
    foot: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 14,
    },
    bettors: {fontSize: 13, color: colors.textMuted},
    footActions: {flexDirection: "row", gap: 6},
    footPrimary: {
        backgroundColor: colors.accent,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: radii.pill,
    },
    footPrimaryText: {color: "#fff", fontSize: 13, fontWeight: "600"},
    footGhost: {paddingHorizontal: 10, paddingVertical: 7},
    footGhostText: {color: colors.text, fontSize: 13},
    disabled: {opacity: 0.5},
    err: {color: colors.danger, fontSize: 13, marginTop: 10},
});
