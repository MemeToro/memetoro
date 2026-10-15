// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

/// @notice Keeps the published ABI in step with the compiled escrow.
///
/// Interfaces that call the escrow, the website among them, are built against
/// `abi/FairLaunchEscrow.json` rather than a local build. A stale copy would
/// let a page encode calls the contract does not have, or miss the errors it
/// needs to explain a revert, so the suite fails until the file is regenerated.
contract PublishedAbiTest is Test {
    string internal constant COMPILED_PATH = "out/FairLaunchEscrow.sol/FairLaunchEscrow.json";
    string internal constant PUBLISHED_PATH = "abi/FairLaunchEscrow.json";

    function test_publishedAbiMatchesTheCompiledEscrow() public view {
        bytes memory compiled = vm.parseJson(vm.readFile(COMPILED_PATH), ".abi");
        bytes memory published = vm.parseJson(vm.readFile(PUBLISHED_PATH));

        assertEq(
            keccak256(published),
            keccak256(compiled),
            "abi/FairLaunchEscrow.json is stale: run `node script/export-abi.mjs` after `forge build`"
        );
    }
}
