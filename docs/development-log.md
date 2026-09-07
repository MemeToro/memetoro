# Development Log

## 2026-09-07 — Fair-Launch Escrow

### Completed

- Added a Foundry project under `contracts/`, pinning `forge-std` v1.16.2 as a submodule and targeting Solidity 0.8.28.
- Implemented `FairLaunchEscrow`, the funding escrow for a single launch round: contributions, per-wallet cap, minimum and maximum thresholds, funding window, permissionless finalization, pro-rata claims, and refunds.
- Made the fairness claims structural: all terms are immutables with no owner, admin, or upgrade path; native value can exit only as a refund to its contributor or as the whole raise to the launch executor; and the constructor rejects any allocation split that does not assign the entire supply, so an insider share cannot be represented.
- Committed each round to a `manifestHash` at construction, so on-chain terms can be checked against the published document.
- Added a refund path that opens when a round closes below its minimum and again when the finalization grace period expires, with finalization barred from the moment refunds open so the two can never overlap.
- Put token creation and liquidity behind `ILaunchExecutor`, keeping the escrow testable without a DEX.
- Added 26 unit and fuzz tests plus 8 invariants over randomized action sequences, covering caps against split contributions, hard-cap rejection, the finalization deadline, misbehaving executors, refund recipients that reject value, and tokens whose transfers fail.

### Decisions

- Reaching the hard cap reverts rather than partially filling the last contribution. Partial fills avoid a failed transaction at the boundary but make the accounting harder to reason about, which is the wrong trade for a first draft.
- No `receive` fallback. A bare transfer reverts instead of being silently credited or lost.
- Refunds use a raw call rather than `transfer`, so contract contributors are not broken by the gas stipend.
- Public immutables keep camelCase getter names against Foundry's style lint, because those names are the ABI that off-chain consumers read.

### Known limitations

- The launch executor is a stub. Token deployment, liquidity provision, and LP handling do not exist.
- The escrow accepts a manifest hash but the agent does not compute one, so the two halves of the project are still unconnected.
- No factory, deployment scripts, or testnet deployment.
- Unaudited, with no security review of any kind.

### Notes

The first invariant run passed all eight properties, which turned out to mean very little. A throwaway probe asserting the opposite of each interesting state showed the handler never finalized a round, never paid a claim, and never filled the hard cap: the fixture's thresholds were unreachable for its actor set, and its time steps jumped past the funding window before contributions could accumulate. Four invariants were describing an escrow that never left its initial state. Retuning the window, thresholds, and step size, and adding an action that contributes an actor's full remaining allowance, brought all four states into reach. `test_fixtureCanReachHardCapLaunchAndClaims` and `test_fixtureCanReachRefunds` now guard that, so a future parameter change fails loudly rather than quietly hollowing out the suite.

### Next steps

- Define a canonical manifest serialization and hash so the commitment can be reproduced from a published manifest.
- Implement the launch executor against a DEX router, with liquidity locking.
- Add a factory and deployment scripts, then deploy to BNB Smart Chain testnet.
- Add continuous integration that runs the agent tests and the contract suite.

## 2026-08-13 — Transparency and Refusal

### Completed

- Split the pipeline into testable modules for signals, concept, manifest, and rendering.
- Carried evidence context through to the manifest: link titles, publication dates, X accounts, per-post descriptions, and news key points that were previously discarded.
- Added countable source facts per candidate covering link counts, distinct domains, permalinks against publisher section fronts, and dated-link counts.
- Published the full candidate shortlist with each candidate's stated risks and whether it was selected.
- Added a refusal path that emits a `memetoro.no-proposal` record instead of forcing a concept, and confirmed with a live call that the model declines when every candidate is high-harm.
- Added a deterministic manifest-to-markdown renderer so the readable view cannot drift from the enforced terms.
- Added 22 offline tests, including fabricated-evidence, cross-signal evidence, prompt-injection, hidden-candidate, and insider-allocation cases.
- Added `--save-concept` to archive the raw model response from a live run.
- Bumped the manifest to schema version 0.2.0 and updated the example manifest to match.

### Decisions

