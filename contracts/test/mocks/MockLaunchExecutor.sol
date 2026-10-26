// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ILaunchExecutor} from "../../src/interfaces/ILaunchExecutor.sol";
import {MockERC20} from "./MockERC20.sol";

/// @notice Stands in for the real token-and-liquidity step so the escrow's
///         fairness properties can be tested without a DEX.
contract MockLaunchExecutor is ILaunchExecutor {
    enum Behaviour {
        Honest,
        Revert,
        ReturnZeroToken,
        UnderDeliverTokens
    }

    Behaviour public behaviour = Behaviour.Honest;
    /// @notice Only the deployer can change behaviour, because demo rounds on a
    ///         public testnet share one executor and anyone else could break
    ///         every launch at once.
    address public immutable owner = msg.sender;

    bytes32 public lastManifestHash;
    uint256 public lastValue;
    uint256 public lastLiquidityAllocation;
    MockERC20 public token;

    function setBehaviour(Behaviour value) external {
        require(msg.sender == owner, "only owner");
        behaviour = value;
    }

    function executeLaunch(
        bytes32 manifestHash,
        uint256 totalSupply,
        uint256 contributorAllocation,
        uint256 liquidityAllocation
    ) external payable returns (address) {
        if (behaviour == Behaviour.Revert) {
            revert("executor failure");
        }

        lastManifestHash = manifestHash;
        lastValue = msg.value;
        lastLiquidityAllocation = liquidityAllocation;

        if (behaviour == Behaviour.ReturnZeroToken) {
            return address(0);
        }

        token = new MockERC20(totalSupply, address(this));

        uint256 delivered =
            behaviour == Behaviour.UnderDeliverTokens ? contributorAllocation - 1 : contributorAllocation;
        token.transfer(msg.sender, delivered);

        return address(token);
    }
}
