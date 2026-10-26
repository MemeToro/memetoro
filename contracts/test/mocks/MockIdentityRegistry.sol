// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAgentIdentityRegistry} from "../../src/interfaces/IAgentIdentityRegistry.sol";

/// @notice Stands in for the ERC-8004 identity registry, recording only which
///         wallet acts for each agent.
contract MockIdentityRegistry is IAgentIdentityRegistry {
    mapping(uint256 agentId => address wallet) internal wallets;

    function setAgentWallet(uint256 agentId, address wallet) external {
        wallets[agentId] = wallet;
    }

    function getAgentWallet(uint256 agentId) external view returns (address) {
        return wallets[agentId];
    }
}
