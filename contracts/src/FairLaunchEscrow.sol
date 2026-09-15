// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20Minimal} from "./interfaces/IERC20Minimal.sol";
import {ILaunchExecutor} from "./interfaces/ILaunchExecutor.sol";

/// @title FairLaunchEscrow
/// @notice Holds contributions for one MemeToro launch round and applies the
///         published terms without any privileged party.
///
/// Design constraints that make the fairness claims structural rather than
/// promised:
///
/// - Every launch term is immutable, set once at construction. There is no
///   setter, no owner, no admin role, and no upgrade path, so published terms
///   cannot be changed after funding opens.
/// - `manifestHash` commits to the published manifest. The escrow never
///   interprets it; it exists so anyone can check that the terms enforced here
///   match the document that was published.
/// - Native value leaves this contract only to the address that contributed it,
///   as a withdrawal or a refund, or to the launch executor at finalization.
///   No path pays a developer, deployer, or treasury.
/// - Contributors may withdraw freely until the published exit deadline, after
///   which the round locks. Finalization is barred until that deadline passes,
///   so the exit window is honoured even if the hard cap fills immediately.
/// - Token allocation is split between contributors and liquidity only.
///   Rounding dust is added to liquidity, never to an individual.
/// - Finalization, refunds, and claims are callable by anyone with no backend
///   involvement. Refunds also open if finalization never happens, so funds
///   cannot be stranded by a broken executor.
///
/// This contract is an unaudited first draft and is not deployed anywhere.
contract FairLaunchEscrow {
    uint16 internal constant BPS_DENOMINATOR = 10_000;
    uint64 internal constant MAX_FINALIZE_GRACE = 30 days;

    /// @notice Commitment to the published launch manifest.
    bytes32 public immutable manifestHash;
    /// @notice Maximum native value a single address may contribute.
    uint256 public immutable walletCap;
    /// @notice Minimum raise required for the launch to proceed.
    uint256 public immutable minimumThreshold;
    /// @notice Hard cap on the total raise.
    uint256 public immutable maximumThreshold;
    /// @notice First moment contributions are accepted.
    uint64 public immutable startTime;
    /// @notice First moment contributions are rejected.
    uint64 public immutable endTime;
    /// @notice First moment withdrawals are rejected and the round locks.
    uint64 public immutable exitDeadline;
    /// @notice Moment after which finalization is barred and refunds always open.
    uint64 public immutable finalizeDeadline;
    /// @notice Total token supply the executor must create.
    uint256 public immutable tokenTotalSupply;
    /// @notice Share of supply distributed to contributors, in basis points.
    uint16 public immutable contributorAllocationBps;
    /// @notice Share of supply paired with liquidity, in basis points.
    uint16 public immutable liquidityAllocationBps;
    /// @notice Contract that creates the token and seeds liquidity.
    ILaunchExecutor public immutable launchExecutor;

    /// @notice Outstanding contribution per address, reduced by withdrawals and refunds.
    mapping(address => uint256) public contributionOf;
    /// @notice Sum of all outstanding contributions.
    uint256 public totalContributed;
    /// @notice Cumulative native value taken back during the exit window.
    uint256 public totalWithdrawn;
    /// @notice Cumulative native value returned after a round failed to launch.
    uint256 public totalRefunded;
    /// @notice Cumulative tokens distributed through claims.
    uint256 public totalClaimed;
    /// @notice True once the launch has been executed.
    bool public finalized;
    /// @notice Token created by the executor, set at finalization.
    address public token;
    /// @notice Tokens reserved for contributor claims, set at finalization.
    uint256 public contributorAllocation;
    /// @notice Tracks which addresses have claimed.
    mapping(address => bool) public hasClaimed;

    event Contributed(address indexed contributor, uint256 amount, uint256 newTotalContributed);
    event Finalized(address indexed caller, uint256 raised, address token, uint256 contributorAllocation);
    event Withdrawn(address indexed contributor, uint256 amount, uint256 newTotalContributed);
    event Refunded(address indexed contributor, uint256 amount);
    event Claimed(address indexed contributor, uint256 amount);

    error InvalidManifestHash();
    error InvalidWindow();
    error InvalidExitWindow();
    error InvalidThresholds();
    error InvalidWalletCap();
    error InvalidAllocation();
    error InvalidSupply();
    error InvalidExecutor();
    error InvalidGracePeriod();
    error NotStarted();
    error FundingClosed();
    error ZeroContribution();
    error WalletCapExceeded(uint256 attempted, uint256 cap);
    error MaximumThresholdExceeded(uint256 attempted, uint256 remaining);
    error AlreadyFinalized();
    error NotFinalizable();
    error ExitWindowClosed();
    error NothingToWithdraw();
    error WithdrawTransferFailed();
    error NotRefundable();
    error NothingToRefund();
    error RefundTransferFailed();
    error NotLaunched();
    error AlreadyClaimed();
    error NothingToClaim();
    error ExecutorReturnedNoToken();
    error TokenNotDelivered(uint256 expected, uint256 received);
    error ClaimTransferFailed();

    constructor(
        bytes32 manifestHash_,
        uint256 walletCap_,
        uint256 minimumThreshold_,
        uint256 maximumThreshold_,
        uint64 startTime_,
        uint64 endTime_,
        uint64 exitDeadline_,
        uint64 finalizeGracePeriod_,
        uint256 tokenTotalSupply_,
        uint16 contributorAllocationBps_,
        uint16 liquidityAllocationBps_,
        ILaunchExecutor launchExecutor_
    ) {
        if (manifestHash_ == bytes32(0)) revert InvalidManifestHash();
        if (startTime_ >= endTime_ || endTime_ <= block.timestamp) revert InvalidWindow();
        // The exit window must open with funding and close no later than it, so
        // there is never a moment when funds are locked but still collectable.
        if (exitDeadline_ <= startTime_ || exitDeadline_ > endTime_) revert InvalidExitWindow();
        if (minimumThreshold_ == 0 || maximumThreshold_ < minimumThreshold_) {
            revert InvalidThresholds();
        }
        if (walletCap_ == 0 || walletCap_ > maximumThreshold_) revert InvalidWalletCap();
        if (
            contributorAllocationBps_ == 0 || liquidityAllocationBps_ == 0
                || contributorAllocationBps_ + liquidityAllocationBps_ != BPS_DENOMINATOR
        ) {
            revert InvalidAllocation();
        }
        if (tokenTotalSupply_ < BPS_DENOMINATOR) revert InvalidSupply();
        if (address(launchExecutor_) == address(0)) revert InvalidExecutor();
        if (finalizeGracePeriod_ == 0 || finalizeGracePeriod_ > MAX_FINALIZE_GRACE) {
            revert InvalidGracePeriod();
        }

        manifestHash = manifestHash_;
        walletCap = walletCap_;
        minimumThreshold = minimumThreshold_;
        maximumThreshold = maximumThreshold_;
        startTime = startTime_;
        endTime = endTime_;
        exitDeadline = exitDeadline_;
        finalizeDeadline = endTime_ + finalizeGracePeriod_;
        tokenTotalSupply = tokenTotalSupply_;
        contributorAllocationBps = contributorAllocationBps_;
        liquidityAllocationBps = liquidityAllocationBps_;
        launchExecutor = launchExecutor_;
    }

    /// @notice Contribute native value to the round.
    /// @dev There is no `receive` fallback on purpose: a plain transfer reverts
    ///      rather than being silently credited or lost.
    function contribute() external payable {
        if (finalized) revert AlreadyFinalized();
        if (block.timestamp < startTime) revert NotStarted();
        if (block.timestamp >= endTime) revert FundingClosed();
        if (msg.value == 0) revert ZeroContribution();

        uint256 newContribution = contributionOf[msg.sender] + msg.value;
        if (newContribution > walletCap) revert WalletCapExceeded(newContribution, walletCap);

        uint256 newTotal = totalContributed + msg.value;
        if (newTotal > maximumThreshold) {
            revert MaximumThresholdExceeded(newTotal, maximumThreshold - totalContributed);
        }

        contributionOf[msg.sender] = newContribution;
        totalContributed = newTotal;

        emit Contributed(msg.sender, msg.value, newTotal);
    }

    /// @notice Execute the launch. Callable by anyone once conditions are met.
    function finalize() external {
        if (finalized) revert AlreadyFinalized();
        if (!isFinalizable()) revert NotFinalizable();

        // Set before the external call so a reentrant attempt hits AlreadyFinalized.
        finalized = true;

        uint256 raised = totalContributed;
        uint256 contributorTokens = (tokenTotalSupply * contributorAllocationBps) / BPS_DENOMINATOR;
        // Remainder rather than a second division, so rounding dust goes to
        // liquidity instead of being left unassigned.
        uint256 liquidityTokens = tokenTotalSupply - contributorTokens;

        address launchedToken = launchExecutor.executeLaunch{value: raised}(
            manifestHash, tokenTotalSupply, contributorTokens, liquidityTokens
        );
        if (launchedToken == address(0)) revert ExecutorReturnedNoToken();

        uint256 delivered = IERC20Minimal(launchedToken).balanceOf(address(this));
        if (delivered < contributorTokens) revert TokenNotDelivered(contributorTokens, delivered);

        token = launchedToken;
        contributorAllocation = contributorTokens;

        // Cannot precede the executor call, which is what reveals the token
        // address. Reentry is already barred by the `finalized` flag above.
        // forge-lint: disable-next-line(reentrancy-events)
        emit Finalized(msg.sender, raised, launchedToken, contributorTokens);
    }

    /// @notice Take a contribution back while the exit window is still open.
    /// @dev Withdraws the caller's whole balance rather than a chosen amount.
    ///      Anyone wanting a smaller position can withdraw and contribute again,
    ///      which keeps this path to a single reachable state. Doing so frees up
    ///      the caller's room under the per-wallet cap, but the cap still binds
    ///      what any one address holds in the round at any moment.
    function withdraw() external {
        if (finalized) revert AlreadyFinalized();
        if (block.timestamp >= exitDeadline) revert ExitWindowClosed();

        uint256 amount = contributionOf[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        contributionOf[msg.sender] = 0;
        totalContributed -= amount;
        totalWithdrawn += amount;
        emit Withdrawn(msg.sender, amount, totalContributed);

        // forge-lint: disable-next-line(low-level-calls)
        (bool sent,) = msg.sender.call{value: amount}("");
        if (!sent) revert WithdrawTransferFailed();
    }

    /// @notice Reclaim a contribution when the round failed or was never finalized.
    function refund() external {
        if (!isRefundable()) revert NotRefundable();

        uint256 amount = contributionOf[msg.sender];
        if (amount == 0) revert NothingToRefund();

        contributionOf[msg.sender] = 0;
        totalContributed -= amount;
        totalRefunded += amount;
        emit Refunded(msg.sender, amount);

        // A raw call rather than `transfer`, so contract contributors are not
        // broken by the 2300 gas stipend. A failure reverts the whole refund.
        // forge-lint: disable-next-line(low-level-calls)
        (bool sent,) = msg.sender.call{value: amount}("");
        if (!sent) revert RefundTransferFailed();
    }

    /// @notice Claim the caller's pro-rata share of the contributor allocation.
    function claim() external {
        if (!finalized) revert NotLaunched();
        if (hasClaimed[msg.sender]) revert AlreadyClaimed();

        uint256 amount = claimableOf(msg.sender);
        if (amount == 0) revert NothingToClaim();

        // forge-lint: disable-next-line(missing-events-access-control)
        hasClaimed[msg.sender] = true;
        totalClaimed += amount;
        emit Claimed(msg.sender, amount);

        if (!IERC20Minimal(token).transfer(msg.sender, amount)) revert ClaimTransferFailed();
    }

    /// @notice Tokens the account can currently claim.
    function claimableOf(address account) public view returns (uint256) {
        if (!finalized || hasClaimed[account]) return 0;

        uint256 contribution = contributionOf[account];
        if (contribution == 0) return 0;

        return (contribution * contributorAllocation) / totalContributed;
    }

    /// @notice Whether the launch can be executed right now.
    function isFinalizable() public view returns (bool) {
        if (finalized) return false;
        if (totalContributed < minimumThreshold) return false;
        // Launching while contributors can still walk away would cut the exit
        // window short, so a round that fills its cap early still waits.
        if (block.timestamp < exitDeadline) return false;
        // Past this point refunds are open, so finalizing would let the same
        // contribution be both refunded and claimed.
        if (block.timestamp >= finalizeDeadline) return false;

        return block.timestamp >= endTime || totalContributed >= maximumThreshold;
    }

    /// @notice Whether the caller's contribution can currently be withdrawn.
    function isWithdrawable() public view returns (bool) {
        return !finalized && block.timestamp >= startTime && block.timestamp < exitDeadline;
    }

    /// @notice Whether contributions can currently be reclaimed.
    function isRefundable() public view returns (bool) {
        if (finalized) return false;
        if (block.timestamp >= finalizeDeadline) return true;

        return block.timestamp >= endTime && totalContributed < minimumThreshold;
    }
}
