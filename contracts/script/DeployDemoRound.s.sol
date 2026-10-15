// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";

import {FairLaunchEscrow} from "../src/FairLaunchEscrow.sol";
import {ILaunchExecutor} from "../src/interfaces/ILaunchExecutor.sol";
import {MockLaunchExecutor} from "../test/mocks/MockLaunchExecutor.sol";

/// @title DeployDemoRound
/// @notice Deploys a short throwaway round for exercising a funding interface
///         end to end: joining, withdrawing, the lock, launching, claiming, and
///         refunds.
///
/// The round launches through `MockLaunchExecutor`, which mints a mock token,
/// keeps the raise instead of providing liquidity, and lets anyone change how
/// it behaves. That is acceptable on a test chain and wrong anywhere else, so
/// the script refuses every chain except a local Anvil node and BNB Smart Chain
/// testnet.
///
/// Funding opens as soon as the round is deployed unless `DEMO_START_TIME` sets
/// a later moment. Every term can be overridden through the environment. The
/// defaults are small enough for faucet-funded testnet wallets, and the minimum
/// needs two wallets so the per-wallet cap is exercised as well.
contract DeployDemoRound is Script {
    uint256 internal constant ANVIL_CHAIN_ID = 31_337;
    uint256 internal constant BSC_TESTNET_CHAIN_ID = 97;

    uint256 internal constant SUPPLY = 1_000_000_000 ether;
    uint16 internal constant CONTRIBUTOR_BPS = 5_000;
    uint16 internal constant LIQUIDITY_BPS = 5_000;

    uint64 internal constant DEFAULT_FUNDING_WINDOW = 20 minutes;
    uint64 internal constant DEFAULT_EXIT_WINDOW = 10 minutes;
    uint64 internal constant DEFAULT_GRACE = 20 minutes;

    /// @dev Grouped rather than kept as locals because the escrow takes eleven
    ///      constructor arguments, which is more than the stack can hold
    ///      alongside the values needed to read them.
    struct DemoTerms {
        bytes32 manifestHash;
        uint256 walletCap;
        uint256 minimumThreshold;
        uint256 maximumThreshold;
        uint64 startTime;
        uint64 endTime;
        uint64 exitDeadline;
        uint64 finalizeGracePeriod;
    }

    error UnsupportedChain(uint256 chainId);

    function run() external returns (FairLaunchEscrow escrow, MockLaunchExecutor executor) {
        if (block.chainid != ANVIL_CHAIN_ID && block.chainid != BSC_TESTNET_CHAIN_ID) {
            revert UnsupportedChain(block.chainid);
        }

        DemoTerms memory terms = _readTerms();

        vm.startBroadcast();
        executor = new MockLaunchExecutor();
        escrow = new FairLaunchEscrow(
            terms.manifestHash,
            terms.walletCap,
            terms.minimumThreshold,
            terms.maximumThreshold,
            terms.startTime,
            terms.endTime,
            terms.exitDeadline,
            terms.finalizeGracePeriod,
            SUPPLY,
            CONTRIBUTOR_BPS,
            LIQUIDITY_BPS,
            ILaunchExecutor(address(executor))
        );
        vm.stopBroadcast();

        console.log("Chain ID:", block.chainid);
        console.log("FairLaunchEscrow:", address(escrow));
        console.log("MockLaunchExecutor:", address(executor));
        console.log("Withdrawals close at:", uint256(escrow.exitDeadline()));
        console.log("Funding closes at:", uint256(escrow.endTime()));
        console.log("Refunds open if not launched by:", uint256(escrow.finalizeDeadline()));
    }

    function _readTerms() internal view returns (DemoTerms memory terms) {
        terms.manifestHash = vm.envOr("DEMO_MANIFEST_HASH", keccak256("memetoro-demo-round"));
        terms.walletCap = vm.envOr("DEMO_WALLET_CAP_WEI", uint256(0.01 ether));
        terms.minimumThreshold = vm.envOr("DEMO_MINIMUM_WEI", uint256(0.02 ether));
        terms.maximumThreshold = vm.envOr("DEMO_MAXIMUM_WEI", uint256(0.05 ether));
        terms.startTime = _envUint64("DEMO_START_TIME", block.timestamp);
        terms.endTime = terms.startTime + _envUint64("DEMO_FUNDING_WINDOW_SECONDS", DEFAULT_FUNDING_WINDOW);
        terms.exitDeadline = terms.startTime + _envUint64("DEMO_EXIT_WINDOW_SECONDS", DEFAULT_EXIT_WINDOW);
        terms.finalizeGracePeriod = _envUint64("DEMO_GRACE_SECONDS", DEFAULT_GRACE);
    }

    function _envUint64(string memory name, uint256 defaultValue) internal view returns (uint64) {
        uint256 value = vm.envOr(name, defaultValue);
        require(value <= type(uint64).max, string.concat(name, " does not fit in uint64"));
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint64(value);
    }
}
