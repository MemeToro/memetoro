# Agent Pipeline MVP

This MVP turns collected trend signals into one draft MemeToro launch manifest, or into a record explaining why no proposal was made. It proves the handoff between data collection, AI concept generation, and manifest validation without adding a scheduler, database, or production launch code.

## What it does

1. Reads the `memetoro.trend-signals` JSON produced by a data-source connector.
2. Normalizes news and X candidates, attaching each evidence link to its recorded title, publication date, account, and description.
3. Computes countable source facts per candidate: link counts, distinct domains, permalinks against publisher section fronts, and how many links carry a date.
4. Asks xAI to select at most one candidate and describe it, or to decline.
5. Applies fixed draft launch parameters from code.
6. Publishes the full candidate shortlist alongside the winner.
7. Rejects malformed concepts, fabricated evidence links, incomplete selection records, insider allocations, and non-permissionless execution settings.
8. Prints the result as JSON or as rendered markdown.

The model selects and describes a concept. It does not choose funding policy, custody funds, schedule launches, or call contracts.

## Layout

| Path | Purpose |
| --- | --- |
| `run.mjs` | Command-line entry point |
| `lib/signals.mjs` | Normalization, evidence enrichment, source facts |
| `lib/concept.mjs` | Concept schema, prompt, generation, validation |
| `lib/manifest.mjs` | Launch policy, manifest and no-proposal builders, validation |
| `lib/render.mjs` | Deterministic manifest-to-markdown rendering |
| `test/` | Fixture-based tests, including negative cases |

## Fixture dry run

No credentials or network requests are needed:

```sh
node run.mjs --dry-run
node run.mjs --dry-run --format markdown
node run.mjs --dry-run --scenario decline
```

The fixtures under [`fixtures/`](./fixtures/) are frozen captures of real runs from 2026-08-10, not synthetic placeholders. `trend-signals.json` holds the collected signals exactly as the connector emitted them, and `concept-response.json` holds the concept the model produced from them. Because the snapshot mixes high-sensitivity topics with lighter ones, the dry run also demonstrates the agent passing over war, disaster, and polarized candidates.

`sensitive-only-signals.json` is the same capture reduced to its high-harm candidates, and `decline-response.json` is the model's real refusal on that input. Together they exercise the no-proposal path offline.

The captures cite public news and X post URLs. Their summaries and risk notes are model-written and were never verified, so treat the files as recorded provider input frozen in time rather than as accurate reporting about the events or accounts they mention.

## Tests

```sh
node --test test/pipeline.test.mjs
```

The suite runs entirely offline against the fixtures. Alongside the positive path it asserts the negative ones: a concept cannot cite a URL no signal supplied, cannot cite evidence belonging to a signal it did not select, and cannot be widened by instructions embedded in signal text. It also asserts that a manifest cannot hide candidates, carry insider allocation, or turn off permissionless finalize and refund.

## Optional live concept generation

1. Add an xAI API key to the repository-root `.env`, copied from `.env.example`.
2. Produce a trend-signal file with a connector.
3. Run:

```sh
node run.mjs --signals ../data-sources/news-x-trends/output/latest.json
```

To collect live news and X signals and send them straight to the pipeline from the repository root:

```sh
node agent/data-sources/news-x-trends/search.mjs | node agent/pipeline/run.mjs --signals -
```

Pass `--save-concept <path>` on a live run to archive the raw model response before validation, which is how the fixtures are regenerated and how a live run keeps an audit copy.

The input provider output is untrusted. The pipeline limits evidence to links the selected signal actually supplied, but human review and stronger safety policy are still required before publication.

Live collection can take more than a minute because X Search is slow, so both scripts allow up to 180 seconds per provider request.

## Declining is a valid outcome

When every candidate carries high harm, tragedy, or manipulation risk, the correct output is a `memetoro.no-proposal` record carrying the decline reason and the same full candidate list. It exits successfully; refusing is not an error. Publishing a shortlist would not mean much if refusal were unreachable.

## No strength score

Source facts are counts only. The collection sources return no post volume, impression, or engagement data, so a composite strength number would be invented rather than measured and would read as a measurement to someone deciding whether to contribute.

The permalink-against-section-front split uses a documented heuristic in `lib/util.mjs`: a link counts as a permalink when its path contains a date segment, a long numeric identifier, or a slug with at least three hyphens. It exists because publisher section fronts such as `reuters.com/world/` stay reachable forever and therefore support no particular claim. The heuristic is approximate and is published as a count, not as a verdict.

## Deliberately deferred

- Hourly scheduling and retries.
- A dedicated market-data connector.
- Symbol and name collision checking against existing tokens.
- Evidence liveness checking.
- Visual identity fields and asset generation.
- Persistence, proposal publication, and manifest signing.
- A formal manifest JSON Schema.
- Contract or wallet interaction.
