// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ICampaign
 * @notice Interface for one MilestoneVault campaign escrow. Each Campaign is
 * deployed by CampaignFactory, holds backer stablecoin, and pays the creator
 * one tranche per milestone after backers vote to approve it.
 */
interface ICampaign {
    enum Status {
        Funding,
        Active,
        Cancelled,
        Completed
    }

    enum MilestoneStatus {
        Pending,
        Voting,
        Approved,
        Rejected
    }

    struct MilestoneInput {
        uint16 shareBps;
        uint64 dueDate;
    }

    struct Milestone {
        uint16 shareBps;
        uint64 dueDate;
        string evidenceCid;
        MilestoneStatus status;
        uint8 attempts;
    }

    event Contributed(address indexed backer, uint256 amount, uint256 totalRaised);
    event FundingFinalized(bool goalMet, uint256 totalRaised);
    event MilestoneSubmitted(uint256 indexed index, string evidenceCid, uint64 votingEnds);
    event Voted(uint256 indexed index, address indexed backer, bool approve, uint256 weight);
    event MilestoneApproved(uint256 indexed index, uint256 amountReleased);
    event MilestoneRejected(uint256 indexed index, bool canResubmit);
    event CampaignCancelled(string reason);
    event CampaignCompleted();
    event Refunded(address indexed backer, uint256 amount);

    /// @notice Backer locks tokens in escrow. Only during Funding, before the deadline.
    function contribute(uint256 amount) external;

    /// @notice Backer votes on the open milestone, weighted by their contribution. Once per round.
    function vote(bool approve) external;

    /// @notice Backer withdraws their pro-rata share of the unreleased balance. Only after cancellation.
    function claimRefund() external;

    /// @notice Creator submits an IPFS CID as milestone evidence and opens a 3-day vote. Only before the due date.
    function submitMilestone(string calldata evidenceCid) external;

    /// @notice Anyone moves the campaign to Active or Cancelled after the funding deadline.
    function finalizeFunding() external;

    /// @notice Anyone tallies the vote after the window closes and releases, rejects, or cancels.
    function finalizeVote() external;

    /// @notice Anyone cancels the campaign once the current milestone is past its due date.
    function cancelIfOverdue() external;

    /// @notice Stablecoin held in escrow.
    function token() external view returns (IERC20);

    /// @notice Address that receives released tranches.
    function creator() external view returns (address);

    /// @notice Current campaign status.
    function status() external view returns (Status);

    /// @notice Funding goal in token units.
    function goal() external view returns (uint256);

    /// @notice Unix time when funding closes.
    function fundingDeadline() external view returns (uint64);

    /// @notice Total tokens contributed.
    function totalRaised() external view returns (uint256);

    /// @notice Total tokens already paid to the creator.
    function totalReleased() external view returns (uint256);

    /// @notice Index of the milestone being worked on.
    function currentMilestone() external view returns (uint256);

    /// @notice Unix time when the current vote closes.
    function votingEnds() external view returns (uint64);

    /// @notice Yes weight in the current vote.
    function yesWeight() external view returns (uint256);

    /// @notice No weight in the current vote.
    function noWeight() external view returns (uint256);

    /// @notice Number of milestones in this campaign.
    function milestoneCount() external view returns (uint256);

    /// @notice Amount a backer has contributed, which is also their vote weight.
    function contributionOf(address backer) external view returns (uint256);

    /// @notice Whether a backer has voted in the current round.
    function hasVoted(address backer) external view returns (bool);

    /// @notice Full data for one milestone.
    function getMilestone(uint256 index) external view returns (Milestone memory);
}
