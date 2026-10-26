// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {FairLaunchEscrow} from "./FairLaunchEscrow.sol";
import {IAgentIdentityRegistry} from "./interfaces/IAgentIdentityRegistry.sol";
import {ILaunchExecutor} from "./interfaces/ILaunchExecutor.sol";

/// @title RoundFactory
/// @notice Creates launch rounds for agents registered under ERC-8004 and keeps a
///         public, enumerable record of them alongside every window in which an
///         agent declined to propose anything.
///
/// - Only an agent's verified wallet, as recorded in the ERC-8004 identity
///   registry, can create rounds or record declines under that agent's ID.
///   Anyone can register an agent and use this factory, so the check identifies
///   who proposed a round rather than restricting who may.
/// - The launch executor is fixed when the factory is deployed. A compromised
///   agent key can create unwanted rounds, but never one whose raise goes
///   anywhere other than this executor.
/// - Each manifest backs at most one round and each no-proposal record is
///   recorded once, so retrying a failed run cannot publish a duplicate.
/// - The factory holds no funds and has no owner. The rounds it creates are
///   ordinary `FairLaunchEscrow` contracts with no privileged roles either.
/// - Rounds and declines are readable through plain view calls, so an interface
///   can list them without an indexer or a backend.
///
/// This contract is an unaudited draft.
contract RoundFactory {
    /// @notice Every round term except the executor, which the factory fixes.
    struct RoundTerms {
        bytes32 manifestHash;
        uint256 walletCap;
        uint256 minimumThreshold;
        uint256 maximumThreshold;
        uint64 startTime;
        uint64 endTime;
        uint64 exitDeadline;
        uint64 finalizeGracePeriod;
        uint256 tokenTotalSupply;
        uint16 contributorAllocationBps;
        uint16 liquidityAllocationBps;
    }

    /// @notice A window in which an agent published a decision not to propose.
    struct NoProposal {
        uint256 agentId;
        bytes32 recordHash;
        uint256 recordedAt;
        string recordURI;
    }

    /// @notice ERC-8004 registry that says which wallet acts for each agent.
    IAgentIdentityRegistry public immutable identityRegistry;
    /// @notice Executor every round created here launches through.
    ILaunchExecutor public immutable launchExecutor;

    /// @notice Every round created here, oldest first.
    FairLaunchEscrow[] public rounds;
    /// @notice Agent that proposed each round.
    mapping(address round => uint256 agentId) public agentIdOf;
    /// @notice Where each round's published manifest can be fetched.
    mapping(address round => string uri) public manifestURIOf;
    /// @notice Round created for each manifest, or the zero address.
    mapping(bytes32 manifestHash => address round) public roundOf;

    /// @notice Every recorded decline, oldest first.
    NoProposal[] public noProposals;
    /// @notice Whether a no-proposal record has been recorded.
    mapping(bytes32 recordHash => bool) public isRecorded;

    event RoundCreated(
        uint256 indexed agentId, address indexed round, bytes32 indexed manifestHash, string manifestURI
    );
    event NoProposalRecorded(uint256 indexed agentId, bytes32 indexed recordHash, string recordURI);

    error InvalidIdentityRegistry();
    error InvalidExecutor();
    error NotAgentWallet(uint256 agentId, address caller);
    error EmptyURI();
    error ManifestAlreadyUsed(bytes32 manifestHash);
    error InvalidRecordHash();
    error RecordAlreadyUsed(bytes32 recordHash);

    constructor(IAgentIdentityRegistry identityRegistry_, ILaunchExecutor launchExecutor_) {
        if (address(identityRegistry_) == address(0)) revert InvalidIdentityRegistry();
        if (address(launchExecutor_) == address(0)) revert InvalidExecutor();

        identityRegistry = identityRegistry_;
        launchExecutor = launchExecutor_;
    }

    /// @notice Create a round for a published manifest on behalf of an agent.
    function createRound(uint256 agentId, RoundTerms calldata terms, string calldata manifestURI)
        external
        returns (FairLaunchEscrow round)
    {
        _requireAgentWallet(agentId);
        if (bytes(manifestURI).length == 0) revert EmptyURI();
        if (roundOf[terms.manifestHash] != address(0)) revert ManifestAlreadyUsed(terms.manifestHash);

        round = _deploy(terms);

        rounds.push(round);
        agentIdOf[address(round)] = agentId;
        manifestURIOf[address(round)] = manifestURI;
        roundOf[terms.manifestHash] = address(round);

        // The constructor cannot call back here. The address is only known
        // after the create, so the event has to follow it.
        // forge-lint: disable-next-line(reentrancy-events)
        emit RoundCreated(agentId, address(round), terms.manifestHash, manifestURI);
    }

    /// @notice Record that an agent published a decision not to propose.
    function recordNoProposal(uint256 agentId, bytes32 recordHash, string calldata recordURI) external {
        _requireAgentWallet(agentId);
        if (recordHash == bytes32(0)) revert InvalidRecordHash();
        if (bytes(recordURI).length == 0) revert EmptyURI();
        if (isRecorded[recordHash]) revert RecordAlreadyUsed(recordHash);

        isRecorded[recordHash] = true;
        noProposals.push(
            NoProposal({agentId: agentId, recordHash: recordHash, recordedAt: block.timestamp, recordURI: recordURI})
        );

        emit NoProposalRecorded(agentId, recordHash, recordURI);
    }

    /// @notice Number of rounds created here.
    function roundCount() external view returns (uint256) {
        return rounds.length;
    }

    /// @notice Number of declines recorded here.
    function noProposalCount() external view returns (uint256) {
        return noProposals.length;
    }

    /// @notice Whether an address is a round this factory created.
    function isRound(address round) external view returns (bool) {
        return bytes(manifestURIOf[round]).length != 0;
    }

    function _requireAgentWallet(uint256 agentId) internal view {
        if (identityRegistry.getAgentWallet(agentId) != msg.sender) revert NotAgentWallet(agentId, msg.sender);
    }

    function _deploy(RoundTerms calldata terms) internal returns (FairLaunchEscrow) {
        return new FairLaunchEscrow(
            terms.manifestHash,
            terms.walletCap,
            terms.minimumThreshold,
            terms.maximumThreshold,
            terms.startTime,
            terms.endTime,
            terms.exitDeadline,
            terms.finalizeGracePeriod,
            terms.tokenTotalSupply,
            terms.contributorAllocationBps,
            terms.liquidityAllocationBps,
            launchExecutor
        );
    }
}
