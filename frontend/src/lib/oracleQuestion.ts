export type OracleQuestionPayload = {
    kind: "question";
    query: string;
    context: string;
};

export const ORACLE_QUESTION_LIMITS = {question: 512, criteria: 2_000} as const;

export function validateOracleQuestionText(args: {question: unknown; criteria: unknown}): string | null {
    if (typeof args.question !== "string" || args.question.trim().length === 0) {
        return "question is required";
    }
    if (typeof args.criteria !== "string" || args.criteria.trim().length === 0) {
        return "criteria is required";
    }
    if (args.question.trim().length > ORACLE_QUESTION_LIMITS.question) {
        return `question must be ${ORACLE_QUESTION_LIMITS.question} characters or fewer`;
    }
    if (args.criteria.trim().length > ORACLE_QUESTION_LIMITS.criteria) {
        return `criteria must be ${ORACLE_QUESTION_LIMITS.criteria} characters or fewer`;
    }
    return null;
}

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

export function buildOracleQuestionPinMessage(args: {question: string; criteria: string}): string {
    const payload = buildOracleQuestionPayload(args);
    return [
        "Toldya oracle question pin request",
        "",
        payload.query,
    ].join("\n");
}

export async function pinOracleQuestion(args: {
    question: string;
    criteria: string;
    address: `0x${string}`;
    signature: `0x${string}`;
}): Promise<string> {
    const validationError = validateOracleQuestionText(args);
    if (validationError) {
        throw new Error(validationError);
    }

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
