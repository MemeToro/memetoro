# Architecture

MemeToro separates idea generation from launch execution. The off-chain agent creates public proposals, while deterministic smart contracts enforce the published rules.

## Data sources

Dependency-free connectors collect current public signals for the agent. The initial connector queries Perplexity Sonar for broad worldwide-news coverage and xAI X Search for accelerating conversation on X. It returns structured candidates, evidence links, meme-relevance notes, and risk notes.

Connector responses are untrusted and may be incomplete, manipulated, or inaccurate. Later analysis must verify evidence, compare sources, preserve provenance, and reject unsafe or unsuitable topics. API providers and credentials are never part of the trusted launch path.

## Agent

The agent is the off-chain system that evaluates news, trends, culture, and market data, then creates meme-token proposals. The pipeline normalizes source records, asks the model to select and describe at most one candidate, and applies launch parameters from explicit policy. The model does not choose custody or execution rules and never controls contributor funds.

Two properties keep the agent honest about its own reasoning. It publishes every candidate it had available rather than only the winner, so a reader can assess the shortlist instead of accepting a conclusion. And it can decline: a window with nothing suitable produces a record explaining why, because a published shortlist means little if refusal is unreachable.

## Manifest

The launch manifest is the public, machine-readable record for a proposal. It contains the meme concept, market reasoning, risk assessment, cited evidence with its recorded context, countable source facts, the candidate selection record, token parameters, funding rules, launch conditions, and provenance. Once funding starts, its committed launch terms must not be silently changed.

The manifest stays canonical and machine-readable. Readable views are produced from it by a deterministic rendering function rather than written separately, so the page a contributor reads cannot state terms that differ from the ones the contracts would enforce.

Source facts are counts, never scores. Collection sources return no volume or engagement figures, so a strength rating would be invented, and invented precision is worse than none on a page where people decide to send funds.

## Smart contracts

Smart contracts are the deterministic system responsible for accepting funding, enforcing caps and deadlines, executing eligible launches, distributing token claims, and providing refunds when launch conditions are not met. These actions must remain available without the MemeToro backend.

The funding escrow is the first implemented piece. It holds one round's contributions and applies its published rules, with every launch parameter fixed as an immutable at construction so there is no owner, admin, or upgrade path able to change terms after funding opens. Native value can leave it only as a refund to the address that contributed it or as the whole raise handed to the launch executor, and the allocation split must assign the entire supply, so a round carrying an insider share cannot be constructed in the first place.

Refunds open automatically when a round closes below its minimum, and again if finalization never happens within a grace period, so a broken executor cannot strand contributions. Finalization is barred from the moment refunds open, which keeps the two paths mutually exclusive.

Token creation and liquidity provision sit behind an executor interface rather than inside the escrow. That boundary keeps the fairness properties testable without an exchange in the picture, and it is where the remaining launch work belongs.

## Manifest commitment

The escrow stores a hash of the manifest it was created for. It never interprets that hash; it exists so anyone can check that the terms enforced on-chain match the document published off-chain, which is what turns "published terms cannot be silently changed" from a stated intention into something a reader can verify.

The two halves are not yet joined. The escrow accepts a hash, but the agent does not yet produce a canonical serialization of a manifest to hash, so nothing currently guarantees the two describe the same round. Closing that gap requires a byte-exact canonical form that both sides agree on.

## Public interface

The public interface is the website or application through which users inspect proposals and manifests, contribute to funding rounds, finalize eligible launches, claim tokens, and request refunds. It is a convenience layer rather than a trusted part of execution.

```mermaid
flowchart LR
    A[Worldwide news] --> B[Data-source connectors]
    X[X conversation] --> B
    M[Future market feed] --> B
    B --> C[Signal normalization]
    C --> G[AI selection and concept]
    G --> P[Policy and validation]
    P --> N[No-proposal record]
    P --> D[Launch manifest]
    D --> R[Rendered public view]
    D --> H[Manifest hash commitment]
    H --> E[Fair-launch escrow]
    E --> F[Token and liquidity launch]
    E --> Y[Refunds]
```

## Principles

- The agent proposes.
- The contracts execute.
- The backend is optional.
- Launch conditions are public.
- There is no insider allocation.
- Published launch terms cannot be silently changed.
- A round commits to the manifest it was published under.
- Contributions are recoverable whenever a launch does not happen.
- The rejected shortlist is published alongside the winner.
- Declining to propose is a valid outcome.
- Published figures are counted, not scored.
