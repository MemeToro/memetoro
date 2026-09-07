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

    bytes32 public lastManifestHash;
    uint256 public lastValue;
    uint256 public lastLiquidityAllocation;
    MockERC20 public token;

    function setBehaviour(Behaviour value) external {
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
