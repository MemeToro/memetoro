// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";

import {ManifestTerms} from "./ManifestTerms.sol";
import {FairLaunchEscrow} from "../src/FairLaunchEscrow.sol";
import {RoundFactory} from "../src/RoundFactory.sol";

/// @title PublishWindow
/// @notice Creates a factory round, or records a decline, from a document the
///         agent has already written to disk. Uses the same term-reading code
///         as `ManifestCommitment.t.sol`, so the numbers a test asserts are
///         the numbers that get deployed.
///
/// The document must already be reachable at `PUBLIC_URI`. The factory stores
/// that URI and never fetches it.
contract PublishWindow is Script, ManifestTerms {
    uint256 internal constant ANVIL_CHAIN_ID = 31_337;
    uint256 internal constant BSC_TESTNET_CHAIN_ID = 97;

    error UnsupportedChain(uint256 chainId);
    error UnknownDocumentKind();

    function run() external returns (address created) {
        if (block.chainid != ANVIL_CHAIN_ID && block.chainid != BSC_TESTNET_CHAIN_ID) {
            revert UnsupportedChain(block.chainid);
        }

        RoundFactory factory = RoundFactory(vm.envAddress("FACTORY"));
        uint256 agentId = vm.envUint("AGENT_ID");
        string memory documentPath = vm.envString("DOCUMENT_PATH");
        string memory publicUri = vm.envString("PUBLIC_URI");
        string memory document = vm.readFile(documentPath);

        vm.startBroadcast();
        if (_isKind(document, LAUNCH_MANIFEST_KIND)) {
            FairLaunchEscrow round = factory.createRound(agentId, _termsFrom(document), publicUri);
            created = address(round);
            console.log("Round:", created);
        } else if (_isKind(document, NO_PROPOSAL_KIND)) {
            bytes32 recordHash = vm.parseJsonBytes32(document, ".commitment.hash");
            factory.recordNoProposal(agentId, recordHash, publicUri);
            created = address(0);
            console.log("Recorded decline");
            console.logBytes32(recordHash);
        } else {
            revert UnknownDocumentKind();
        }
        vm.stopBroadcast();

        console.log("Factory:", address(factory));
        console.log("Agent ID:", agentId);
        console.log("Public URI:", publicUri);
    }
}
