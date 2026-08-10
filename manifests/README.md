# Launch Manifests

Every MemeToro proposal will eventually publish a versioned, machine-readable launch manifest. The manifest will let people and software inspect the proposal before contributing and independently verify the terms used by the launch contracts.

A manifest should contain:

- Token name.
- Token symbol.
- Meme concept.
- Market reasoning.
- Risk assessment.
- Evidence sources.
- Token supply.
- Contributor allocation.
- Liquidity allocation.
- Insider allocation, which must be zero.
- Funding asset.
- Per-wallet contribution cap.
- Minimum and, when applicable, maximum funding thresholds.
- Funding start time.
- Funding end time.
- Launch conditions.
- Manifest version.
- Generation time and selected source-signal identifiers.

[`example-manifest.json`](./example-manifest.json) is an illustrative, non-production document. It is not a finalized schema or an offer to launch a token.

The agent pipeline currently performs lightweight runtime checks for evidence provenance, allocation totals, zero insider allocation, funding timestamps, and permissionless execution settings. These checks are an MVP safeguard, not a finalized manifest schema or security review.