- No composite signal-strength score. The collection sources expose no volume or engagement data, so a rating would be invented rather than measured.
- Human-readable output is rendered from the manifest rather than stored in it, to avoid a second source of truth for launch terms.
- Rejected candidates are published with their risk notes, which means sensitive topics appear in the record by design.

### Known limitations

- No symbol or name collision checking against existing tokens.
- No evidence liveness checking; several collected news links are publisher section fronts that prove nothing.
- No visual identity fields or asset generation.
- Refusal quality rests on prompt instructions rather than an independent safety classifier.
- Still no scheduler, persistence, publication, signing, or formal JSON Schema.

### Next steps

- Add collision search across token indexers, published as disclosure rather than a uniqueness guarantee.
- Add evidence liveness checks that distinguish an unreachable link from a deleted one.
- Prefer permalinks over section fronts when selecting evidence.
- Add a structured visual identity field before considering asset generation.

## 2026-08-10 — Agent Pipeline Dry Run

### Completed

- Added a dependency-free pipeline that normalizes news and X trend signals.
- Added an optional xAI concept-generation step with structured output.
- Kept token and funding parameters in explicit code policy instead of model output.
- Added evidence allow-listing and launch-manifest validation.
- Added standard-input piping between collection and generation.
- Consolidated credentials into one repository-root `.env` and `.env.example` instead of per-directory copies.
- Raised the provider request timeout to 180 seconds after a live X Search request exceeded 60 seconds.
- Completed live end-to-end provider runs that produced the validated draft concepts **Prompt Pace (PPACE)** and **Cat Day Overlords (CATDAY)**.
- Replaced the initial synthetic fixtures with a verbatim frozen capture of the real run, including its public news and X post URLs.
- Confirmed the credential-free dry run reproduces the live concept and that the model skipped war, disaster, and polarized signals in favor of a low-harm one.

### Known limitations

- No hourly scheduler, retries, persistence, signing, or publication.
- No dedicated market-data connector.
- Safety checks are prompt- and rule-based, not a complete moderation system.
- The manifest format does not yet have a finalized JSON Schema.
- Live provider behavior and concept quality do not yet have automated evaluation.
- Fixture content is frozen, unverified, and will not reflect current events.

### Next steps

- Add fixture-based negative tests for malformed and unsafe inputs.
- Define a formal launch-manifest JSON Schema.
- Add a market-data connector and cross-source deduplication.
- Add an explicit no-proposal outcome for unsuitable trend windows.
- Schedule dry-run generation hourly only after quality and safety evaluation.

## 2026-08-05 — Initial Trend Data Sources

### Completed

- Added the first data-source connector under `agent/data-sources/news-x-trends/`.
- Adapted the initial news and X search prototype into a dependency-free Node.js script.
- Added structured prompts for multiple ranked candidates, evidence links, meme relevance, and risk notes.
- Added consistent combined JSON output for worldwide-news and X signals.
- Added local setup and credential-handling documentation.
- Added an example environment file without copying private API credentials into the repository.

### Known limitations

- Provider output remains untrusted and requires downstream verification.
- Ranking quality and resistance to manipulated trends have not been evaluated.
- The connector depends on external Perplexity and xAI APIs.
- No scheduler, persistence layer, deduplication, or automated tests yet.
- No live AI proposal-generation pipeline.

### Next steps

- Define validation and normalization rules for collected signals.
- Add deduplication across news and X candidates.
- Design safety and suitability filters before concept generation.
- Add fixture-based tests without making paid network requests.
- Connect verified trend signals to a transparent proposal-generation stage.

## 2026-07-29 — Foundation & Architecture

### Completed

- Created the MemeToro repository foundation.
- Defined the initial project positioning: **AI finds the meme. Fair contracts launch it.**
- Created the initial folders for the agent, contracts, documentation, and manifests.
- Documented the first architecture and trust boundaries.
- Added a non-production example launch manifest.

### Known limitations

- No production contracts.
- No live AI agent.
- No ERC-8004 registration yet.
- No testnet deployment.
- No security audit.

### Next steps

- Define a formal, versioned manifest schema.
- Research ERC-8004 identity and reputation integration.
- Specify contract invariants and fair-launch test cases.
- Prototype the agent's source and trend-analysis pipeline.
- Plan a BNB Smart Chain testnet deployment after implementation and review.
