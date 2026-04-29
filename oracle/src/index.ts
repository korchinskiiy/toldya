import "dotenv/config";
import {createPublicClient, createWalletClient, http, parseAbiItem, type Log} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {hubAbi} from "./abi.js";
import {ResolverAgent} from "./agent.js";

const RPC_URL = required("RPC_URL");
const HUB_ADDRESS = required("HUB_ADDRESS") as `0x${string}`;
const ORACLE_PRIVATE_KEY = required("ORACLE_PRIVATE_KEY") as `0x${string}`;
const ANTHROPIC_API_KEY = required("ANTHROPIC_API_KEY");

const account = privateKeyToAccount(ORACLE_PRIVATE_KEY);
const transport = http(RPC_URL);
const publicClient = createPublicClient({transport});
const walletClient = createWalletClient({account, transport});

const agent = new ResolverAgent(ANTHROPIC_API_KEY);

const resolutionRequestedEvent = parseAbiItem(
    "event ResolutionRequested(uint256 indexed marketId, string question, string criteria)",
);

const inFlight = new Set<string>();

async function handleEvent(log: Log<bigint, number, false, typeof resolutionRequestedEvent>) {
    const args = log.args as {marketId: bigint; question: string; criteria: string};
    const key = args.marketId.toString();
    if (inFlight.has(key)) return;
    inFlight.add(key);

    console.log(`[market ${key}] resolution requested`);
    console.log(`  Q: ${args.question}`);
    console.log(`  C: ${args.criteria}`);

    try {
        const verdict = await agent.resolve(args.question, args.criteria);
        console.log(`[market ${key}] verdict: ${verdict.yesWon ? "YES" : "NO"}`);

        const hash = await walletClient.writeContract({
            address: HUB_ADDRESS,
            abi: hubAbi,
            functionName: "resolveMarket",
            args: [args.marketId, verdict.yesWon],
            chain: null,
        });
        console.log(`[market ${key}] tx submitted: ${hash}`);
        await publicClient.waitForTransactionReceipt({hash});
        console.log(`[market ${key}] resolved on-chain`);
    } catch (err) {
        console.error(`[market ${key}] failed:`, err);
        // Allow a retry on the next poll if it failed.
        inFlight.delete(key);
    }
}

async function main() {
    console.log(`Toldya oracle starting`);
    console.log(`  hub:    ${HUB_ADDRESS}`);
    console.log(`  oracle: ${account.address}`);

    publicClient.watchEvent({
        address: HUB_ADDRESS,
        event: resolutionRequestedEvent,
        onLogs: (logs) => {
            for (const log of logs) handleEvent(log).catch(console.error);
        },
        onError: (err) => console.error("watcher error:", err),
    });

    // Keep process alive
    await new Promise(() => {});
}

function required(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`Missing required env var: ${name}`);
    return v;
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
