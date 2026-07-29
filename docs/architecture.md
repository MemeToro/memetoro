# Architecture

MemeToro separates idea generation from launch execution. The off-chain agent creates public proposals, while deterministic smart contracts enforce the published rules.

## Agent

The agent is the off-chain system that scans news, trends, culture, and market data, then creates meme-token proposals. It produces structured reasoning and launch parameters but never controls contributor funds.

## Manifest

The launch manifest is the public, machine-readable record for a proposal. It contains the meme concept, market reasoning, evidence sources, token parameters, funding rules, and launch conditions. Once funding starts, its committed launch terms must not be silently changed.

## Smart contracts

Smart contracts are the deterministic system responsible for accepting funding, enforcing caps and deadlines, executing eligible launches, distributing token claims, and providing refunds when launch conditions are not met. These actions must remain available without the MemeToro backend.

## Public interface

The public interface is the website or application through which users inspect proposals and manifests, contribute to funding rounds, finalize eligible launches, claim tokens, and request refunds. It is a convenience layer rather than a trusted part of execution.

```mermaid
flowchart LR
    A[Data sources] --> B[AI agent]
    B --> C[Launch manifest]
    C --> D[Funding contract]
    D --> E[Token and liquidity launch]
```

## Principles

- The agent proposes.
- The contracts execute.
- The backend is optional.
- Launch conditions are public.
- There is no insider allocation.
- Published launch terms cannot be silently changed.
