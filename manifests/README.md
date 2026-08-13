# Launch Manifests

Every MemeToro proposal will eventually publish a versioned, machine-readable launch manifest. The manifest lets people and software inspect the proposal before contributing and independently verify the terms used by the launch contracts.

The manifest is the canonical record. Readable views such as the markdown rendering produced by the agent pipeline are derived from it by a deterministic function, so a human-facing page cannot state terms that differ from the ones the contracts would enforce. Marketing prose never belongs in the manifest itself.

## Contents

A launch manifest contains:

- Token name and symbol.
- Meme concept and market reasoning.
- Risk assessment.
- Cited evidence, each entry carrying its URL, whether the link is a permalink or a publisher section front, and any recorded title, publication date, account, or description.
- Countable source facts: how many links, how many distinct domains, how many permalinks against section fronts, how many links carry a date, and the date range they cover.
- Token supply, contributor allocation, liquidity allocation, and insider allocation, which must be zero.
- Funding asset, per-wallet contribution cap, and minimum and maximum funding thresholds.
- Funding start and end times.
- Launch conditions and the permissionless finalize, refund, and backend-independence flags.
- The selection record: every candidate signal the agent had available, its stated risk notes, its source facts, and whether it was chosen.
- Provenance: generation time, signal collection time, collection window, and which generator produced the concept.
- Manifest version and kind.

## Deliberately absent

There is no composite signal-strength score or high/medium/low rating. The collection sources return no post volume, impression, or engagement data, so any such number would be invented rather than measured. Only countable facts are published, leaving the judgement to the reader.

## No-proposal records

A collection window that yields nothing suitable produces a `memetoro.no-proposal` record instead of a manifest. It carries the decline reason, the same full selection record, and provenance, and it must contain no launch terms at all.

## Example

[`example-manifest.json`](./example-manifest.json) is an illustrative, non-production document using placeholder URLs. It is not a finalized schema or an offer to launch a token.

The agent pipeline performs runtime checks for evidence provenance, selection-record completeness, allocation totals, zero insider allocation, funding thresholds and timestamps, and permissionless execution settings. These checks are an MVP safeguard, not a finalized manifest schema or a security review.
