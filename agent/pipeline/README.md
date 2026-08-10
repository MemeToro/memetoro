# Agent Pipeline MVP

This MVP turns collected trend signals into one draft MemeToro launch manifest. It proves the handoff between data collection, AI concept generation, and manifest validation without adding a scheduler, database, or production launch code.

## What it does

1. Reads the `memetoro.trend-signals` JSON produced by a data-source connector.
2. Normalizes news and X candidates into one small evidence set.
3. Asks xAI for a token name, symbol, concept, concise rationale, risk assessment, and selected evidence.
4. Applies fixed draft launch parameters in code.
5. Rejects malformed concepts, unknown evidence links, insider allocations, and unsafe execution settings.
6. Prints one validated draft manifest as JSON.

The model proposes the creative concept only. It does not choose funding policy, custody funds, schedule launches, or call contracts.

## Fixture dry run

No credentials or network requests are needed:

```sh
node run.mjs --dry-run
```

The command uses the frozen files under [`fixtures/`](./fixtures/) and prints a complete manifest. This path is intended for local development and repeatable checks.

The fixtures are a verbatim capture of a real run from 2026-08-10, not synthetic placeholders. `trend-signals.json` holds the collected signals exactly as the connector emitted them, and `concept-response.json` holds the concept the model produced from them. Because the snapshot mixes high-sensitivity topics with lighter ones, the dry run also demonstrates the pipeline selecting a low-harm signal and confining evidence to collected links.

The capture cites public news and X post URLs. Its summaries and risk notes are model-written and were never verified, so treat the file as recorded provider input frozen in time rather than as accurate reporting about the events or accounts it mentions.

## Optional live concept generation

1. Add an xAI API key to the repository-root `.env`, copied from `.env.example`.
2. Produce a trend-signal file with a connector.
3. Run:

   ```sh
   node run.mjs --signals ../data-sources/news-x-trends/output/latest.json
   ```

To collect live news and X signals and send them directly to the pipeline from the repository root:

```sh
node agent/data-sources/news-x-trends/search.mjs | node agent/pipeline/run.mjs --signals -
```

The input provider output is untrusted. The pipeline limits evidence to collected URLs, but human review and stronger safety policy are still required before publication.

Live collection can take more than a minute because X Search is slow, so both scripts allow up to 180 seconds per provider request.

## Deliberately deferred

- Hourly scheduling and retries.
- A dedicated market-data connector.
- Persistence and proposal publication.
- Manifest signing.
- Production-grade policy and schema validation.
- Contract or wallet interaction.
