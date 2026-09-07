# MemeToro Contracts

MemeToro uses public smart contracts to apply each proposal's published launch rules deterministically. This directory holds a first draft of the funding escrow, together with the tests that check its fairness properties.

> [!WARNING]
> These contracts are an unaudited draft. They are not deployed on any network, have received no security review, and must not be used to collect real funds.

## What exists

| Path | Purpose |
| --- | --- |
| `src/FairLaunchEscrow.sol` | Funding escrow for one launch round |
| `src/interfaces/ILaunchExecutor.sol` | Boundary for token creation and liquidity |
| `src/interfaces/IERC20Minimal.sol` | The ERC-20 surface needed to pay claims |
| `test/` | Unit, fuzz, and invariant tests with mock executor and token |

## FairLaunchEscrow

The escrow accepts contributions in the network's native asset for a single round, then either executes the launch or returns every contribution. It is deliberately small: it holds funds and applies rules, and does nothing else.

Its guarantees are structural rather than promised:

- **Terms cannot change.** Every launch parameter is an immutable set once at construction. There is no setter, no owner, no admin role, and no upgrade path, so nothing can be adjusted after funding opens.
- **The manifest is committed.** The round stores a `manifestHash` at construction. The escrow never interprets it; it exists so anyone can verify that the terms enforced on-chain match the document that was published off-chain.
- **Value has two exits.** Native value leaves the contract only as a refund to the address that contributed it, or as the whole raise handed to the launch executor for liquidity. No path pays a deployer, developer, or treasury.
- **No insider allocation is representable.** The constructor requires the contributor and liquidity shares to sum to the full supply, so a round with a founder share cannot be constructed. Rounding dust from the pro-rata split is added to liquidity, never to an individual.
- **Nothing needs a backend.** Finalization, refunds, and claims are callable by anyone. Refunds also open automatically if finalization never happens, so a broken or unwilling executor cannot strand contributions.

Funding closes at the published end time. The round is finalizable once the minimum is met, either after that end time or as soon as the hard cap is reached. Contributions are refundable when the round closes below its minimum, and also once the finalization grace period expires. Those two states are mutually exclusive by construction: finalization is barred from the moment refunds open, so a contribution can never be both returned and converted into tokens.

## What is stubbed

Token creation and liquidity provision sit behind `ILaunchExecutor`. The escrow sends the entire raise as value and requires the contributor allocation back in tokens; it knows nothing about token mechanics, which exchange receives liquidity, or how LP tokens are handled. Keeping that boundary means the escrow's fairness properties can be tested without a DEX, and it is the next piece of real work.

## Requirements

[Foundry](https://getfoundry.sh) is required. `forge-std` is vendored as a git submodule, so clone with submodules or fetch them afterwards:

```sh
git submodule update --init --recursive
```

## Build and test

```sh
cd contracts
forge build
forge test
forge fmt --check
forge lint
```

The suite covers the funding window, per-wallet caps against both single and split contributions, the hard cap, threshold behaviour, permissionless finalization, the finalization deadline, pro-rata claims, refunds, and misbehaving executors and token contracts.

The invariant suite drives random sequences of contributions, refunds, claims, finalizations, and time jumps, then checks properties from the outside: the per-address ledger always equals the reported total, published caps always hold, the contract holds exactly what it still owes, nobody extracts more than they contributed, claims never exceed the contributor allocation, refunds and launches stay mutually exclusive, and the committed terms are unchanged.

An invariant that never reaches an interesting state passes while proving nothing, so `test_fixtureCanReachHardCapLaunchAndClaims` and `test_fixtureCanReachRefunds` drive each state deliberately. The fuzz parameters were tuned until the handler demonstrably reached the funded, launched, claimed, and refunded states; a change that puts one out of reach fails those tests instead of silently weakening every invariant into a statement about an idle escrow.

## Deliberately deferred

- The real launch executor: token deployment, liquidity provision, and LP handling.
- Canonical manifest serialization, so the committed hash can be reproduced from a published manifest. The escrow accepts a hash today, but the agent does not yet compute one, so the two halves are not yet connected.
- A factory for deploying rounds, and the deployment scripts that go with it.
- Testnet deployment and verification on BNB Smart Chain.
- ERC-8004 agent identity and reputation.
- Independent security review, which must precede any production use.
