# MemeToro

> **AI finds the meme. Fair contracts launch it.**

MemeToro is an open-source AI meme launch agent. It is designed to identify timely ideas from news, trends, culture, and markets, then publish transparent memecoin proposals for fair, rules-based launches. The initial target network is BNB Smart Chain.

Unlike a normal AI meme generator, MemeToro does more than create an image or a name. Each proposal is intended to include the concept, the evidence and reasoning behind it, the other candidates the agent rejected, token and funding parameters, and a machine-readable launch manifest. Public smart contracts—not the AI or a private backend—will enforce the funding and launch rules.

## How it works

1. Scan trends.
2. Generate a meme concept.
3. Publish the reasoning and launch manifest.
4. Open a fixed-rate funding round.
5. Launch through public smart-contract conditions.

## Current status

MemeToro is at the **early MVP and architecture stage**. This repository contains project documentation, a dependency-free connector for worldwide-news and X trend signals, a tested pipeline that turns those signals into one validated draft manifest, publishes the candidate shortlist it rejected, and declines when nothing is suitable, and a first draft of the fair-launch funding escrow with its test suite, a factory that lists rounds for an ERC-8004 agent, published ABIs, and scripts that produce one window and publish it on a test network. Each published manifest commits to a digest of itself and to its image, and the contract suite deploys a launch round from that file to check that the enforced terms match the published ones. It does not contain an hourly autonomous service or a real token-and-liquidity launch.

> [!WARNING]
> The contracts are an unaudited draft, are not deployed on any network, and have had no security review. Do not use this repository to collect or manage real funds.

## Repository structure

```text
.
├── agent/        # Agent design, data sources, and pipeline MVP
│   ├── data-sources/
│   └── pipeline/
├── contracts/    # Escrow, factory, tests, published ABIs, and deploy scripts
├── published/    # Static publication root for manifests and images
├── docs/         # Architecture and development history
├── manifests/    # Manifest documentation and examples
├── CONTRIBUTING.md
├── SECURITY.md
└── LICENSE
```

## Roadmap

- Host `published/` at a stable public URL and point testnet rounds at it.
- Add a website listing page that reads the factory and fetches each manifest.
- Run `agent/run-window.mjs` on an hourly schedule.
- Implement token creation and liquidity provision behind the escrow's executor interface.
- Add ERC-8004 reputation once there is a public track record of rounds.
- Complete independent contract security reviews before any production use.

MemeToro's core principle is simple: the agent proposes; transparent contracts execute.
