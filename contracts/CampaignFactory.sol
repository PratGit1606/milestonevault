// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Campaign} from "./Campaign.sol";
import {ICampaign} from "./interfaces/ICampaign.sol";
import {ICampaignFactory} from "./interfaces/ICampaignFactory.sol";

/**
 * @title CampaignFactory
 * @notice Deploys one isolated Campaign escrow per project (DRAFT).
 *
 * Each campaign is its own contract with its own balance, so a bug or an
 * exploit in one campaign cannot drain the money held by another.
 * The factory keeps a registry so the frontend can list campaigns.
 */
contract CampaignFactory is ICampaignFactory {
    /// Stablecoin used by all campaigns (MockUSDC on Sepolia).
    address public immutable override token;

    address[] private _campaigns;
    mapping(address => address[]) private _byCreator;

    constructor(address token_) {
        require(token_ != address(0), "Factory: zero token");
        token = token_;
    }

    /// @inheritdoc ICampaignFactory
    function createCampaign(
        uint256 goal,
        uint64 fundingDeadline,
        ICampaign.MilestoneInput[] calldata milestones
    ) external override returns (address campaign) {
        // Campaign's constructor validates goal, deadline and milestone shares.
        Campaign c = new Campaign(token, msg.sender, goal, fundingDeadline, milestones);
        campaign = address(c);

        _campaigns.push(campaign);
        _byCreator[msg.sender].push(campaign);

        emit CampaignCreated(campaign, msg.sender, goal, fundingDeadline, milestones.length);
    }

    /// @inheritdoc ICampaignFactory
    function campaignCount() external view override returns (uint256) {
        return _campaigns.length;
    }

    /// @inheritdoc ICampaignFactory
    function campaignAt(uint256 index) external view override returns (address) {
        require(index < _campaigns.length, "Factory: bad index");
        return _campaigns[index];
    }

    /// @inheritdoc ICampaignFactory
    function campaignsByCreator(address creator) external view override returns (address[] memory) {
        return _byCreator[creator];
    }
}
