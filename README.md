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

MemeToro is at the **early MVP and architecture stage**. This repository contains project documentation, a dependency-free connector for worldwide-news and X trend signals, a tested pipeline that turns those signals into one validated draft manifest, publishes the candidate shortlist it rejected, and declines when nothing is suitable, and a first draft of the fair-launch funding escrow with its test suite. It does not contain an hourly autonomous service, a deployed contract, or a working end-to-end launch.

> [!WARNING]
> The contracts are an unaudited draft, are not deployed on any network, and have had no security review. Do not use this repository to collect or manage real funds.

## Repository structure

```text
.
├── agent/        # Agent design, data sources, and pipeline MVP
│   ├── data-sources/
│   └── pipeline/
├── contracts/    # Fair-launch escrow draft and its tests
├── docs/         # Architecture and development history
├── manifests/    # Manifest documentation and examples
├── CONTRIBUTING.md
├── SECURITY.md
└── LICENSE
```

## Roadmap

- Define a canonical manifest serialization and hash, so a round's on-chain commitment can be checked against its published manifest.
- Implement token creation and liquidity provision behind the escrow's executor interface.
- Define a formal schema for the launch manifest.
- Add token symbol collision checking and evidence liveness verification.
- Add market signals, visual identity, and hourly scheduling to the agent.
- Deploy and test the launch contracts on BNB Smart Chain testnet.
- Add ERC-8004 agent identity and reputation integration.
- Complete independent contract security reviews before any production use.

MemeToro's core principle is simple: the agent proposes; transparent contracts execute.
