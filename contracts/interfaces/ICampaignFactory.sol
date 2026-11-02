// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ICampaign} from "./ICampaign.sol";

/**
 * @title ICampaignFactory
 * @notice Public interface of the factory that deploys one isolated
 * Campaign escrow per project.
 */
interface ICampaignFactory {
    event CampaignCreated(
        address indexed campaign,
        address indexed creator,
        uint256 goal,
        uint64 fundingDeadline,
        uint256 milestoneCount
    );

    /// Deploy a new Campaign. The caller becomes the creator.
    /// Milestone shares must add up to 10000 basis points.
    function createCampaign(
        uint256 goal,
        uint64 fundingDeadline,
        ICampaign.MilestoneInput[] calldata milestones
    ) external returns (address campaign);

    /// The ERC-20 token (MockUSDC on Sepolia) used by every campaign.
    function token() external view returns (address);

    /// Number of campaigns deployed so far.
    function campaignCount() external view returns (uint256);

    /// Campaign address by index, for the frontend's campaign list.
    function campaignAt(uint256 index) external view returns (address);

    /// All campaigns created by one address.
    function campaignsByCreator(address creator) external view returns (address[] memory);
}
