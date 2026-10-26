# Launch Manifests

Every MemeToro proposal will eventually publish a versioned, machine-readable launch manifest. The manifest lets people and software inspect the proposal before contributing and independently verify the terms used by the launch contracts.

The manifest is the canonical record. Readable views such as the markdown rendering produced by the agent pipeline are derived from it by a deterministic function, so a human-facing page cannot state terms that differ from the ones the contracts would enforce. Marketing prose never belongs in the manifest itself.

## Contents

A launch manifest contains:

- Token name and symbol.
- Meme concept and market reasoning.
- A generated image, the prompt that produced it, and a SHA-256 of the file.
- Risk assessment.
- Cited evidence, each entry carrying its URL, whether the link is a permalink or a publisher section front, and any recorded title, publication date, account, or description.
- Countable source facts: how many links, how many distinct domains, how many permalinks against section fronts, how many links carry a date, and the date range they cover.
- Token supply, contributor allocation, liquidity allocation, and insider allocation, which must be zero.
- Funding asset, per-wallet contribution cap, and minimum and maximum funding thresholds.
- Funding start and end times, and the exit deadline until which contributions can be withdrawn.
- The same launch terms restated in the units a contract takes, as `chainTerms`.
- Launch conditions and the permissionless finalize, refund, and backend-independence flags.
- The selection record: every candidate signal the agent had available, its stated risk notes, its source facts, and whether it was chosen.
- Provenance: generation time, signal collection time, collection window, and which generator produced the concept.
- The commitment: a digest of the document, described below.
- Manifest version and kind.

## Two representations of one set of terms

Funding terms appear twice. The `funding` and `token` blocks state them as a person reads them, such as a cap of `"1"` BNB and an ISO timestamp. The `chainTerms` block states the same terms as the integers a contract constructor takes: wei amounts as decimal strings, whole-second Unix timestamps, basis points instead of percentages, and supply in base units.

This exists so a contributor can compare a deployed round against the proposal without converting anything by hand. Validation recomputes the second representation from the first and rejects any manifest where they disagree, so the two cannot drift apart inside one document. Launch timestamps carry second precision for the same reason: a millisecond that survives in the ISO string but not in the integer would make the two representations describe different instants.

The executor address and target chain are deliberately absent. They are deployment details that do not exist when a manifest is written, and publishing a value nobody can check yet is worse than publishing nothing.

## The commitment

Each published document carries a `commitment`: a SHA-256 digest over its own canonical serialization, with the commitment block itself removed because a hash cannot cover itself.

Canonicalization sorts object keys by UTF-16 code unit, emits no insignificant whitespace, preserves array order, and accepts only safe integers. Every ambiguity left open there would be a way for two readers to hash the same document differently and disagree about whether the published terms had changed. Amounts are published as base-unit strings rather than numbers precisely so no value needs a fraction.

A launch round stores this digest on-chain as its `manifestHash` and never interprets it. Verification is an off-chain job: canonicalize the published document, hash it, and compare with the value the round committed to. If they match, the round was deployed against this exact proposal, reasoning and rejected shortlist included, and not a quietly edited version of it.

## Deliberately absent

There is no composite signal-strength score or high/medium/low rating. The collection sources return no post volume, impression, or engagement data, so any such number would be invented rather than measured. Only countable facts are published, leaving the judgement to the reader.

## No-proposal records

A collection window that yields nothing suitable produces a `memetoro.no-proposal` record instead of a manifest. It carries the decline reason, the same full selection record, provenance, and its own commitment, and it must contain no launch terms at all. Refusals are committed too, so the record of a window where the agent declined is as tamper-evident as one where it proposed.

## Example

[`example-manifest.json`](./example-manifest.json) is an illustrative, non-production document using placeholder URLs. Its commitment is real and verifies against its contents, but it is not a finalized schema or an offer to launch a token.

The agent pipeline performs runtime checks for evidence provenance, selection-record completeness, allocation totals, zero insider allocation, funding thresholds and timestamps, exit-deadline placement, agreement between the two term representations, commitment integrity, and permissionless execution settings. The contract suite additionally deploys a round from the manifest the pipeline publishes and asserts every enforced term equals the published one, so a change on either side that breaks the correspondence fails a test. These checks are an MVP safeguard, not a finalized manifest schema or a security review.
