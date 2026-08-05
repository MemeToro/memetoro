# News and X Trends

This connector gathers two complementary signal sets:

- Broad worldwide-news topics receiving fresh coverage.
- Topics currently accelerating in public conversation on X.

It adapts the initial `memetoro_news_x_trends` prototype for MemeToro. The prompts return several ranked candidates, meme-relevance notes, and evidence links so a later analysis stage can compare signals instead of accepting a single model-selected story.

## Requirements

- Node.js 20.12 or newer.
- A Perplexity API key with Sonar access.
- An xAI API key with Responses API and X Search access.

No npm packages are required.

## Setup

1. Copy `.env.example` to `.env` in this directory.
2. Add your own API keys to `.env`.
3. Run:

   ```sh
   node search.mjs
   ```

The script prints one JSON object to standard output. To save a local snapshot:

```sh
node search.mjs > output/latest.json
```

The `output/` directory is ignored by Git. A failed provider request writes an error to standard error and exits with a nonzero status.

## Output boundaries

The result is source material, not a launch decision. Topics may be inaccurate, manipulated, unsafe, stale, or unsuitable for a meme. Downstream processing should verify evidence, check timestamps, deduplicate overlapping topics, and apply safety and launch-policy review before generating a proposal.
