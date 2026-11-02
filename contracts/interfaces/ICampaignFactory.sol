// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ICampaign} from "./ICampaign.sol";

/**
 * @title ICampaignFactory
 * @notice Interface for the factory that deploys one isolated Campaign per
 * project and keeps a registry of them for the frontend.
 */
interface ICampaignFactory {
    event CampaignCreated(
        address indexed campaign,
        address indexed creator,
        uint256 goal,
        uint64 fundingDeadline,
        uint256 milestoneCount
    );

    /// @notice Deploys a new Campaign with the caller as creator. Milestone shares must sum to 10000.
    function createCampaign(
        uint256 goal,
        uint64 fundingDeadline,
        ICampaign.MilestoneInput[] calldata milestones
    ) external returns (address campaign);

    /// @notice Stablecoin used by every campaign.
    function token() external view returns (address);

    /// @notice Number of campaigns deployed so far.
    function campaignCount() external view returns (uint256);

    /// @notice Campaign address at a registry index.
    function campaignAt(uint256 index) external view returns (address);

    /// @notice All campaigns created by one address.
    function campaignsByCreator(address creator) external view returns (address[] memory);
}
