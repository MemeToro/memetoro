// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {FairLaunchEscrow} from "../src/FairLaunchEscrow.sol";
import {IAgentIdentityRegistry} from "../src/interfaces/IAgentIdentityRegistry.sol";
import {ILaunchExecutor} from "../src/interfaces/ILaunchExecutor.sol";
import {RoundFactory} from "../src/RoundFactory.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockIdentityRegistry} from "./mocks/MockIdentityRegistry.sol";
import {MockLaunchExecutor} from "./mocks/MockLaunchExecutor.sol";

contract RoundFactoryTest is Test {
    uint256 internal constant AGENT_ID = 42;
    string internal constant MANIFEST_URI = "https://example.org/manifests/a.json";
    string internal constant RECORD_URI = "https://example.org/no-proposals/b.json";

    MockIdentityRegistry internal identity;
    MockLaunchExecutor internal executor;
    RoundFactory internal factory;

    address internal agentWallet = makeAddr("agent wallet");
    address internal stranger = makeAddr("stranger");

    function setUp() public {
        vm.warp(1_800_000_000);
        identity = new MockIdentityRegistry();
        executor = new MockLaunchExecutor();
        factory = new RoundFactory(identity, ILaunchExecutor(address(executor)));
        identity.setAgentWallet(AGENT_ID, agentWallet);
    }

    function _terms(bytes32 manifestHash) internal view returns (RoundFactory.RoundTerms memory terms) {
        uint64 start = uint64(block.timestamp + 1 hours);
        terms = RoundFactory.RoundTerms({
            manifestHash: manifestHash,
            walletCap: 1 ether,
            minimumThreshold: 2 ether,
            maximumThreshold: 5 ether,
            startTime: start,
            endTime: start + 24 hours,
            exitDeadline: start + 12 hours,
            finalizeGracePeriod: 7 days,
            tokenTotalSupply: 1_000_000_000 ether,
            contributorAllocationBps: 5_000,
            liquidityAllocationBps: 5_000
        });
    }

    function _create(bytes32 manifestHash) internal returns (FairLaunchEscrow) {
        vm.prank(agentWallet);
        return factory.createRound(AGENT_ID, _terms(manifestHash), MANIFEST_URI);
    }

    // ---------------------------------------------------------- construction

    function test_constructorRejectsMissingDependencies() public {
        vm.expectRevert(RoundFactory.InvalidIdentityRegistry.selector);
        new RoundFactory(IAgentIdentityRegistry(address(0)), ILaunchExecutor(address(executor)));

        vm.expectRevert(RoundFactory.InvalidExecutor.selector);
        new RoundFactory(identity, ILaunchExecutor(address(0)));
    }

    // -------------------------------------------------------------- rounds

    function test_agentWalletCreatesAListedRound() public {
        RoundFactory.RoundTerms memory terms = _terms(keccak256("manifest a"));

        vm.expectEmit(true, false, true, true, address(factory));
        emit RoundFactory.RoundCreated(AGENT_ID, address(0), terms.manifestHash, MANIFEST_URI);
        vm.prank(agentWallet);
        FairLaunchEscrow round = factory.createRound(AGENT_ID, terms, MANIFEST_URI);

        assertEq(factory.roundCount(), 1);
        assertEq(address(factory.rounds(0)), address(round));
        assertEq(factory.agentIdOf(address(round)), AGENT_ID);
        assertEq(factory.manifestURIOf(address(round)), MANIFEST_URI);
        assertEq(factory.roundOf(terms.manifestHash), address(round));
        assertTrue(factory.isRound(address(round)));
        assertFalse(factory.isRound(stranger));

        assertEq(round.manifestHash(), terms.manifestHash);
        assertEq(round.walletCap(), terms.walletCap);
        assertEq(round.exitDeadline(), terms.exitDeadline);
    }

    /// @dev The property that limits what a stolen agent key can do: whatever
    ///      it creates still launches through the executor fixed at deployment.
    function test_everyRoundLaunchesThroughTheFixedExecutor() public {
        FairLaunchEscrow first = _create(keccak256("manifest a"));
        FairLaunchEscrow second = _create(keccak256("manifest b"));

        assertEq(address(first.launchExecutor()), address(executor));
        assertEq(address(second.launchExecutor()), address(executor));
    }

    function test_onlyTheAgentsVerifiedWalletCanCreateRounds() public {
        RoundFactory.RoundTerms memory terms = _terms(keccak256("manifest a"));

        vm.expectRevert(abi.encodeWithSelector(RoundFactory.NotAgentWallet.selector, AGENT_ID, stranger));
        vm.prank(stranger);
        factory.createRound(AGENT_ID, terms, MANIFEST_URI);

        // A wallet verified for one agent cannot act as another.
        vm.expectRevert(abi.encodeWithSelector(RoundFactory.NotAgentWallet.selector, AGENT_ID + 1, agentWallet));
        vm.prank(agentWallet);
        factory.createRound(AGENT_ID + 1, terms, MANIFEST_URI);

        assertEq(factory.roundCount(), 0);
    }

    function testFuzz_noOtherCallerCanCreateRounds(address caller) public {
        vm.assume(caller != agentWallet);

        vm.expectRevert(abi.encodeWithSelector(RoundFactory.NotAgentWallet.selector, AGENT_ID, caller));
        vm.prank(caller);
        factory.createRound(AGENT_ID, _terms(keccak256("manifest a")), MANIFEST_URI);
    }

    /// @dev If the agent key leaks, the owner rotates the wallet in the
    ///      registry and the old key stops working here immediately.
    function test_rotatingTheAgentWalletRetiresTheOldOne() public {
        address replacement = makeAddr("replacement wallet");
        identity.setAgentWallet(AGENT_ID, replacement);

        vm.expectRevert(abi.encodeWithSelector(RoundFactory.NotAgentWallet.selector, AGENT_ID, agentWallet));
        vm.prank(agentWallet);
        factory.createRound(AGENT_ID, _terms(keccak256("manifest a")), MANIFEST_URI);

        vm.prank(replacement);
        factory.createRound(AGENT_ID, _terms(keccak256("manifest a")), MANIFEST_URI);
        assertEq(factory.roundCount(), 1);
    }

    function test_unsetAgentWalletBlocksEveryone() public {
        identity.setAgentWallet(AGENT_ID, address(0));

        vm.expectRevert(abi.encodeWithSelector(RoundFactory.NotAgentWallet.selector, AGENT_ID, agentWallet));
        vm.prank(agentWallet);
        factory.createRound(AGENT_ID, _terms(keccak256("manifest a")), MANIFEST_URI);
    }

    function test_aManifestBacksAtMostOneRound() public {
        bytes32 manifestHash = keccak256("manifest a");
        _create(manifestHash);

        vm.expectRevert(abi.encodeWithSelector(RoundFactory.ManifestAlreadyUsed.selector, manifestHash));
        vm.prank(agentWallet);
        factory.createRound(AGENT_ID, _terms(manifestHash), MANIFEST_URI);
    }

    function test_roundsNeedAManifestLocation() public {
        vm.expectRevert(RoundFactory.EmptyURI.selector);
        vm.prank(agentWallet);
        factory.createRound(AGENT_ID, _terms(keccak256("manifest a")), "");
    }

    /// @dev The factory adds no rules of its own to a round's terms; the
    ///      escrow's constructor checks still apply.
    function test_escrowRulesStillApply() public {
        RoundFactory.RoundTerms memory terms = _terms(keccak256("manifest a"));
        terms.exitDeadline = terms.endTime + 1;

        vm.expectRevert(FairLaunchEscrow.InvalidExitWindow.selector);
        vm.prank(agentWallet);
        factory.createRound(AGENT_ID, terms, MANIFEST_URI);

        terms = _terms(bytes32(0));
        vm.expectRevert(FairLaunchEscrow.InvalidManifestHash.selector);
        vm.prank(agentWallet);
        factory.createRound(AGENT_ID, terms, MANIFEST_URI);
    }

    function test_aFactoryRoundRunsTheWholeLifecycle() public {
        FairLaunchEscrow round = _create(keccak256("manifest a"));
        address alice = makeAddr("alice");
        address bob = makeAddr("bob");
        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);

        vm.warp(round.startTime());
        vm.prank(alice);
        round.contribute{value: 1 ether}();
        vm.prank(bob);
        round.contribute{value: 1 ether}();

        vm.warp(round.endTime());
        vm.prank(stranger);
        round.finalize();
        assertEq(executor.lastValue(), 2 ether, "the raise goes to the fixed executor");

        vm.prank(alice);
        round.claim();
        assertEq(MockERC20(round.token()).balanceOf(alice), round.contributorAllocation() / 2);
    }

    // ---------------------------------------------------------- no-proposal

    function test_agentWalletRecordsADecline() public {
        bytes32 recordHash = keccak256("record b");

        vm.expectEmit(true, true, false, true, address(factory));
        emit RoundFactory.NoProposalRecorded(AGENT_ID, recordHash, RECORD_URI);
        vm.prank(agentWallet);
        factory.recordNoProposal(AGENT_ID, recordHash, RECORD_URI);

        assertEq(factory.noProposalCount(), 1);
        assertTrue(factory.isRecorded(recordHash));
        (uint256 agentId, bytes32 storedHash, uint256 recordedAt, string memory uri) = factory.noProposals(0);
        assertEq(agentId, AGENT_ID);
        assertEq(storedHash, recordHash);
        assertEq(recordedAt, block.timestamp);
        assertEq(uri, RECORD_URI);
    }

    function test_declinesFollowTheSameRules() public {
        bytes32 recordHash = keccak256("record b");

        vm.expectRevert(abi.encodeWithSelector(RoundFactory.NotAgentWallet.selector, AGENT_ID, stranger));
        vm.prank(stranger);
        factory.recordNoProposal(AGENT_ID, recordHash, RECORD_URI);

        vm.startPrank(agentWallet);
        vm.expectRevert(RoundFactory.InvalidRecordHash.selector);
        factory.recordNoProposal(AGENT_ID, bytes32(0), RECORD_URI);

        vm.expectRevert(RoundFactory.EmptyURI.selector);
        factory.recordNoProposal(AGENT_ID, recordHash, "");

        factory.recordNoProposal(AGENT_ID, recordHash, RECORD_URI);
        vm.expectRevert(abi.encodeWithSelector(RoundFactory.RecordAlreadyUsed.selector, recordHash));
        factory.recordNoProposal(AGENT_ID, recordHash, RECORD_URI);
        vm.stopPrank();
    }

    function test_mockExecutorBehaviourIsOwnerOnly() public {
        vm.expectRevert(bytes("only owner"));
        vm.prank(stranger);
        executor.setBehaviour(MockLaunchExecutor.Behaviour.Revert);

        executor.setBehaviour(MockLaunchExecutor.Behaviour.Revert);
        assertEq(uint8(executor.behaviour()), uint8(MockLaunchExecutor.Behaviour.Revert));
    }
}
