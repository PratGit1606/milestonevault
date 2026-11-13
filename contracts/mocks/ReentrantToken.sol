// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ReentrantToken is ERC20 {
    address public callbackTarget;
    bytes public callbackData;
    bool public callbackEnabled;
    bool public callbackSucceeded;
    bool private _insideCallback;

    constructor() ERC20("Reentrant Token", "REENT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function armCallback(address target, bytes calldata data) external {
        callbackTarget = target;
        callbackData = data;
        callbackEnabled = true;
        callbackSucceeded = false;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        bool result = super.transfer(to, value);
        if (callbackEnabled && !_insideCallback) {
            _insideCallback = true;
            (callbackSucceeded,) = callbackTarget.call(callbackData);
            _insideCallback = false;
        }
        return result;
    }
}
