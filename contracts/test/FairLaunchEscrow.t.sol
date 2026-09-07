// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {FairLaunchEscrow} from "../src/FairLaunchEscrow.sol";
import {ILaunchExecutor} from "../src/interfaces/ILaunchExecutor.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockLaunchExecutor} from "./mocks/MockLaunchExecutor.sol";

contract RefundRejector {
    FairLaunchEscrow internal escrow;

    constructor(FairLaunchEscrow escrow_) {
        escrow = escrow_;
    }

    function contribute(uint256 amount) external payable {
        escrow.contribute{value: amount}();
    }

    function refund() external {
        escrow.refund();
    }

    receive() external payable {
        revert("no thanks");
    }
}

contract FairLaunchEscrowTest is Test {
    bytes32 internal constant MANIFEST_HASH = keccak256("memetoro-manifest");
    uint256 internal constant WALLET_CAP = 1 ether;
    uint256 internal constant MINIMUM = 10 ether;
    uint256 internal constant MAXIMUM = 50 ether;
    uint64 internal constant GRACE = 7 days;
    uint256 internal constant SUPPLY = 1_000_000_000 ether;
    uint16 internal constant CONTRIBUTOR_BPS = 5_000;
    uint16 internal constant LIQUIDITY_BPS = 5_000;

    FairLaunchEscrow internal escrow;
    MockLaunchExecutor internal executor;

    uint64 internal startTime;
    uint64 internal endTime;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    function setUp() public {
        vm.warp(1_800_000_000);
        startTime = uint64(block.timestamp + 1 hours);
        endTime = startTime + 24 hours;
        executor = new MockLaunchExecutor();
        escrow = _deploy();

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
    }

    function _deploy() internal returns (FairLaunchEscrow) {
        return new FairLaunchEscrow(
            MANIFEST_HASH,
            WALLET_CAP,
            MINIMUM,
            MAXIMUM,
            startTime,
            endTime,
            GRACE,
            SUPPLY,
            CONTRIBUTOR_BPS,
            LIQUIDITY_BPS,
            ILaunchExecutor(address(executor))
        );
    }

    function _contribute(address who, uint256 amount) internal {
        vm.prank(who);
        escrow.contribute{value: amount}();
    }

    /// @dev Fills the round to the minimum threshold using distinct addresses,
    ///      because the per-wallet cap prevents any single one from doing it.
    function _raiseToMinimum() internal {
        vm.warp(startTime);
        for (uint256 i = 0; i < MINIMUM / WALLET_CAP; i++) {
            address contributor = address(uint160(0x1000 + i));
            vm.deal(contributor, WALLET_CAP);
            _contribute(contributor, WALLET_CAP);
        }
        assertEq(escrow.totalContributed(), MINIMUM);
    }

    // ---------------------------------------------------------------- terms

    function test_termsAreImmutableAndPubliclyReadable() public view {
        assertEq(escrow.manifestHash(), MANIFEST_HASH);
        assertEq(escrow.walletCap(), WALLET_CAP);
        assertEq(escrow.minimumThreshold(), MINIMUM);
        assertEq(escrow.maximumThreshold(), MAXIMUM);
        assertEq(escrow.startTime(), startTime);
        assertEq(escrow.endTime(), endTime);
        assertEq(escrow.finalizeDeadline(), endTime + GRACE);
        assertEq(escrow.contributorAllocationBps() + escrow.liquidityAllocationBps(), 10_000);
    }

    function test_constructorRejectsInvalidTerms() public {
        vm.expectRevert(FairLaunchEscrow.InvalidManifestHash.selector);
        new FairLaunchEscrow(
            bytes32(0),
            WALLET_CAP,
            MINIMUM,
            MAXIMUM,
            startTime,
            endTime,
            GRACE,
            SUPPLY,
            CONTRIBUTOR_BPS,
            LIQUIDITY_BPS,
            ILaunchExecutor(address(executor))
        );

        vm.expectRevert(FairLaunchEscrow.InvalidWindow.selector);
        new FairLaunchEscrow(
            MANIFEST_HASH,
            WALLET_CAP,
            MINIMUM,
            MAXIMUM,
            endTime,
            startTime,
            GRACE,
            SUPPLY,
            CONTRIBUTOR_BPS,
            LIQUIDITY_BPS,
            ILaunchExecutor(address(executor))
        );

        vm.expectRevert(FairLaunchEscrow.InvalidThresholds.selector);
        new FairLaunchEscrow(
            MANIFEST_HASH,
            WALLET_CAP,
            MAXIMUM,
            MINIMUM,
            startTime,
            endTime,
            GRACE,
            SUPPLY,
            CONTRIBUTOR_BPS,
            LIQUIDITY_BPS,
            ILaunchExecutor(address(executor))
        );

        vm.expectRevert(FairLaunchEscrow.InvalidWalletCap.selector);
        new FairLaunchEscrow(
            MANIFEST_HASH,
            MAXIMUM + 1,
            MINIMUM,
            MAXIMUM,
            startTime,
            endTime,
            GRACE,
            SUPPLY,
            CONTRIBUTOR_BPS,
            LIQUIDITY_BPS,
            ILaunchExecutor(address(executor))
        );

        vm.expectRevert(FairLaunchEscrow.InvalidGracePeriod.selector);
        new FairLaunchEscrow(
            MANIFEST_HASH,
            WALLET_CAP,
            MINIMUM,
            MAXIMUM,
            startTime,
            endTime,
            0,
            SUPPLY,
            CONTRIBUTOR_BPS,
            LIQUIDITY_BPS,
            ILaunchExecutor(address(executor))
        );
    }

    /// @dev Any split that leaves supply unassigned is rejected, so there is no
    ///      way to construct a round with an insider share.
    function test_constructorRejectsAllocationThatIsNotFullyAssigned() public {
        uint16[2][3] memory splits =
            [[uint16(4_000), uint16(5_000)], [uint16(0), uint16(10_000)], [uint16(10_000), uint16(0)]];

        for (uint256 i = 0; i < splits.length; i++) {
            vm.expectRevert(FairLaunchEscrow.InvalidAllocation.selector);
            new FairLaunchEscrow(
                MANIFEST_HASH,
                WALLET_CAP,
                MINIMUM,
                MAXIMUM,
                startTime,
                endTime,
                GRACE,
                SUPPLY,
                splits[i][0],
                splits[i][1],
                ILaunchExecutor(address(executor))
            );
        }
    }

    // --------------------------------------------------------- contributing

    function test_contributeRejectedBeforeStartAndAfterEnd() public {
        vm.expectRevert(FairLaunchEscrow.NotStarted.selector);
        _contribute(alice, 1 ether);

        vm.warp(endTime);
        vm.expectRevert(FairLaunchEscrow.FundingClosed.selector);
        _contribute(alice, 1 ether);
    }

    function test_contributeAccumulatesAndEmits() public {
        vm.warp(startTime);

        vm.expectEmit(true, false, false, true, address(escrow));
        emit FairLaunchEscrow.Contributed(alice, 0.4 ether, 0.4 ether);
        _contribute(alice, 0.4 ether);

        _contribute(alice, 0.6 ether);

        assertEq(escrow.contributionOf(alice), 1 ether);
        assertEq(escrow.totalContributed(), 1 ether);
        assertEq(address(escrow).balance, 1 ether);
    }

    function test_contributeRejectsZero() public {
        vm.warp(startTime);
        vm.expectRevert(FairLaunchEscrow.ZeroContribution.selector);
        _contribute(alice, 0);
    }

    function test_walletCapCannotBeExceededInOneGoOrBySplitting() public {
        vm.warp(startTime);

        vm.expectRevert(abi.encodeWithSelector(FairLaunchEscrow.WalletCapExceeded.selector, WALLET_CAP + 1, WALLET_CAP));
        _contribute(alice, WALLET_CAP + 1);

        _contribute(alice, 0.9 ether);
        vm.expectRevert(abi.encodeWithSelector(FairLaunchEscrow.WalletCapExceeded.selector, 1.1 ether, WALLET_CAP));
        _contribute(alice, 0.2 ether);

        assertEq(escrow.contributionOf(alice), 0.9 ether);
    }

    function test_maximumThresholdIsAHardCap() public {
        vm.warp(startTime);
        for (uint256 i = 0; i < MAXIMUM / WALLET_CAP; i++) {
            address contributor = address(uint160(0x2000 + i));
            vm.deal(contributor, WALLET_CAP);
            _contribute(contributor, WALLET_CAP);
        }
        assertEq(escrow.totalContributed(), MAXIMUM);

        vm.expectRevert(abi.encodeWithSelector(FairLaunchEscrow.MaximumThresholdExceeded.selector, MAXIMUM + 1 wei, 0));
        _contribute(alice, 1 wei);
    }

    function test_plainTransferReverts() public {
        vm.warp(startTime);
        vm.prank(alice);
        (bool sent,) = address(escrow).call{value: 1 ether}("");
        assertFalse(sent, "escrow must not accept bare transfers");
    }

    // ---------------------------------------------------------- finalizing

    function test_notFinalizableBeforeEndOrBelowMinimum() public {
        vm.warp(startTime);
        _contribute(alice, 1 ether);
        assertFalse(escrow.isFinalizable());

        vm.warp(endTime);
        assertFalse(escrow.isFinalizable(), "minimum not reached");

        vm.expectRevert(FairLaunchEscrow.NotFinalizable.selector);
        escrow.finalize();
    }

    function test_finalizableEarlyOnceMaximumReached() public {
        vm.warp(startTime);
        for (uint256 i = 0; i < MAXIMUM / WALLET_CAP; i++) {
            address contributor = address(uint160(0x3000 + i));
            vm.deal(contributor, WALLET_CAP);
            _contribute(contributor, WALLET_CAP);
        }

        assertTrue(escrow.isFinalizable(), "hard cap should allow early finalize");
    }

    function test_anyoneCanFinalizeAndFundsGoToLiquidity() public {
        _raiseToMinimum();
        vm.warp(endTime);

        vm.prank(carol);
        escrow.finalize();

        assertTrue(escrow.finalized());
        assertEq(address(escrow).balance, 0, "all raised value must leave for liquidity");
        assertEq(executor.lastValue(), MINIMUM);
        assertEq(executor.lastManifestHash(), MANIFEST_HASH);
        assertEq(escrow.contributorAllocation(), SUPPLY / 2);
        assertEq(executor.lastLiquidityAllocation(), SUPPLY - SUPPLY / 2);
    }

    function test_finalizeCannotRunTwice() public {
        _raiseToMinimum();
        vm.warp(endTime);
        escrow.finalize();

        vm.expectRevert(FairLaunchEscrow.AlreadyFinalized.selector);
        escrow.finalize();
    }

    function test_finalizeBarredOnceRefundsOpen() public {
        _raiseToMinimum();
        vm.warp(uint256(endTime) + GRACE);

        assertFalse(escrow.isFinalizable());
        assertTrue(escrow.isRefundable());
        vm.expectRevert(FairLaunchEscrow.NotFinalizable.selector);
        escrow.finalize();
    }

    function test_finalizeRevertsWhenExecutorMisbehaves() public {
        _raiseToMinimum();
        vm.warp(endTime);

        executor.setBehaviour(MockLaunchExecutor.Behaviour.Revert);
        vm.expectRevert(bytes("executor failure"));
        escrow.finalize();

        executor.setBehaviour(MockLaunchExecutor.Behaviour.ReturnZeroToken);
        vm.expectRevert(FairLaunchEscrow.ExecutorReturnedNoToken.selector);
        escrow.finalize();

        executor.setBehaviour(MockLaunchExecutor.Behaviour.UnderDeliverTokens);
        vm.expectRevert(abi.encodeWithSelector(FairLaunchEscrow.TokenNotDelivered.selector, SUPPLY / 2, SUPPLY / 2 - 1));
        escrow.finalize();

        assertFalse(escrow.finalized(), "a failed launch must leave the round open");
        assertEq(address(escrow).balance, MINIMUM, "contributions stay put");
    }

    // ------------------------------------------------------------- refunds

    function test_refundOpensWhenMinimumMissed() public {
        vm.warp(startTime);
        _contribute(alice, 1 ether);

        assertFalse(escrow.isRefundable());
        vm.warp(endTime);
        assertTrue(escrow.isRefundable());

        uint256 before = alice.balance;
        vm.prank(alice);
        escrow.refund();

        assertEq(alice.balance, before + 1 ether);
        assertEq(escrow.contributionOf(alice), 0);
        assertEq(escrow.totalContributed(), 0);
        assertEq(escrow.totalRefunded(), 1 ether);
    }

    function test_refundOpensWhenFinalizationNeverHappens() public {
        _raiseToMinimum();
        vm.warp(endTime);

        assertFalse(escrow.isRefundable(), "successful round is not refundable yet");

        vm.warp(uint256(endTime) + GRACE);
        assertTrue(escrow.isRefundable(), "stuck round must release funds");

        address contributor = address(uint160(0x1000));
        vm.prank(contributor);
        escrow.refund();
        assertEq(contributor.balance, WALLET_CAP);
    }

    function test_refundCannotBeTakenTwiceOrByNonContributor() public {
        vm.warp(startTime);
        _contribute(alice, 1 ether);
        vm.warp(endTime);

        vm.prank(alice);
        escrow.refund();

        vm.expectRevert(FairLaunchEscrow.NothingToRefund.selector);
        vm.prank(alice);
        escrow.refund();

        vm.expectRevert(FairLaunchEscrow.NothingToRefund.selector);
        vm.prank(bob);
        escrow.refund();
    }

    function test_refundBlockedAfterLaunch() public {
        _raiseToMinimum();
        vm.warp(endTime);
        escrow.finalize();

        assertFalse(escrow.isRefundable());
        vm.expectRevert(FairLaunchEscrow.NotRefundable.selector);
        vm.prank(address(uint160(0x1000)));
        escrow.refund();
    }

    function test_refundRevertsWhenRecipientRejectsValue() public {
        RefundRejector rejector = new RefundRejector(escrow);
        vm.deal(address(rejector), 1 ether);

        vm.warp(startTime);
        rejector.contribute{value: 1 ether}(1 ether);
        vm.warp(endTime);

        vm.expectRevert(FairLaunchEscrow.RefundTransferFailed.selector);
        rejector.refund();

        assertEq(escrow.contributionOf(address(rejector)), 1 ether, "failed refund must roll back");
    }

    // -------------------------------------------------------------- claims

    function test_claimsAreProRataAndSingleUse() public {
        vm.warp(startTime);
        _contribute(alice, 1 ether);
        _contribute(bob, 0.5 ether);
        for (uint256 i = 0; i < 9; i++) {
            address contributor = address(uint160(0x4000 + i));
            vm.deal(contributor, WALLET_CAP);
            _contribute(contributor, 1 ether);
        }

        uint256 raised = escrow.totalContributed();
        vm.warp(endTime);
        escrow.finalize();

        uint256 allocation = escrow.contributorAllocation();

        vm.prank(alice);
        escrow.claim();
        vm.prank(bob);
        escrow.claim();

        MockERC20 token = MockERC20(escrow.token());
        assertEq(token.balanceOf(alice), (1 ether * allocation) / raised);
        assertEq(token.balanceOf(bob), (0.5 ether * allocation) / raised);
        // Pro-rata shares are floored, so half the stake yields half the tokens
        // to within one unit of rounding dust.
        assertApproxEqAbs(token.balanceOf(bob) * 2, token.balanceOf(alice), 1, "half the stake, half the tokens");

        vm.expectRevert(FairLaunchEscrow.AlreadyClaimed.selector);
        vm.prank(alice);
        escrow.claim();
    }

    function test_claimBlockedBeforeLaunchAndForNonContributors() public {
        vm.expectRevert(FairLaunchEscrow.NotLaunched.selector);
        vm.prank(alice);
        escrow.claim();

        _raiseToMinimum();
        vm.warp(endTime);
        escrow.finalize();

        vm.expectRevert(FairLaunchEscrow.NothingToClaim.selector);
        vm.prank(alice);
        escrow.claim();
    }

    function test_claimRevertsWhenTokenTransferFails() public {
        _raiseToMinimum();
        vm.warp(endTime);
        escrow.finalize();

        MockERC20(escrow.token()).setTransfersFail(true);

        vm.expectRevert(FairLaunchEscrow.ClaimTransferFailed.selector);
        vm.prank(address(uint160(0x1000)));
        escrow.claim();
    }

    function test_claimableIsZeroOutsideTheClaimWindow() public {
        _raiseToMinimum();
        address contributor = address(uint160(0x1000));
        assertEq(escrow.claimableOf(contributor), 0, "nothing claimable before launch");

        vm.warp(endTime);
        escrow.finalize();

        assertGt(escrow.claimableOf(contributor), 0);
        vm.prank(contributor);
        escrow.claim();
        assertEq(escrow.claimableOf(contributor), 0, "nothing left after claiming");
    }

    // ---------------------------------------------------------------- fuzz

    function testFuzz_contributionNeverExceedsCapOrHardCap(uint96 first, uint96 second) public {
        vm.warp(startTime);
        vm.deal(alice, uint256(first) + uint256(second) + 1 ether);

        vm.prank(alice);
        try escrow.contribute{value: first}() {} catch {}
        vm.prank(alice);
        try escrow.contribute{value: second}() {} catch {}

        assertLe(escrow.contributionOf(alice), WALLET_CAP);
        assertLe(escrow.totalContributed(), MAXIMUM);
        assertEq(escrow.contributionOf(alice), address(escrow).balance);
    }

    function testFuzz_refundReturnsExactlyWhatWasContributed(uint256 seed) public {
        uint256 amount = bound(seed, 1, WALLET_CAP);

        vm.warp(startTime);
        vm.deal(alice, amount);
        _contribute(alice, amount);

        vm.warp(endTime);
        vm.prank(alice);
        escrow.refund();

        assertEq(alice.balance, amount, "refund must be exact");
        assertEq(address(escrow).balance, 0);
    }
}
