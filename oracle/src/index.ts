const message = [
    "The legacy Toldya direct oracle service is retired.",
    "ToldyaHub now resolves oracle-enabled markets through its configured Veto IOracle contract.",
    "Run the Veto answerer/judge agents to settle the Veto request, then call ToldyaHub.resolveMarket(marketId).",
].join("\n");

console.error(message);
process.exitCode = 1;
