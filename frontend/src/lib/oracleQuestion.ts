export type OracleQuestionPayload = {
    kind: "question";
    query: string;
    context: string;
};

export function buildOracleQuestionPayload(args: {
    question: string;
    criteria: string;
}): OracleQuestionPayload {
    return {
        kind: "question",
        query:
            "Resolve this Toldya prediction market. " +
            `Question: ${args.question.trim()} ` +
            `Resolution criteria: ${args.criteria.trim()} ` +
            "Answer YES if the criteria resolve true. Answer NO if the criteria resolve false. " +
            "ABSTAIN only if the criteria cannot be verified from available evidence.",
        context: "Toldya market resolution request for the Veto oracle.",
    };
}

export async function pinOracleQuestion(args: {question: string; criteria: string}): Promise<string> {
    const res = await fetch("/api/oracle-question", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(args),
    });
    if (!res.ok) {
        throw new Error(`oracle question pin failed: ${await res.text()}`);
    }
    const body = (await res.json()) as {cid: string};
    return body.cid;
}
