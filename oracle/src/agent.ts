import Anthropic from "@anthropic-ai/sdk";

// System prompt is static across every market — cache it so we only pay full
// input cost once per 5-minute TTL window.
const SYSTEM_PROMPT = `You are an impartial resolver for the Toldya prediction market.

For each market you are given a YES/NO question and a resolution criteria. Your job is to
decide, based on the criteria and any verifiable evidence, whether the answer is YES or NO.

Rules:
- Treat the criteria as the contract. If it says "YES if X happens by date D", that is the
  test. Do not substitute your own judgement for explicit criteria.
- If the question is about an event between specific people in private (e.g. "Did Tom finish
  a beer in 30 seconds?") and there is no public evidence, you cannot independently verify
  it; in that case still attempt your best estimate but explicitly note the uncertainty.
- You MUST end your response with exactly one line of the form:
    RESULT:YES
  or
    RESULT:NO
  with no trailing punctuation. Anything before that line may be a brief reasoning note.
- Never output RESULT:UNKNOWN. The market needs a binary verdict.`;

export type Verdict = {yesWon: boolean; reasoning: string};

export class ResolverAgent {
    private client: Anthropic;

    constructor(apiKey: string) {
        this.client = new Anthropic({apiKey});
    }

    async resolve(question: string, criteria: string): Promise<Verdict> {
        const userMessage = `Question: ${question}\n\nResolution criteria: ${criteria}\n\nDecide YES or NO.`;

        const response = await this.client.messages.create({
            model: "claude-opus-4-7",
            max_tokens: 1024,
            system: [{type: "text", text: SYSTEM_PROMPT, cache_control: {type: "ephemeral"}}],
            messages: [{role: "user", content: userMessage}],
        });

        const text = response.content
            .map((b) => (b.type === "text" ? b.text : ""))
            .join("\n")
            .trim();

        const verdict = parseVerdict(text);
        if (!verdict) {
            throw new Error(`Resolver did not return a parseable RESULT line. Got:\n${text}`);
        }
        return {yesWon: verdict, reasoning: text};
    }
}

export function parseVerdict(text: string): boolean | null {
    const lines = text.trim().split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line === "RESULT:YES") return true;
        if (line === "RESULT:NO") return false;
    }
    return null;
}
