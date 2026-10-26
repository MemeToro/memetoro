// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

/// @notice Keeps the published ABIs in step with the compiled contracts.
///
/// Interfaces that call the escrow and the factory, the website among them,
/// are built against the files in `abi/` rather than a local build. A stale
/// copy would let a page encode calls the contract does not have, or miss the
/// errors it needs to explain a revert, so the suite fails until the files are
/// regenerated.
contract PublishedAbiTest is Test {
    function test_publishedEscrowAbiMatchesTheCompiledContract() public view {
        _assertPublished("FairLaunchEscrow");
    }

    function test_publishedFactoryAbiMatchesTheCompiledContract() public view {
        _assertPublished("RoundFactory");
    }

    function _assertPublished(string memory name) internal view {
        bytes memory compiled = vm.parseJson(vm.readFile(string.concat("out/", name, ".sol/", name, ".json")), ".abi");
        bytes memory published = vm.parseJson(vm.readFile(string.concat("abi/", name, ".json")));

        assertEq(
            keccak256(published),
            keccak256(compiled),
            string.concat("abi/", name, ".json is stale: run `node script/export-abi.mjs` after `forge build`")
        );
    }
}
