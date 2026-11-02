// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockUSDC
 * @notice Test stablecoin with 6 decimals that backers use to fund campaigns
 * on Sepolia and in local tests. Anyone can mint, so never use it for real funds.
 */
contract MockUSDC is ERC20 {
    uint256 public constant FAUCET_AMOUNT = 1_000 * 10 ** 6;

    constructor() ERC20("Mock USDC", "mUSDC") {}

    /// @notice Returns 6 to match real USDC.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mints 1,000 mUSDC to the caller. Callable by anyone.
    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    /// @notice Mints any amount to any address. Testing helper, callable by anyone.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
