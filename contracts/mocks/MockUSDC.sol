// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockUSDC
 * @notice Test stablecoin for Sepolia and local tests. NOT for production.
 *
 * Uses 6 decimals like real USDC. Anyone can mint to themselves through
 * faucet() so teammates and graders can try the app without real funds.
 */
contract MockUSDC is ERC20 {
    uint256 public constant FAUCET_AMOUNT = 1_000 * 10 ** 6; // 1,000 mUSDC

    constructor() ERC20("Mock USDC", "mUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// Mint 1,000 mUSDC to the caller.
    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    /// Mint any amount to any address (testing helper).
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
