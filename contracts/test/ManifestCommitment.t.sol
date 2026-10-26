// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {ManifestTerms} from "../script/ManifestTerms.sol";
import {FairLaunchEscrow} from "../src/FairLaunchEscrow.sol";
import {ILaunchExecutor} from "../src/interfaces/ILaunchExecutor.sol";
import {RoundFactory} from "../src/RoundFactory.sol";
import {MockIdentityRegistry} from "./mocks/MockIdentityRegistry.sol";
import {MockLaunchExecutor} from "./mocks/MockLaunchExecutor.sol";

/// @notice Checks the agent and the escrow against each other.
///
/// Both halves of MemeToro claim to describe the same launch round, but until
/// something reads one and builds the other, that agreement is only a claim.
/// This suite loads the manifest the pipeline publishes, deploys a round from
/// exactly those numbers, and asserts every enforced term equals the published
/// one. A pipeline change that alters a term, a unit, or a field name fails
/// here rather than at a deployment.
///
/// The terms are read by `ManifestTerms`, the same code the publishing script
/// uses to create rounds on a live network, so this also proves the mapping the
/// agent relies on.
///
/// Recomputing the digest is deliberately not attempted on-chain. The escrow
/// stores the commitment without interpreting it, and checking that it matches
/// a published document is an off-chain job for whoever is reading the
/// proposal.
contract ManifestCommitmentTest is Test, ManifestTerms {
    string internal constant MANIFEST_PATH = "../agent/pipeline/fixtures/expected-manifest.json";

    string internal manifest;
    MockLaunchExecutor internal executor;

    function setUp() public {
        manifest = vm.readFile(MANIFEST_PATH);
        executor = new MockLaunchExecutor();
    }

    function test_publishedDocumentIsALaunchManifest() public view {
        assertTrue(_isKind(manifest, LAUNCH_MANIFEST_KIND));
        assertEq(vm.parseJsonString(manifest, ".schemaVersion"), "0.4.0");
        assertEq(vm.parseJsonString(manifest, ".commitment.algorithm"), "sha256");
        assertTrue(vm.parseJsonBytes32(manifest, ".commitment.hash") != bytes32(0));
    }

    function test_escrowEnforcesExactlyThePublishedTerms() public {
        RoundFactory.RoundTerms memory terms = _termsFrom(manifest);

        // Deploy as the proposal would have been deployed: shortly before its
        // published opening time.
        vm.warp(uint256(terms.startTime) - 1 hours);

        FairLaunchEscrow round = new FairLaunchEscrow(
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
            ILaunchExecutor(address(executor))
        );

        _assertRoundMatches(round, terms);
    }

    /// @dev The route the hourly agent takes: the factory creates the round
    ///      from the terms read out of the published file.
    function test_factoryCreatesExactlyThePublishedRound() public {
        RoundFactory.RoundTerms memory terms = _termsFrom(manifest);
        MockIdentityRegistry identity = new MockIdentityRegistry();
        RoundFactory factory = new RoundFactory(identity, ILaunchExecutor(address(executor)));
        address agentWallet = makeAddr("agent wallet");
        identity.setAgentWallet(7, agentWallet);

        vm.warp(uint256(terms.startTime) - 1 hours);
        vm.prank(agentWallet);
        FairLaunchEscrow round = factory.createRound(7, terms, "https://example.org/manifest.json");

        _assertRoundMatches(round, terms);
        assertEq(factory.roundOf(terms.manifestHash), address(round));
    }

    function _assertRoundMatches(FairLaunchEscrow round, RoundFactory.RoundTerms memory terms) internal view {
        assertEq(round.manifestHash(), terms.manifestHash, "round must commit to the published manifest");
        assertEq(round.walletCap(), terms.walletCap);
        assertEq(round.minimumThreshold(), terms.minimumThreshold);
        assertEq(round.maximumThreshold(), terms.maximumThreshold);
        assertEq(round.startTime(), terms.startTime);
        assertEq(round.endTime(), terms.endTime);
        assertEq(round.exitDeadline(), terms.exitDeadline);
        assertEq(round.finalizeDeadline(), terms.endTime + terms.finalizeGracePeriod);
        assertEq(round.tokenTotalSupply(), terms.tokenTotalSupply);
        assertEq(round.contributorAllocationBps(), terms.contributorAllocationBps);
        assertEq(round.liquidityAllocationBps(), terms.liquidityAllocationBps);
        assertEq(address(round.launchExecutor()), address(executor));
    }

    /// @dev The escrow rejects terms it cannot enforce fairly, so a manifest
    ///      that fails these is one the agent should never have published.
    function test_publishedTermsSatisfyTheEscrowsOwnRules() public view {
        RoundFactory.RoundTerms memory terms = _termsFrom(manifest);

        assertLt(terms.startTime, terms.exitDeadline, "the exit window must open");
        assertLe(terms.exitDeadline, terms.endTime, "the exit window must close with funding at the latest");
        assertLe(terms.walletCap, terms.maximumThreshold);
        assertLe(terms.minimumThreshold, terms.maximumThreshold);
        assertEq(
            uint256(terms.contributorAllocationBps) + terms.liquidityAllocationBps,
            10_000,
            "the published split must assign the entire supply"
        );
    }

    /// @dev The readable terms a contributor sees must mean the same thing as
    ///      the integers the contract takes, checked here from the contract's
    ///      side rather than trusting the agent's own validation.
    function test_readableTermsAgreeWithEnforcedTerms() public view {
        assertEq(vm.parseJsonString(manifest, ".funding.walletCap"), "1");
        assertEq(_amount(manifest, ".chainTerms.walletCapWei"), 1 ether);

        assertEq(vm.parseJsonString(manifest, ".funding.minimumThreshold"), "10");
        assertEq(_amount(manifest, ".chainTerms.minimumThresholdWei"), 10 ether);

        assertEq(vm.parseJsonString(manifest, ".funding.maximumThreshold"), "50");
        assertEq(_amount(manifest, ".chainTerms.maximumThresholdWei"), 50 ether);

        assertEq(vm.parseJsonUint(manifest, ".token.contributorAllocationPercent") * 100, 5_000);
        assertEq(vm.parseJsonUint(manifest, ".token.insiderAllocationPercent"), 0);
    }
}
