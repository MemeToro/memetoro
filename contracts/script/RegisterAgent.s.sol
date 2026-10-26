// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";

/// @notice The ERC-8004 identity calls this script needs. Kept here rather
///         than on the factory's interface, because the factory only reads
///         `getAgentWallet`.
interface IERC8004Identity {
    function register(string calldata agentURI) external returns (uint256 agentId);
    function getAgentWallet(uint256 agentId) external view returns (address);
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @title RegisterAgent
/// @notice Registers MemeToro on the official ERC-8004 identity registry on
///         BNB Smart Chain testnet. The minted agent wallet starts as the
///         broadcaster, which is the address the factory will accept for
///         `createRound` and `recordNoProposal`.
contract RegisterAgent is Script {
    uint256 internal constant BSC_TESTNET_CHAIN_ID = 97;
    IERC8004Identity internal constant IDENTITY = IERC8004Identity(0x8004A818BFB912233c491871b3d84c89A494BD9e);

    error UnsupportedChain(uint256 chainId);

    function run() external returns (uint256 agentId) {
        if (block.chainid != BSC_TESTNET_CHAIN_ID) {
            revert UnsupportedChain(block.chainid);
        }

        string memory agentURI = vm.envString("AGENT_URI");
        require(bytes(agentURI).length != 0, "AGENT_URI is empty");

        vm.startBroadcast();
        agentId = IDENTITY.register(agentURI);
        vm.stopBroadcast();

        console.log("IdentityRegistry:", address(IDENTITY));
        console.log("Agent ID:", agentId);
        console.log("Owner:", IDENTITY.ownerOf(agentId));
        console.log("Agent wallet:", IDENTITY.getAgentWallet(agentId));
        console.log("Agent URI:", agentURI);
    }
}
