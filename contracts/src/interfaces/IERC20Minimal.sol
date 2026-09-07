// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice The only ERC-20 surface the escrow needs to distribute claims.
interface IERC20Minimal {
    function balanceOf(address account) external view returns (uint256);

    function transfer(address to, uint256 amount) external returns (bool);
}
