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
| `abi/FairLaunchEscrow.json` | The escrow's ABI, published for interfaces such as the website |
| `script/export-abi.mjs` | Regenerates the published ABI from the latest build |
| `script/DeployDemoRound.s.sol` | Deploys a throwaway round for testing an interface |
| `test/FairLaunchEscrow.t.sol` | Unit and fuzz tests |
| `test/FairLaunchEscrow.invariants.t.sol` | Invariants over randomized action sequences |
| `test/ManifestCommitment.t.sol` | Deploys a round from the manifest the agent publishes |
| `test/PublishedAbi.t.sol` | Fails when the published ABI no longer matches the contract |

## FairLaunchEscrow

The escrow accepts contributions in the network's native asset for a single round, then either executes the launch or returns every contribution. It is deliberately small: it holds funds and applies rules, and does nothing else.

Its guarantees are structural rather than promised:

- **Terms cannot change.** Every launch parameter is an immutable set once at construction. There is no setter, no owner, no admin role, and no upgrade path, so nothing can be adjusted after funding opens.
- **The manifest is committed.** The round stores a `manifestHash` at construction, the digest the agent publishes in the manifest's `commitment` block. The escrow never interprets it; it exists so anyone can verify that the round was deployed against the exact document that was published, rather than a quietly edited version of it.
- **Value only goes back or forward.** Native value leaves the contract only to the address that contributed it, as a withdrawal or a refund, or as the whole raise handed to the launch executor for liquidity. No path pays a deployer, developer, or treasury.
- **Contributors can change their mind.** Withdrawals are open from the moment funding starts until the published exit deadline, after which the round locks. Finalization is barred until that deadline passes, so a round that fills its cap in the first minute still cannot launch early and cut the exit window short.
- **No insider allocation is representable.** The constructor requires the contributor and liquidity shares to sum to the full supply, so a round with a founder share cannot be constructed. Rounding dust from the pro-rata split is added to liquidity, never to an individual.
- **Nothing needs a backend.** Finalization, refunds, and claims are callable by anyone. Refunds also open automatically if finalization never happens, so a broken or unwilling executor cannot strand contributions.

Funding closes at the published end time. The round is finalizable once the minimum is met and the exit window has closed, either after the end time or as soon as the hard cap is reached. Contributions are refundable when the round closes below its minimum, and also once the finalization grace period expires. Leaving and launching are mutually exclusive by construction: finalization cannot happen while withdrawals are open, and it is barred again from the moment refunds open, so a contribution can never be both taken back and converted into tokens.

Withdrawing frees the caller's room under the per-wallet cap, so the same address can contribute again. The cap therefore limits what any one address holds in a round at a given moment rather than what it has sent in total, and a round's cumulative inflow can exceed its hard cap as people come and go. A withdrawal can also drop a round below its minimum, which is the intended consequence: the contributors who stayed get refunds instead of a launch funded partly by money that walked out.

## Reading a round

Every action has a view that says whether it is available right now, so an interface can render a round without restating its timing or cap rules:

| Action | Call | Available when |
| --- | --- | --- |
| Join | `contribute()` with value | `contributableOf(account) > 0`, which is also the most that can be sent |
| Back out | `withdraw()` | `isWithdrawable()` and `contributionOf(account) > 0`; returns the whole balance |
| Launch | `finalize()` | `isFinalizable()`; anyone can call it |
| Claim | `claim()` | `claimableOf(account) > 0` |
| Refund | `refund()` | `isRefundable()` and `contributionOf(account) > 0` |

`contributableOf` is the smaller of the account's room under the wallet cap and the round's room under the hard cap, and zero whenever funding is closed. A fuzz test holds it to `contribute` itself: sending exactly that amount succeeds and one wei more reverts. `isContributable` reports only whether the window is open, regardless of room.

Funding outlasts the exit window. Money that joins after the exit deadline is accepted but can never be withdrawn, so an interface should say so before asking for a signature.

## Using a round without the website

None of these calls involve MemeToro's servers. Anyone with a round's address can make them from a block explorer's contract page once the source is verified, or from the command line:

```sh
cast call <round> "contributableOf(address)(uint256)" <your-address> --rpc-url <rpc>
cast send <round> "contribute()" --value 0.01ether --rpc-url <rpc> --account <keystore>
cast send <round> "withdraw()" --rpc-url <rpc> --account <keystore>
cast send <round> "finalize()" --rpc-url <rpc> --account <keystore>
cast send <round> "claim()" --rpc-url <rpc> --account <keystore>
cast send <round> "refund()" --rpc-url <rpc> --account <keystore>
```

## Published ABI

Interfaces, the website among them, are built against `abi/FairLaunchEscrow.json` rather than a local build. After changing the escrow's functions, events, or errors, regenerate it:

