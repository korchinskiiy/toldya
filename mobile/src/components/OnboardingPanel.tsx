import {useState} from "react";
import {
    View,
    Text,
    Pressable,
    StyleSheet,
    Linking,
    Alert,
    Platform,
    Share,
} from "react-native";
import {useBalance, useReadContract, useWriteContract} from "wagmi";
import {usePublicClient} from "wagmi";
import {formatUnits} from "viem";
import {ALLOWED_CHAIN, HUB_ADDRESS, TOKEN_ADDRESS} from "../lib/chain";
import {erc20Abi} from "../lib/contracts";
import {formatTaiko, parseTaiko} from "../lib/format";
import {colors, radii, shadow, HOODI_FAUCET_URL, MIN_GAS_WEI} from "../lib/theme";
import {friendlyError} from "../lib/errors";

const FAUCET_AMOUNT = parseTaiko("1000");

const mintAbi = [
    {
        type: "function",
        name: "mint",
        stateMutability: "nonpayable",
        inputs: [
            {name: "to", type: "address"},
            {name: "amount", type: "uint256"},
        ],
        outputs: [],
    },
] as const;

export function OnboardingPanel({address}: {address: `0x${string}`}) {
    const client = usePublicClient();
    const {writeContractAsync} = useWriteContract();
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const {data: ethBalance, refetch: refetchEth} = useBalance({
        chainId: ALLOWED_CHAIN.id,
        address,
        query: {refetchInterval: 12_000},
    });

    const {data: tokenBalance, refetch: refetchToken} = useReadContract({
        chainId: ALLOWED_CHAIN.id,
        address: TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
        query: {refetchInterval: 12_000},
    });

    const ethWei = ethBalance?.value ?? 0n;
    const tokWei = (tokenBalance as bigint | undefined) ?? 0n;
    const needsGas = ethWei < MIN_GAS_WEI;
    const needsTokens = tokWei < MIN_GAS_WEI;

    if (!needsGas && !needsTokens) return null;

    async function mint() {
        if (!client) return;
        setBusy(true);
        setErr(null);
        try {
            const hash = await writeContractAsync({
                chainId: ALLOWED_CHAIN.id,
                address: TOKEN_ADDRESS,
                abi: mintAbi,
                functionName: "mint",
                args: [address, FAUCET_AMOUNT],
            });
            await client.waitForTransactionReceipt({hash});
            await refetchToken();
        } catch (e) {
            setErr(friendlyError(e, "mint failed"));
        } finally {
            setBusy(false);
        }
    }

    async function copyOrShareAddress() {
        // RN has no clipboard built in without a polyfill; use Share to bring
        // up the OS share sheet, which gives users multiple ways to paste it
        // into the faucet form.
        try {
            await Share.share({message: address, title: "Your wallet address"});
        } catch {
            Alert.alert("Your address", address);
        }
    }

    return (
        <View style={styles.card}>
            <Text style={styles.title}>One-time setup</Text>
            <Text style={styles.sub}>
                You need a tiny bit of Hoodi ETH for gas and some mTAIKO to stake. Both
                are free and test-only — takes 30 seconds.
            </Text>

            <View style={[styles.step, !needsGas && styles.stepDone]}>
                <View style={styles.stepNum}>
                    <Text style={styles.stepNumText}>{needsGas ? "1" : "✓"}</Text>
                </View>
                <View style={{flex: 1}}>
                    <Text style={styles.stepTitle}>Gas — Hoodi ETH</Text>
                    <Text style={styles.stepSub}>
                        Balance:{" "}
                        <Text style={styles.balanceNum}>
                            {ethBalance
                                ? Number(formatUnits(ethBalance.value, ethBalance.decimals)).toFixed(5)
                                : "…"}{" "}
                            ETH
                        </Text>
                    </Text>
                    {needsGas && (
                        <>
                            <View style={styles.row}>
                                <Pressable
                                    style={styles.btnPrimary}
                                    onPress={() => Linking.openURL(HOODI_FAUCET_URL)}
                                >
                                    <Text style={styles.btnPrimaryText}>Open faucet</Text>
                                </Pressable>
                                <Pressable style={styles.btnGhost} onPress={copyOrShareAddress}>
                                    <Text style={styles.btnGhostText}>Share address</Text>
                                </Pressable>
                                <Pressable style={styles.btnGhost} onPress={() => refetchEth()}>
                                    <Text style={styles.btnGhostText}>Recheck</Text>
                                </Pressable>
                            </View>
                            <Text style={styles.tip}>
                                Tap "Share address" to copy your wallet into the faucet form.
                                Request ETH, wait ~30s, then tap "Recheck".
                            </Text>
                        </>
                    )}
                </View>
            </View>

            <View style={[styles.step, !needsTokens && styles.stepDone]}>
                <View style={styles.stepNum}>
                    <Text style={styles.stepNumText}>{needsTokens ? "2" : "✓"}</Text>
                </View>
                <View style={{flex: 1}}>
                    <Text style={styles.stepTitle}>Stake token — mTAIKO</Text>
                    <Text style={styles.stepSub}>
                        Balance: <Text style={styles.balanceNum}>{formatTaiko(tokWei)} mTAIKO</Text>
                    </Text>
                    {needsTokens && (
                        <View style={styles.row}>
                            <Pressable
                                style={[styles.btnPrimary, (busy || needsGas) && styles.btnDisabled]}
                                onPress={mint}
                                disabled={busy || needsGas}
                            >
                                <Text style={styles.btnPrimaryText}>
                                    {busy ? "Minting…" : "+ 1000 mTAIKO"}
                                </Text>
                            </Pressable>
                        </View>
                    )}
                </View>
            </View>

            {err && <Text style={styles.err}>{err}</Text>}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.bgElevated,
        borderRadius: radii.lg,
        padding: 18,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: colors.border,
        ...shadow.soft,
    },
    title: {fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: 4},
    sub: {fontSize: 13, color: colors.textMuted, lineHeight: 18, marginBottom: 12},
    step: {
        flexDirection: "row",
        gap: 12,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    stepDone: {},
    stepNum: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: colors.accentBg,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 1,
    },
    stepNumText: {color: colors.accent, fontWeight: "700", fontSize: 13},
    stepTitle: {fontSize: 14.5, fontWeight: "600", color: colors.text},
    stepSub: {fontSize: 13, color: colors.textMuted, marginTop: 2},
    balanceNum: {fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] as never},
    row: {flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10},
    btnPrimary: {
        backgroundColor: colors.accent,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: radii.pill,
    },
    btnPrimaryText: {color: "#fff", fontWeight: "600", fontSize: 13},
    btnGhost: {
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: colors.border,
    },
    btnGhostText: {color: colors.text, fontSize: 13},
    btnDisabled: {opacity: 0.5},
    tip: {fontSize: 11, color: colors.textFaint, marginTop: 8, lineHeight: 16},
    err: {color: colors.danger, fontSize: 13, marginTop: 10},
});

// Suppress unused-platform-import warning — keep import for future use.
void Platform;
