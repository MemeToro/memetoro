// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice The part of an ERC-8004 identity registry the round factory relies on.
/// @dev The registries sit at fixed addresses across chains. On BNB Smart Chain
///      testnet the identity registry is
///      0x8004A818BFB912233c491871b3d84c89A494BD9e, and on mainnet
///      0x8004A169FB4a3325136EB29fA0ceB6D2e539a432.
interface IAgentIdentityRegistry {
    /// @notice The wallet the agent's owner has verified as acting for it, or
    ///         the zero address if none is set.
    function getAgentWallet(uint256 agentId) external view returns (address);
}