```sh
forge build
node script/export-abi.mjs
```

`test/PublishedAbi.t.sol` fails while the file is stale. The exporter writes the file itself instead of relying on shell redirection, which re-encodes output on some Windows shells.

## Demo rounds

`script/DeployDemoRound.s.sol` deploys a short round for testing an interface end to end. It launches through `MockLaunchExecutor`, which mints a mock token, keeps the raise instead of providing liquidity, and lets anyone change its behaviour, so the script refuses every chain except a local Anvil node (31337) and BNB Smart Chain testnet (97).

On Anvil, deploy from one of its unlocked accounts so no key is needed:

```sh
anvil
forge script script/DeployDemoRound.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
  --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

Anvil can move time forward to cross the exit deadline, the end time, or the finalization deadline without waiting:

```sh
cast rpc evm_increaseTime 601 --rpc-url http://127.0.0.1:8545
cast rpc evm_mine --rpc-url http://127.0.0.1:8545
```

On testnet, use a Foundry keystore (`cast wallet import`) holding faucet BNB. `--verify` publishes the source, so the explorer's contract page can make every call above:

```sh
forge script script/DeployDemoRound.s.sol --rpc-url https://data-seed-prebsc-1-s1.bnbchain.org:8545 \
  --broadcast --account <keystore> --verify --etherscan-api-key <key>
```

Funding opens at deployment. The terms can be overridden through the environment:

| Variable | Default |
| --- | --- |
| `DEMO_WALLET_CAP_WEI` | 0.01 BNB |
| `DEMO_MINIMUM_WEI` | 0.02 BNB, so the minimum needs two wallets |
| `DEMO_MAXIMUM_WEI` | 0.05 BNB |
| `DEMO_START_TIME` | The deployment block's timestamp |
| `DEMO_EXIT_WINDOW_SECONDS` | 600 |
| `DEMO_FUNDING_WINDOW_SECONDS` | 1200 |
| `DEMO_GRACE_SECONDS` | 1200 |
| `DEMO_MANIFEST_HASH` | `keccak256("memetoro-demo-round")` |

A round that reaches its minimum but never launches is worth testing too, because refunds open for it once the grace period passes. Calling `setBehaviour(1)` on the demo executor makes every finalization revert:

```sh
cast send <executor> "setBehaviour(uint8)" 1 --rpc-url http://127.0.0.1:8545 \
  --unlocked --from 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

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

The suite covers the funding window, per-wallet caps against both single and split contributions, the hard cap, threshold behaviour, the exit window and its effect on early finalization, permissionless finalization, the finalization deadline, pro-rata claims, refunds, misbehaving executors and token contracts, the agreement between `contributableOf` and `contribute`, and the published ABI.

The invariant suite drives random sequences of contributions, withdrawals, refunds, claims, finalizations, and time jumps, then checks properties from the outside: the per-address ledger always equals the reported total, published caps always hold, the offered maximum contribution never breaks one and is zero once a round stops collecting or can launch, the contract holds exactly what it still owes, every wei is conserved between what is held, what went back to its contributor, and what went to liquidity, claims never exceed the contributor allocation, leaving and launching stay mutually exclusive, a launch never happens inside the exit window, and the committed terms are unchanged.

An invariant that never reaches an interesting state passes while proving nothing, so `test_fixtureCanReachHardCapLaunchAndClaims`, `test_fixtureCanReachWithdrawals`, and `test_fixtureCanReachRefunds` drive each state deliberately. The fuzz parameters were tuned until the handler demonstrably reached the funded, launched, claimed, withdrawn, and refunded states; a change that puts one out of reach fails those tests instead of silently weakening every invariant into a statement about an idle escrow.

## Checked against the agent

`ManifestCommitment.t.sol` reads `agent/pipeline/fixtures/expected-manifest.json`, the manifest the pipeline publishes, and deploys a round from exactly those numbers. It asserts every immutable equals the published term, that the readable terms mean the same as the enforced ones, and that the round commits to the manifest's own digest.

Both halves of MemeToro claim to describe the same launch round, and until something reads one and builds the other that agreement is only a claim. A pipeline change that alters a term, a unit, or a field name fails here rather than at a deployment. The agent suite pins the same file from its side, so neither half can move without the other noticing.

Recomputing the digest on-chain is deliberately not attempted. The escrow stores the commitment without interpreting it, and checking it against a published document is an off-chain job for whoever is reading the proposal.

## Deliberately deferred

- The real launch executor: token deployment, liquidity provision, and LP handling.
- A factory for deploying real rounds, and the deployment scripts that go with it. The demo script only exists to test interfaces against a mock executor.
- Testnet deployment and verification on BNB Smart Chain.
- ERC-8004 agent identity and reputation.
- Independent security review, which must precede any production use.
