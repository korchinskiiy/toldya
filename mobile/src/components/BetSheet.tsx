import {useState} from "react";
import {
    Modal,
    View,
    Text,
    Pressable,
    TextInput,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
} from "react-native";
import {usePublicClient, useWriteContract} from "wagmi";
import {ALLOWED_CHAIN, HUB_ADDRESS, TOKEN_ADDRESS} from "../lib/chain";
import {hubAbi, erc20Abi} from "../lib/contracts";
import {parseTaiko, formatTaiko} from "../lib/format";
import {colors, radii} from "../lib/theme";
import {friendlyError} from "../lib/errors";

const QUICK_AMOUNTS = ["5", "10", "25", "100"];

export function BetSheet({
    visible,
    onClose,
    onSuccess,
    marketId,
    question,
    yesPct,
    noPct,
    pot,
    viewer,
}: {
    visible: boolean;
    onClose: () => void;
    onSuccess: () => void;
    marketId: bigint;
    question: string;
    yesPct: number;
    noPct: number;
    pot: bigint;
    viewer: `0x${string}`;
}) {
    const client = usePublicClient();
    const {writeContractAsync} = useWriteContract();
    const [amount, setAmount] = useState("10");
    const [busy, setBusy] = useState(false);
    const [stage, setStage] = useState("");
    const [err, setErr] = useState<string | null>(null);

    async function bet(side: 0 | 1) {
        if (!client) return;
        setBusy(true);
        setErr(null);
        try {
            const wei = parseTaiko(amount);

            setStage("Checking allowance");
            const allowance = (await client.readContract({
                address: TOKEN_ADDRESS,
                abi: erc20Abi,
                functionName: "allowance",
                args: [viewer, HUB_ADDRESS],
            })) as bigint;

            if (allowance < wei) {
                setStage("Approving (1/2)");
                const aHash = await writeContractAsync({
                    chainId: ALLOWED_CHAIN.id,
                    address: TOKEN_ADDRESS,
                    abi: erc20Abi,
                    functionName: "approve",
                    args: [HUB_ADDRESS, wei],
                });
                await client.waitForTransactionReceipt({hash: aHash});
            }

            setStage("Staking (2/2)");
            const hash = await writeContractAsync({
                chainId: ALLOWED_CHAIN.id,
                address: HUB_ADDRESS,
                abi: hubAbi,
                functionName: "stake",
                args: [marketId, side, wei],
            });
            await client.waitForTransactionReceipt({hash});

            onSuccess();
            onClose();
        } catch (e) {
            setErr(friendlyError(e, "bet failed"));
        } finally {
            setBusy(false);
            setStage("");
        }
    }

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                style={styles.backdrop}
            >
                <Pressable style={styles.backdropPress} onPress={onClose} />
                <View style={styles.sheet}>
                    <ScrollView keyboardShouldPersistTaps="handled">
                        <View style={styles.head}>
                            <View style={{flex: 1}}>
                                <Text style={styles.eyebrow}>PLACE A BET</Text>
                                <Text style={styles.title}>{question}</Text>
                            </View>
                            <Pressable onPress={onClose} disabled={busy} style={styles.closeBtn}>
                                <Text style={styles.closeBtnText}>✕</Text>
                            </Pressable>
                        </View>

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
                        <Text style={styles.pot}>{formatTaiko(pot)} mTAIKO in the pot</Text>

                        <Text style={styles.label}>Stake (mTAIKO)</Text>
                        <TextInput
                            style={styles.input}
                            keyboardType="decimal-pad"
                            value={amount}
                            onChangeText={setAmount}
                            editable={!busy}
                        />
                        <View style={styles.quickRow}>
                            {QUICK_AMOUNTS.map((v) => (
                                <Pressable
                                    key={v}
                                    style={styles.quickBtn}
                                    onPress={() => setAmount(v)}
                                    disabled={busy}
                                >
                                    <Text style={styles.quickBtnText}>{v}</Text>
                                </Pressable>
                            ))}
                        </View>

                        <View style={styles.actionRow}>
                            <Pressable
                                style={[styles.actionYes, busy && styles.disabled]}
                                onPress={() => bet(0)}
                                disabled={busy}
                            >
                                <Text style={styles.actionYesText}>
                                    {busy ? stage || "…" : `Bet ${amount} on YES`}
                                </Text>
                            </Pressable>
                            <Pressable
                                style={[styles.actionNo, busy && styles.disabled]}
                                onPress={() => bet(1)}
                                disabled={busy}
                            >
                                <Text style={styles.actionNoText}>
                                    {busy ? stage || "…" : `Bet ${amount} on NO`}
                                </Text>
                            </Pressable>
                        </View>

                        {err && <Text style={styles.err}>{err}</Text>}
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,15,15,0.32)"},
    backdropPress: {flex: 1},
    sheet: {
        backgroundColor: colors.bgElevated,
        borderTopLeftRadius: radii.lg,
        borderTopRightRadius: radii.lg,
        padding: 20,
        paddingBottom: 32,
        maxHeight: "85%",
    },
    head: {flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14},
    eyebrow: {
        fontSize: 11,
        fontWeight: "700",
        color: colors.textMuted,
        letterSpacing: 1.5,
        marginBottom: 4,
    },
    title: {fontSize: 17, fontWeight: "600", color: colors.text, lineHeight: 22},
    closeBtn: {padding: 4},
    closeBtnText: {fontSize: 18, color: colors.textMuted},
    bar: {flexDirection: "row", height: 40, borderRadius: radii.md, overflow: "hidden", marginBottom: 8},
    barYes: {backgroundColor: colors.yesBg, justifyContent: "center", paddingHorizontal: 10},
    barYesText: {color: colors.yesText, fontWeight: "700", fontSize: 13},
    barNo: {
        backgroundColor: colors.noBg,
        justifyContent: "center",
        alignItems: "flex-end",
        paddingHorizontal: 10,
    },
    barNoText: {color: colors.noText, fontWeight: "700", fontSize: 13},
    pot: {fontSize: 12, color: colors.textMuted, textAlign: "right", marginBottom: 16},
    label: {fontSize: 12, color: colors.textMuted, marginBottom: 6},
    input: {
        borderWidth: 1,
        borderColor: colors.borderStrong,
        borderRadius: radii.md,
        padding: 12,
        fontSize: 16,
        color: colors.text,
    },
    quickRow: {flexDirection: "row", gap: 6, marginTop: 8},
    quickBtn: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: colors.border,
    },
    quickBtnText: {color: colors.text, fontVariant: ["tabular-nums"] as never},
    actionRow: {flexDirection: "row", gap: 8, marginTop: 18},
    actionYes: {
        flex: 1,
        backgroundColor: colors.yesBg,
        borderWidth: 1,
        borderColor: "rgba(217, 119, 6, 0.40)",
        paddingVertical: 14,
        borderRadius: radii.md,
        alignItems: "center",
    },
    actionYesText: {color: colors.yesText, fontWeight: "700", fontSize: 14},
    actionNo: {
        flex: 1,
        backgroundColor: colors.noBg,
        borderWidth: 1,
        borderColor: "rgba(113, 113, 122, 0.40)",
        paddingVertical: 14,
        borderRadius: radii.md,
        alignItems: "center",
    },
    actionNoText: {color: colors.noText, fontWeight: "700", fontSize: 14},
    disabled: {opacity: 0.5},
    err: {color: colors.danger, fontSize: 13, marginTop: 12},
});
