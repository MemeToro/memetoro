# MemeToro Agent

The future MemeToro agent will be an off-chain system that turns public signals into transparent meme-token proposals. Its planned responsibilities are:

- Collecting information from news, trend, culture, and market sources.
- Analyzing trends and identifying timely themes.
- Generating complete meme concepts.
- Producing structured, inspectable reasoning.
- Generating machine-readable launch manifests.
- Signing and publishing finalized manifests.

## Data sources

Connectors live in [`data-sources/`](./data-sources/). The first connector gathers recent worldwide-news and X trend signals through Perplexity and xAI. Connector output is evidence for analysis, not an automatic endorsement or launch decision.

## Pipeline MVP

The fixture-backed [`pipeline/`](./pipeline/) MVP normalizes collected signals, generates one concept, applies fixed draft launch parameters, and validates the resulting manifest. Its dry-run mode works without credentials or network requests:

```sh
node pipeline/run.mjs --dry-run
```

Live concept generation is optional. Hourly scheduling, a dedicated market feed, publication, and signing remain future work.

Every script reads credentials from a single `.env` at the repository root, described by `.env.example`. Keep credentials in that ignored file or a secure runtime secret store; only the placeholder example belongs in Git.

The agent may propose launch terms, but it must never custody, transfer, or otherwise control contributor funds. Funding, launch execution, claims, and refunds must be handled by public smart contracts under published conditions.
