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
    Switch,
} from "react-native";
import {useAccount, usePublicClient, useSignMessage, useWriteContract} from "wagmi";
import {ALLOWED_CHAIN, HUB_ADDRESS, TOKEN_ADDRESS} from "../lib/chain";
import {hubAbi, erc20Abi} from "../lib/contracts";
import {parseTaiko} from "../lib/format";
import {colors, radii} from "../lib/theme";
import {friendlyError} from "../lib/errors";
import {
    buildOracleQuestionPinMessage,
    ORACLE_QUESTION_LIMITS,
    pinOracleQuestion,
    validateOracleQuestionText,
} from "../lib/oracleQuestion";

const EXAMPLES = [
    "Will Tom finish a beer in 30 seconds?",
    "Will it rain on Saturday?",
    "Will Marco be late to dinner?",
];

const QUICK_AMOUNTS = ["5", "10", "25", "100"];

export function CreateMarketSheet({
    visible,
    onClose,
    onSuccess,
}: {
    visible: boolean;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const {address} = useAccount();
    const client = usePublicClient();
    const {writeContractAsync} = useWriteContract();
    const {signMessageAsync} = useSignMessage();

    const [question, setQuestion] = useState("");
    const [criteria, setCriteria] = useState("");
    const [side, setSide] = useState<0 | 1>(1);
    const [amount, setAmount] = useState("10");
    // Default: 24 hours from now.
    const [hours, setHours] = useState("24");
    const [oracleFallback, setOracleFallback] = useState(false);
    const [busy, setBusy] = useState(false);
    const [stage, setStage] = useState("");
    const [err, setErr] = useState<string | null>(null);

    function reset() {
        setQuestion("");
        setCriteria("");
        setAmount("10");
        setHours("24");
        setSide(1);
        setOracleFallback(false);
        setErr(null);
        setStage("");
    }

    async function submit() {
        if (!client || !address) return;
        setBusy(true);
        setErr(null);
        try {
            if (oracleFallback) {
                const validation = validateOracleQuestionText({question, criteria});
                if (validation) throw new Error(validation);
            }
            const wei = parseTaiko(amount);
            const hoursNum = Number(hours);
            if (!Number.isFinite(hoursNum) || hoursNum <= 0) {
                throw new Error("Deadline must be at least 1 hour from now.");
            }
            const deadlineTs = BigInt(Math.floor(Date.now() / 1000) + Math.floor(hoursNum * 3600));

            setStage("Checking allowance");
            const allowance = (await client.readContract({
                address: TOKEN_ADDRESS,
                abi: erc20Abi,
                functionName: "allowance",
                args: [address, HUB_ADDRESS],
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

            let oracleQueryCid = "";
            if (oracleFallback) {
                setStage("Signing Veto oracle question");
                const message = buildOracleQuestionPinMessage({question, criteria});
                const signature = await signMessageAsync({message});
                setStage("Pinning Veto oracle question");
                oracleQueryCid = await pinOracleQuestion({question, criteria, address, signature});
            }

            setStage("Creating market (2/2)");
            const hash = await writeContractAsync({
                chainId: ALLOWED_CHAIN.id,
                address: HUB_ADDRESS,
                abi: hubAbi,
                functionName: "createMarket",
                args: [question, criteria, deadlineTs, side, wei, oracleFallback, oracleQueryCid],
            });
            await client.waitForTransactionReceipt({hash});

            reset();
            onSuccess();
            onClose();
        } catch (e) {
            setErr(friendlyError(e, "create failed"));
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
                                <Text style={styles.eyebrow}>NEW BET</Text>
                                <Text style={styles.title}>Open a market</Text>
                            </View>
                            <Pressable onPress={onClose} disabled={busy} style={styles.closeBtn}>
                                <Text style={styles.closeBtnText}>✕</Text>
                            </Pressable>
                        </View>

                        <Text style={styles.label}>What's the bet?</Text>
                        <TextInput
                            style={styles.input}
                            value={question}
                            onChangeText={setQuestion}
                            placeholder="Will Tom finish a beer in 30 seconds?"
                            placeholderTextColor={colors.textFaint}
                            editable={!busy}
                            multiline
                        />
                        <View style={styles.exampleRow}>
                            {EXAMPLES.map((ex) => (
                                <Pressable
                                    key={ex}
                                    style={styles.exampleBtn}
                                    onPress={() => setQuestion(ex)}
                                    disabled={busy}
                                >
                                    <Text style={styles.exampleBtnText} numberOfLines={1}>
                                        {ex}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>

                        <Text style={styles.label}>How will it be judged?</Text>
                        <TextInput
                            style={[styles.input, styles.textarea]}
                            value={criteria}
                            onChangeText={setCriteria}
                            placeholder="Tom drinks a 0.5L beer; YES if empty within 30s. Video as evidence."
                            placeholderTextColor={colors.textFaint}
                            editable={!busy}
                            multiline
                        />

                        <Text style={styles.label}>Deadline (hours from now)</Text>
                        <TextInput
                            style={styles.input}
                            value={hours}
                            onChangeText={setHours}
                            keyboardType="number-pad"
                            editable={!busy}
                        />

                        <Text style={styles.label}>Your side</Text>
                        <View style={styles.sideRow}>
                            <Pressable
                                style={[
                                    styles.sideBtn,
                                    side === 0 ? styles.sideYesActive : styles.sideInactive,
                                ]}
                                onPress={() => setSide(0)}
                                disabled={busy}
                            >
                                <Text style={[styles.sideBtnText, side === 0 && styles.sideYesText]}>
                                    YES
                                </Text>
                            </Pressable>
                            <Pressable
                                style={[
                                    styles.sideBtn,
                                    side === 1 ? styles.sideNoActive : styles.sideInactive,
                                ]}
                                onPress={() => setSide(1)}
                                disabled={busy}
                            >
                                <Text style={[styles.sideBtnText, side === 1 && styles.sideNoText]}>
                                    NO
                                </Text>
                            </Pressable>
                        </View>

                        <Text style={styles.label}>Stake (mTAIKO)</Text>
                        <TextInput
                            style={styles.input}
                            value={amount}
                            onChangeText={setAmount}
                            keyboardType="decimal-pad"
                            editable={!busy}
                        />
                        <View style={styles.exampleRow}>
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

                        <View style={styles.toggleRow}>
                            <Switch value={oracleFallback} onValueChange={setOracleFallback} disabled={busy} />
                            <Text style={styles.toggleLabel}>
                                Allow Veto oracle fallback if stakers disagree
                            </Text>
                        </View>
                        {oracleFallback && (
                            <Text style={styles.oracleHint}>
                                Veto sees question/criteria fixed at creation. Uploaded evidence is not
                                automatically sent to Veto. Limits: {ORACLE_QUESTION_LIMITS.question} question /{" "}
                                {ORACLE_QUESTION_LIMITS.criteria} criteria.
                            </Text>
                        )}

                        <Pressable
                            style={[
                                styles.submit,
                                (busy || !question || !criteria) && styles.disabled,
                            ]}
                            onPress={submit}
                            disabled={busy || !question || !criteria}
                        >
                            <Text style={styles.submitText}>
                                {busy
                                    ? stage || "Working…"
                                    : `Lock it in — ${amount} on ${side === 0 ? "YES" : "NO"}`}
                            </Text>
                        </Pressable>

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
        maxHeight: "92%",
    },
    head: {flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14},
    eyebrow: {
        fontSize: 11,
        fontWeight: "700",
        color: colors.textMuted,
        letterSpacing: 1.5,
        marginBottom: 4,
    },
    title: {fontSize: 18, fontWeight: "600", color: colors.text},
    closeBtn: {padding: 4},
    closeBtnText: {fontSize: 18, color: colors.textMuted},
    label: {fontSize: 12, color: colors.textMuted, marginTop: 14, marginBottom: 6},
    input: {
        borderWidth: 1,
        borderColor: colors.borderStrong,
        borderRadius: radii.md,
        padding: 12,
        fontSize: 15,
        color: colors.text,
    },
    textarea: {minHeight: 80, textAlignVertical: "top"},
    exampleRow: {flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6},
    exampleBtn: {
        backgroundColor: colors.bgHover,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: radii.pill,
        maxWidth: "100%",
    },
    exampleBtnText: {color: colors.textMuted, fontSize: 12, fontStyle: "italic"},
    quickBtn: {
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: radii.pill,
    },
    quickBtnText: {color: colors.text, fontVariant: ["tabular-nums"] as never},
    sideRow: {flexDirection: "row", gap: 8},
    sideBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: radii.md,
        alignItems: "center",
        borderWidth: 1,
    },
    sideInactive: {borderColor: colors.border, backgroundColor: colors.bgHover},
    sideYesActive: {backgroundColor: colors.yesBg, borderColor: "rgba(217, 119, 6, 0.40)"},
    sideNoActive: {backgroundColor: colors.noBg, borderColor: "rgba(113, 113, 122, 0.40)"},
    sideBtnText: {fontWeight: "700", color: colors.textMuted},
    sideYesText: {color: colors.yesText},
    sideNoText: {color: colors.noText},
    toggleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginTop: 16,
    },
    toggleLabel: {flex: 1, color: colors.textMuted, fontSize: 13, lineHeight: 18},
    oracleHint: {color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 8},
    submit: {
        marginTop: 20,
        backgroundColor: colors.accent,
        paddingVertical: 14,
        borderRadius: radii.md,
        alignItems: "center",
    },
    submitText: {color: "#fff", fontWeight: "700", fontSize: 15},
    disabled: {opacity: 0.5},
    err: {color: colors.danger, fontSize: 13, marginTop: 12},
});
