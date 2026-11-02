// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Campaign} from "./Campaign.sol";
import {ICampaign} from "./interfaces/ICampaign.sol";
import {ICampaignFactory} from "./interfaces/ICampaignFactory.sol";

/**
 * @title CampaignFactory
 * @notice Deploys a separate Campaign escrow for each project so funds in one
 * campaign cannot be reached through another, and keeps a registry the
 * frontend uses to list campaigns.
 */
contract CampaignFactory is ICampaignFactory {
    address public immutable override token;

    address[] private _campaigns;
    mapping(address => address[]) private _byCreator;

    constructor(address token_) {
        require(token_ != address(0), "Factory: zero token");
        token = token_;
    }

    /// @notice Deploys a new Campaign with the caller as creator. Callable by anyone at any time.
    function createCampaign(
        uint256 goal,
        uint64 fundingDeadline,
        ICampaign.MilestoneInput[] calldata milestones
    ) external override returns (address campaign) {
        Campaign c = new Campaign(token, msg.sender, goal, fundingDeadline, milestones);
        campaign = address(c);

        _campaigns.push(campaign);
        _byCreator[msg.sender].push(campaign);

        emit CampaignCreated(campaign, msg.sender, goal, fundingDeadline, milestones.length);
    }

    /// @notice Returns the number of campaigns deployed so far.
    function campaignCount() external view override returns (uint256) {
        return _campaigns.length;
    }

    /// @notice Returns the campaign address at a registry index.
    function campaignAt(uint256 index) external view override returns (address) {
        require(index < _campaigns.length, "Factory: bad index");
        return _campaigns[index];
    }

    /// @notice Returns all campaigns created by one address.
    function campaignsByCreator(address creator) external view override returns (address[] memory) {
        return _byCreator[creator];
    }
}
