// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CommonBase} from "forge-std/Base.sol";

import {RoundFactory} from "../src/RoundFactory.sol";

/// @notice Reads a published launch manifest into the terms a round is created
///         with.
///
/// Shared by the suite that checks a manifest against the round deployed from
/// it and by the script that creates rounds on a live network, so the mapping
/// the tests prove is the one the agent actually uses.
abstract contract ManifestTerms is CommonBase {
    string internal constant LAUNCH_MANIFEST_KIND = "memetoro.launch-manifest";
    string internal constant NO_PROPOSAL_KIND = "memetoro.no-proposal";

    function _termsFrom(string memory manifest) internal pure returns (RoundFactory.RoundTerms memory terms) {
        terms.manifestHash = vm.parseJsonBytes32(manifest, ".commitment.hash");
        terms.walletCap = _amount(manifest, ".chainTerms.walletCapWei");
        terms.minimumThreshold = _amount(manifest, ".chainTerms.minimumThresholdWei");
        terms.maximumThreshold = _amount(manifest, ".chainTerms.maximumThresholdWei");
        terms.startTime = _uint64(manifest, ".chainTerms.startTime");
        terms.endTime = _uint64(manifest, ".chainTerms.endTime");
        terms.exitDeadline = _uint64(manifest, ".chainTerms.exitDeadline");
        terms.finalizeGracePeriod = _uint64(manifest, ".chainTerms.finalizeGracePeriodSeconds");
        terms.tokenTotalSupply = _amount(manifest, ".chainTerms.tokenTotalSupplyBaseUnits");
        terms.contributorAllocationBps = _uint16(manifest, ".chainTerms.contributorAllocationBps");
        terms.liquidityAllocationBps = _uint16(manifest, ".chainTerms.liquidityAllocationBps");
    }

    function _isKind(string memory document, string memory kind) internal pure returns (bool) {
        return keccak256(bytes(vm.parseJsonString(document, ".kind"))) == keccak256(bytes(kind));
    }

    /// @dev Amounts are published as decimal strings so no consumer has to
    ///      parse a number wider than its own float.
    function _amount(string memory manifest, string memory key) internal pure returns (uint256) {
        return vm.parseUint(vm.parseJsonString(manifest, key));
    }

    function _uint64(string memory manifest, string memory key) internal pure returns (uint64) {
        uint256 value = vm.parseJsonUint(manifest, key);
        require(value <= type(uint64).max, string.concat(key, " does not fit in uint64"));
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint64(value);
    }

    function _uint16(string memory manifest, string memory key) internal pure returns (uint16) {
        uint256 value = vm.parseJsonUint(manifest, key);
        require(value <= type(uint16).max, string.concat(key, " does not fit in uint16"));
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint16(value);
    }
}
