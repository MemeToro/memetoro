// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {Test} from "forge-std/Test.sol";

import {FairLaunchEscrow} from "../src/FairLaunchEscrow.sol";
import {ILaunchExecutor} from "../src/interfaces/ILaunchExecutor.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockLaunchExecutor} from "./mocks/MockLaunchExecutor.sol";

/// @notice Drives the escrow through random sequences of user actions and time
///         jumps, and records what it handed out so the invariants can check
///         the accounting from the outside.
contract EscrowHandler is CommonBase, StdCheats, StdUtils {
    FairLaunchEscrow public immutable escrow;

    address[] public actors;
    uint256 public valueContributed;
    uint256 public valueWithdrawn;
    uint256 public valueRefunded;
    uint256 public tokensReceived;
    uint256 public withdrawCalls;
    uint256 public refundCalls;
    uint256 public claimCalls;
    uint256 public finalizeCalls;

    constructor(FairLaunchEscrow escrow_, uint256 actorCount) {
        escrow = escrow_;
        for (uint256 i = 0; i < actorCount; i++) {
            address actor = address(uint160(uint256(keccak256(abi.encode("actor", i)))));
            actors.push(actor);
            vm.deal(actor, 1_000 ether);
        }
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function contribute(uint256 actorSeed, uint256 amount) external {
        address actor = _actor(actorSeed);
        // Reaches past the per-wallet cap often enough to exercise rejection,
        // while keeping most calls successful so rounds can actually fund.
        amount = bound(amount, 0, escrow.walletCap() * 3 / 2);

        vm.prank(actor);
        // Reverts are expected and uninteresting here; the invariants care
        // about the state that successful calls leave behind.
        try escrow.contribute{value: amount}() {
            valueContributed += amount;
        } catch {}
    }

    /// @dev Fills an actor's remaining allowance in one call. Random amounts
    ///      alone almost never stack up to the hard cap inside a single run,
    ///      which would leave the fully funded state unexplored.
    function contributeToWalletCap(uint256 actorSeed) external {
        address actor = _actor(actorSeed);
        uint256 walletRoom = escrow.walletCap() - escrow.contributionOf(actor);
        uint256 roundRoom = escrow.maximumThreshold() - escrow.totalContributed();
        uint256 amount = walletRoom < roundRoom ? walletRoom : roundRoom;
        if (amount == 0) return;

        vm.prank(actor);
        try escrow.contribute{value: amount}() {
            valueContributed += amount;
        } catch {}
    }

    function finalize(uint256 actorSeed) external {
        vm.prank(_actor(actorSeed));
        try escrow.finalize() {
            finalizeCalls++;
        } catch {}
    }

    function withdraw(uint256 actorSeed) external {
        address actor = _actor(actorSeed);
        uint256 balanceBefore = actor.balance;

        vm.prank(actor);
        try escrow.withdraw() {
            withdrawCalls++;
            valueWithdrawn += actor.balance - balanceBefore;
        } catch {}
    }

    function refund(uint256 actorSeed) external {
        address actor = _actor(actorSeed);
        uint256 balanceBefore = actor.balance;

        vm.prank(actor);
        try escrow.refund() {
            refundCalls++;
            valueRefunded += actor.balance - balanceBefore;
        } catch {}
    }

    function claim(uint256 actorSeed) external {
        address actor = _actor(actorSeed);
        address token = escrow.token();
        uint256 balanceBefore = token == address(0) ? 0 : MockERC20(token).balanceOf(actor);

        vm.prank(actor);
        try escrow.claim() {
            claimCalls++;
            tokensReceived += MockERC20(escrow.token()).balanceOf(actor) - balanceBefore;
        } catch {}
    }

    /// @dev Steps must be small relative to the funding window, or every run
    ///      jumps straight past it and the launch path is never explored.
    function advanceTime(uint256 seconds_) external {
        vm.warp(block.timestamp + bound(seconds_, 1 minutes, 12 hours));
    }
}

contract FairLaunchEscrowInvariantTest is Test {
    bytes32 internal constant MANIFEST_HASH = keccak256("memetoro-invariant-manifest");
    uint256 internal constant WALLET_CAP = 1 ether;
    // Thresholds must stay inside what the actor set can actually raise
    // (ACTORS * WALLET_CAP), otherwise the launch and hard-cap states are
    // unreachable and the invariants below hold only because nothing happens.
    uint256 internal constant MINIMUM = 2 ether;
    uint256 internal constant MAXIMUM = 5 ether;
    // The window and grace period must also be short enough that a run's time
    // steps can close funding and expire finalization, or the refund and
    // launch-after-deadline states are never explored.
    uint64 internal constant FUNDING_WINDOW = 2 days;
    // Must sit inside the funding window with room on both sides, so runs can
    // reach both the withdrawable state and the launchable state after it.
    uint64 internal constant EXIT_WINDOW = 1 days;
    uint64 internal constant GRACE = 2 days;
    uint256 internal constant SUPPLY = 1_000_000_000 ether;
    uint16 internal constant CONTRIBUTOR_BPS = 5_000;
    uint16 internal constant LIQUIDITY_BPS = 5_000;
    uint256 internal constant ACTORS = 8;

    FairLaunchEscrow internal escrow;
    MockLaunchExecutor internal executor;
    EscrowHandler internal handler;

    function setUp() public {
        vm.warp(1_800_000_000);
        executor = new MockLaunchExecutor();
        escrow = new FairLaunchEscrow(
            MANIFEST_HASH,
            WALLET_CAP,
            MINIMUM,
            MAXIMUM,
            uint64(block.timestamp),
            uint64(block.timestamp) + FUNDING_WINDOW,
            uint64(block.timestamp) + EXIT_WINDOW,
            GRACE,
            SUPPLY,
            CONTRIBUTOR_BPS,
            LIQUIDITY_BPS,
            ILaunchExecutor(address(executor))
        );

        handler = new EscrowHandler(escrow, ACTORS);
        targetContract(address(handler));
    }

    function _sumContributions() internal view returns (uint256 total) {
        for (uint256 i = 0; i < handler.actorCount(); i++) {
            total += escrow.contributionOf(handler.actors(i));
        }
    }

    /// @dev Guards the fixture above. Invariants about launched rounds prove
    ///      nothing if the handler can never reach a launched round, so these
    ///      drive each interesting state deliberately. A parameter change that
    ///      puts one out of reach fails here instead of silently weakening the
    ///      invariants to statements about an idle escrow.
    function test_fixtureCanReachHardCapLaunchAndClaims() public {
        for (uint256 i = 0; i < ACTORS; i++) {
            handler.contribute(i, WALLET_CAP);
        }
        assertEq(escrow.totalContributed(), MAXIMUM, "hard cap must be reachable");

        vm.warp(escrow.exitDeadline());
        handler.finalize(0);
        assertTrue(escrow.finalized(), "launch must be reachable");

        handler.claim(0);
        assertGt(escrow.totalClaimed(), 0, "claims must be reachable");
    }

    function test_fixtureCanReachWithdrawals() public {
        handler.contribute(0, WALLET_CAP);

        handler.withdraw(0);
        assertGt(escrow.totalWithdrawn(), 0, "withdrawals must be reachable");
    }

    function test_fixtureCanReachRefunds() public {
        handler.contribute(0, WALLET_CAP);
        vm.warp(escrow.endTime());

        handler.refund(0);
        assertGt(escrow.totalRefunded(), 0, "refunds must be reachable");
    }

    /// @dev The per-address ledger must always add up to the reported total.
    function invariant_contributionLedgerMatchesTotal() public view {
        assertEq(_sumContributions(), escrow.totalContributed());
    }

    /// @dev Published caps hold for every reachable state.
    function invariant_capsAreNeverExceeded() public view {
        assertLe(escrow.totalContributed(), escrow.maximumThreshold());
        for (uint256 i = 0; i < handler.actorCount(); i++) {
            assertLe(escrow.contributionOf(handler.actors(i)), escrow.walletCap());
        }
    }

    /// @dev Before a launch the contract holds exactly what it still owes.
    ///      After one it holds nothing, because the whole raise goes to liquidity.
    function invariant_escrowHoldsExactlyWhatItOwes() public view {
        if (escrow.finalized()) {
            assertEq(address(escrow).balance, 0);
        } else {
            assertEq(address(escrow).balance, escrow.totalContributed());
        }
    }

    /// @dev Every wei that came in is still held, went back to the address that
    ///      sent it, or went to liquidity at launch. Nothing else can happen to
    ///      it.
    ///
    ///      Note this cannot be bounded by the hard cap. Withdrawing frees a
    ///      wallet's room to contribute again, so cumulative inflow and outflow
    ///      both grow without limit as a round churns. The cap binds what the
    ///      round holds at any moment, not what passed through it.
    function invariant_nativeValueIsConserved() public view {
        uint256 sentToLaunch = escrow.finalized() ? executor.lastValue() : 0;

        assertEq(handler.valueWithdrawn(), escrow.totalWithdrawn());
        assertEq(handler.valueRefunded(), escrow.totalRefunded());
        assertEq(
            handler.valueContributed(),
            escrow.totalWithdrawn() + escrow.totalRefunded() + address(escrow).balance + sentToLaunch
        );
    }

    /// @dev Claims can never distribute more than the contributor allocation,
    ///      and rounding can only ever leave dust behind, never overspend.
    function invariant_claimsStayWithinContributorAllocation() public view {
        assertEq(handler.tokensReceived(), escrow.totalClaimed());
        assertLe(escrow.totalClaimed(), escrow.contributorAllocation());

        address token = escrow.token();
        if (token != address(0)) {
            assertEq(
                MockERC20(token).balanceOf(address(escrow)), escrow.contributorAllocation() - escrow.totalClaimed()
            );
        }
    }

    /// @dev Leaving and launching are mutually exclusive, so a contribution can
    ///      never be both taken back and converted into tokens.
    function invariant_leavingAndLaunchingAreMutuallyExclusive() public view {
        if (escrow.finalized()) {
            assertEq(escrow.totalRefunded(), 0);
            assertFalse(escrow.isRefundable());
            assertFalse(escrow.isWithdrawable(), "a launched round cannot be left");
        } else {
            assertEq(escrow.totalClaimed(), 0);
        }
        assertFalse(escrow.isFinalizable() && escrow.isRefundable());
        assertFalse(escrow.isFinalizable() && escrow.isWithdrawable());
    }

    /// @dev No sequence of calls can rewrite the committed terms.
    function invariant_termsRemainAsPublished() public view {
        assertEq(escrow.manifestHash(), MANIFEST_HASH);
        assertEq(escrow.walletCap(), WALLET_CAP);
        assertEq(escrow.minimumThreshold(), MINIMUM);
        assertEq(escrow.maximumThreshold(), MAXIMUM);
        assertEq(escrow.contributorAllocationBps() + escrow.liquidityAllocationBps(), 10_000);
    }

    /// @dev A launch is only reachable through the published conditions,
    ///      including the promise that nobody launches while contributors can
    ///      still walk away.
    function invariant_launchOnlyHappensOnPublishedConditions() public view {
        if (escrow.finalized()) {
            assertGe(escrow.totalContributed(), escrow.minimumThreshold());
            assertGe(block.timestamp, escrow.exitDeadline(), "launched inside the exit window");
            assertLe(handler.finalizeCalls(), 1);
        }
    }
}
