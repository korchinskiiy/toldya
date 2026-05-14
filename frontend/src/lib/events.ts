import {parseAbiItem, type Address, type PublicClient} from "viem";
import {HUB_ADDRESS, hubAbi} from "./contracts";
import {fetchQueryPayload} from "./queryPayload";

export const eventDefs = {
    MarketCreated: parseAbiItem(
        "event MarketCreated(uint256 indexed marketId, address indexed creator, uint8 creatorSide, uint64 deadline, uint256 netStake, string queryCid)",
    ),
    Staked: parseAbiItem(
        "event Staked(uint256 indexed marketId, address indexed staker, uint8 side, uint256 netStake)",
    ),
    MarketResolved: parseAbiItem(
        "event MarketResolved(uint256 indexed marketId, uint8 outcome)",
    ),
    Claimed: parseAbiItem(
        "event Claimed(uint256 indexed marketId, address indexed staker, uint256 amount)",
    ),
    EvidenceSubmitted: parseAbiItem(
        "event EvidenceSubmitted(uint256 indexed marketId, address indexed submitter, string cid, uint8 mediaType, string description)",
    ),
};

export type FeedEvent =
    | {
          kind: "created";
          marketId: bigint;
          creator: Address;
          side: number;
          deadline: bigint;
          amount: bigint;
          question: string;
          blockNumber: bigint;
          logIndex: number;
          timestamp: number;
      }
    | {
          kind: "staked";
          marketId: bigint;
          staker: Address;
          side: number;
          amount: bigint;
          question: string;
          blockNumber: bigint;
          logIndex: number;
          timestamp: number;
      }
    | {
          kind: "resolved";
          marketId: bigint;
          outcome: number;
          question: string;
          blockNumber: bigint;
          logIndex: number;
          timestamp: number;
      }
    | {
          kind: "claimed";
          marketId: bigint;
          staker: Address;
          amount: bigint;
          question: string;
          blockNumber: bigint;
          logIndex: number;
          timestamp: number;
      }
    | {
          kind: "evidence";
          marketId: bigint;
          submitter: Address;
          cid: string;
          mediaType: number;
          description: string;
          question: string;
          blockNumber: bigint;
          logIndex: number;
          timestamp: number;
      };

export async function fetchFeed(client: PublicClient, fromBlock: bigint = 0n): Promise<FeedEvent[]> {
    const [created, staked, resolved, claimed, evidence] = await Promise.all([
        client.getLogs({address: HUB_ADDRESS, event: eventDefs.MarketCreated, fromBlock}),
        client.getLogs({address: HUB_ADDRESS, event: eventDefs.Staked, fromBlock}),
        client.getLogs({address: HUB_ADDRESS, event: eventDefs.MarketResolved, fromBlock}),
        client.getLogs({address: HUB_ADDRESS, event: eventDefs.Claimed, fromBlock}),
        client.getLogs({address: HUB_ADDRESS, event: eventDefs.EvidenceSubmitted, fromBlock}),
    ]);

    const partial: Omit<FeedEvent, "question" | "timestamp">[] = [
        ...created.map(
            (l) =>
                ({
                    kind: "created" as const,
                    marketId: l.args.marketId!,
                    creator: l.args.creator!,
                    side: Number(l.args.creatorSide),
                    deadline: l.args.deadline!,
                    amount: l.args.netStake!,
                    blockNumber: l.blockNumber!,
                    logIndex: l.logIndex!,
                }),
        ),
        ...staked.map(
            (l) =>
                ({
                    kind: "staked" as const,
                    marketId: l.args.marketId!,
                    staker: l.args.staker!,
                    side: Number(l.args.side),
                    amount: l.args.netStake!,
                    blockNumber: l.blockNumber!,
                    logIndex: l.logIndex!,
                }),
        ),
        ...resolved.map(
            (l) =>
                ({
                    kind: "resolved" as const,
                    marketId: l.args.marketId!,
                    outcome: Number(l.args.outcome),
                    blockNumber: l.blockNumber!,
                    logIndex: l.logIndex!,
                }),
        ),
        ...claimed.map(
            (l) =>
                ({
                    kind: "claimed" as const,
                    marketId: l.args.marketId!,
                    staker: l.args.staker!,
                    amount: l.args.amount!,
                    blockNumber: l.blockNumber!,
                    logIndex: l.logIndex!,
                }),
        ),
        ...evidence.map(
            (l) =>
                ({
                    kind: "evidence" as const,
                    marketId: l.args.marketId!,
                    submitter: l.args.submitter!,
                    cid: l.args.cid!,
                    mediaType: Number(l.args.mediaType),
                    description: l.args.description!,
                    blockNumber: l.blockNumber!,
                    logIndex: l.logIndex!,
                }),
        ),
    ];

    // Resolve question per unique market and timestamp per unique block in
    // parallel, then attach.
    const marketIds = [...new Set(partial.map((e) => e.marketId))];
    const blockNumbers = [...new Set(partial.map((e) => e.blockNumber))];

    const [marketResults, blockResults] = await Promise.all([
        Promise.all(
            marketIds.map(
                (id) =>
                    client.readContract({
                        address: HUB_ADDRESS,
                        abi: hubAbi,
                        functionName: "getMarket",
                        args: [id],
                    }) as Promise<{queryCid: string}>,
            ),
        ),
        Promise.all(blockNumbers.map((n) => client.getBlock({blockNumber: n}))),
    ]);

    const payloads = await Promise.all(
        marketResults.map((m) => fetchQueryPayload(m.queryCid)),
    );
    const questionById = new Map(
        marketIds.map((id, i) => [id, payloads[i]?.question ?? "(question unavailable)"]),
    );
    const tsByBlock = new Map(blockNumbers.map((n, i) => [n, Number(blockResults[i].timestamp)]));

    const enriched: FeedEvent[] = partial.map(
        (e) =>
            ({
                ...e,
                question: questionById.get(e.marketId) ?? "(unknown market)",
                timestamp: tsByBlock.get(e.blockNumber) ?? 0,
            }) as FeedEvent,
    );

    enriched.sort(
        (a, b) =>
            Number(b.blockNumber - a.blockNumber) || b.logIndex - a.logIndex,
    );

    return enriched;
}

export function relativeTime(ts: number): string {
    const diff = Date.now() / 1000 - ts;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}
