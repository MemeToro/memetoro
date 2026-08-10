# Development Log

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
