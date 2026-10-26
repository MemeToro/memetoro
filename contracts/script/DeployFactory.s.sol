// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";

import {IAgentIdentityRegistry} from "../src/interfaces/IAgentIdentityRegistry.sol";
import {ILaunchExecutor} from "../src/interfaces/ILaunchExecutor.sol";
import {RoundFactory} from "../src/RoundFactory.sol";
import {MockIdentityRegistry} from "../test/mocks/MockIdentityRegistry.sol";
import {MockLaunchExecutor} from "../test/mocks/MockLaunchExecutor.sol";

/// @title DeployFactory
/// @notice Deploys the round factory and the mock executor it pins every round
///         to. On a local Anvil node it also deploys a stand-in identity
///         registry and registers the broadcaster as agent 1. On BNB Smart
///         Chain testnet it uses the official ERC-8004 identity registry; the
///         agent must already be registered there.
///
/// The executor is a mock: it mints a token and keeps the raise. That is why
/// this script refuses every chain except Anvil and BSC testnet.
contract DeployFactory is Script {
    uint256 internal constant ANVIL_CHAIN_ID = 31_337;
    uint256 internal constant BSC_TESTNET_CHAIN_ID = 97;
    address internal constant BSC_TESTNET_IDENTITY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;

    error UnsupportedChain(uint256 chainId);

    function run() external returns (RoundFactory factory, MockLaunchExecutor executor) {
        if (block.chainid != ANVIL_CHAIN_ID && block.chainid != BSC_TESTNET_CHAIN_ID) {
            revert UnsupportedChain(block.chainid);
        }

        vm.startBroadcast();
        executor = new MockLaunchExecutor();

        IAgentIdentityRegistry identity;
        uint256 agentId;
        if (block.chainid == ANVIL_CHAIN_ID) {
            MockIdentityRegistry local = new MockIdentityRegistry();
            agentId = 1;
            local.setAgentWallet(agentId, msg.sender);
            identity = local;
        } else {
            identity = IAgentIdentityRegistry(BSC_TESTNET_IDENTITY);
            agentId = vm.envUint("AGENT_ID");
            address wallet = identity.getAgentWallet(agentId);
            require(wallet == msg.sender, "broadcast wallet is not this agent's wallet");
        }

        factory = new RoundFactory(identity, ILaunchExecutor(address(executor)));
        vm.stopBroadcast();

        console.log("Chain ID:", block.chainid);
        console.log("RoundFactory:", address(factory));
        console.log("MockLaunchExecutor:", address(executor));
        console.log("IdentityRegistry:", address(factory.identityRegistry()));
        console.log("Agent ID:", agentId);
    }
}
