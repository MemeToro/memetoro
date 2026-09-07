// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Creates the token and seeds liquidity once a funding round succeeds.
///
/// The escrow deliberately knows nothing about token mechanics or which
/// exchange receives liquidity. It sends the entire raised balance as
/// `msg.value` and requires `contributorAllocation` tokens back so that
/// contributors can claim. Keeping that behind an interface lets the escrow's
/// fairness properties be tested without a DEX in the picture.
interface ILaunchExecutor {
    /// @param manifestHash Commitment to the published launch manifest.
    /// @param totalSupply Total token supply to create.
    /// @param contributorAllocation Tokens that must be transferred to the caller for claims.
    /// @param liquidityAllocation Tokens the executor pairs with the received value.
    /// @return token Address of the created token.
    function executeLaunch(
        bytes32 manifestHash,
        uint256 totalSupply,
        uint256 contributorAllocation,
        uint256 liquidityAllocation
    ) external payable returns (address token);
}
