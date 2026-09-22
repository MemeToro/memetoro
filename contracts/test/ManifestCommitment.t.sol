// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {FairLaunchEscrow} from "../src/FairLaunchEscrow.sol";
import {ILaunchExecutor} from "../src/interfaces/ILaunchExecutor.sol";
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
/// Recomputing the digest is deliberately not attempted on-chain. The escrow
/// stores the commitment without interpreting it, and checking that it matches
/// a published document is an off-chain job for whoever is reading the
/// proposal.
contract ManifestCommitmentTest is Test {
    string internal constant MANIFEST_PATH = "../agent/pipeline/fixtures/expected-manifest.json";

    /// @dev Grouped rather than kept as locals because the escrow takes eleven
    ///      constructor arguments, which is one more than the stack can hold
    ///      alongside the values needed to read them.
    struct PublishedTerms {
        bytes32 manifestHash;
        uint256 walletCap;
        uint256 minimumThreshold;
        uint256 maximumThreshold;
        uint64 startTime;
        uint64 endTime;
        uint64 exitDeadline;
        uint64 finalizeGracePeriod;
        uint256 tokenTotalSupply;
        uint16 contributorBps;
        uint16 liquidityBps;
    }

    string internal manifest;
    MockLaunchExecutor internal executor;

    function setUp() public {
        manifest = vm.readFile(MANIFEST_PATH);
        executor = new MockLaunchExecutor();
    }

    /// @dev Amounts are published as decimal strings so no consumer has to
    ///      parse a number wider than its own float.
    function _amount(string memory key) internal view returns (uint256) {
        return vm.parseUint(vm.parseJsonString(manifest, key));
    }

    function _seconds(string memory key) internal view returns (uint64) {
        return uint64(vm.parseJsonUint(manifest, key));
    }

    function test_publishedDocumentIsALaunchManifest() public view {
        assertEq(vm.parseJsonString(manifest, ".kind"), "memetoro.launch-manifest");
        assertEq(vm.parseJsonString(manifest, ".schemaVersion"), "0.3.0");
        assertEq(vm.parseJsonString(manifest, ".commitment.algorithm"), "sha256");
        assertTrue(vm.parseJsonBytes32(manifest, ".commitment.hash") != bytes32(0));
    }

    function _readTerms() internal view returns (PublishedTerms memory terms) {
        terms.manifestHash = vm.parseJsonBytes32(manifest, ".commitment.hash");
        terms.walletCap = _amount(".chainTerms.walletCapWei");
        terms.minimumThreshold = _amount(".chainTerms.minimumThresholdWei");
        terms.maximumThreshold = _amount(".chainTerms.maximumThresholdWei");
        terms.startTime = _seconds(".chainTerms.startTime");
        terms.endTime = _seconds(".chainTerms.endTime");
        terms.exitDeadline = _seconds(".chainTerms.exitDeadline");
        terms.finalizeGracePeriod = _seconds(".chainTerms.finalizeGracePeriodSeconds");
        terms.tokenTotalSupply = _amount(".chainTerms.tokenTotalSupplyBaseUnits");
        terms.contributorBps = uint16(vm.parseJsonUint(manifest, ".chainTerms.contributorAllocationBps"));
        terms.liquidityBps = uint16(vm.parseJsonUint(manifest, ".chainTerms.liquidityAllocationBps"));
    }

    function test_escrowEnforcesExactlyThePublishedTerms() public {
        PublishedTerms memory terms = _readTerms();

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
            terms.contributorBps,
            terms.liquidityBps,
            ILaunchExecutor(address(executor))
        );

        assertEq(round.manifestHash(), terms.manifestHash, "round must commit to the published manifest");
        assertEq(round.walletCap(), terms.walletCap);
        assertEq(round.minimumThreshold(), terms.minimumThreshold);
        assertEq(round.maximumThreshold(), terms.maximumThreshold);
        assertEq(round.startTime(), terms.startTime);
        assertEq(round.endTime(), terms.endTime);
        assertEq(round.exitDeadline(), terms.exitDeadline);
        assertEq(round.finalizeDeadline(), terms.endTime + terms.finalizeGracePeriod);
        assertEq(round.tokenTotalSupply(), terms.tokenTotalSupply);
        assertEq(round.contributorAllocationBps(), terms.contributorBps);
        assertEq(round.liquidityAllocationBps(), terms.liquidityBps);
    }

    /// @dev The escrow rejects terms it cannot enforce fairly, so a manifest
    ///      that fails these is one the agent should never have published.
    function test_publishedTermsSatisfyTheEscrowsOwnRules() public view {
        uint64 startTime = _seconds(".chainTerms.startTime");
        uint64 endTime = _seconds(".chainTerms.endTime");
        uint64 exitDeadline = _seconds(".chainTerms.exitDeadline");

        assertLt(startTime, exitDeadline, "the exit window must open");
        assertLe(exitDeadline, endTime, "the exit window must close with funding at the latest");
        assertLe(_amount(".chainTerms.walletCapWei"), _amount(".chainTerms.maximumThresholdWei"));
        assertLe(_amount(".chainTerms.minimumThresholdWei"), _amount(".chainTerms.maximumThresholdWei"));
        assertEq(
            vm.parseJsonUint(manifest, ".chainTerms.contributorAllocationBps")
                + vm.parseJsonUint(manifest, ".chainTerms.liquidityAllocationBps"),
            10_000,
            "the published split must assign the entire supply"
        );
    }

    /// @dev The readable terms a contributor sees must mean the same thing as
    ///      the integers the contract takes, checked here from the contract's
    ///      side rather than trusting the agent's own validation.
    function test_readableTermsAgreeWithEnforcedTerms() public view {
        assertEq(vm.parseJsonString(manifest, ".funding.walletCap"), "1");
        assertEq(_amount(".chainTerms.walletCapWei"), 1 ether);

        assertEq(vm.parseJsonString(manifest, ".funding.minimumThreshold"), "10");
        assertEq(_amount(".chainTerms.minimumThresholdWei"), 10 ether);

        assertEq(vm.parseJsonString(manifest, ".funding.maximumThreshold"), "50");
        assertEq(_amount(".chainTerms.maximumThresholdWei"), 50 ether);

        assertEq(vm.parseJsonUint(manifest, ".token.contributorAllocationPercent") * 100, 5_000);
        assertEq(vm.parseJsonUint(manifest, ".token.insiderAllocationPercent"), 0);
    }
}
