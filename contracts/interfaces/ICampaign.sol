// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ICampaign
 * @notice Public interface of a single MilestoneVault crowdfunding campaign.
 *
 * A Campaign is an escrow. Backers lock stablecoin in it, and the creator
 * receives the money in tranches, one per milestone, only after backers
 * vote to approve the milestone. If the goal is missed, a milestone is
 * rejected, or a deadline passes, backers can pull back their remaining share.
 */
interface ICampaign {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /// Lifecycle of the whole campaign.
    enum Status {
        Funding,   // accepting contributions until fundingDeadline
        Active,    // goal met, milestones are being delivered and voted on
        Cancelled, // goal missed, milestone rejected twice, or deadline missed
        Completed  // every milestone approved and paid out
    }

    /// Lifecycle of one milestone.
    enum MilestoneStatus {
        Pending,   // not yet submitted by the creator
        Voting,    // evidence submitted, voting window open
        Approved,  // vote passed, tranche released
        Rejected   // vote failed, may be resubmitted once
    }

    /// Input used when a campaign is created.
    struct MilestoneInput {
        uint16 shareBps; // share of total funds in basis points (10000 = 100%)
        uint64 dueDate;  // unix time by which the milestone must be approved
    }

    /// Stored data for one milestone.
    struct Milestone {
        uint16 shareBps;
        uint64 dueDate;
        string evidenceCid;    // IPFS CID of the creator's proof of work
        MilestoneStatus status;
        uint8 attempts;        // submissions so far (max 2: one resubmission)
    }

    // ---------------------------------------------------------------------
    // Events (the frontend builds its dashboard from these)
    // ---------------------------------------------------------------------

    event Contributed(address indexed backer, uint256 amount, uint256 totalRaised);
    event FundingFinalized(bool goalMet, uint256 totalRaised);
    event MilestoneSubmitted(uint256 indexed index, string evidenceCid, uint64 votingEnds);
    event Voted(uint256 indexed index, address indexed backer, bool approve, uint256 weight);
    event MilestoneApproved(uint256 indexed index, uint256 amountReleased);
    event MilestoneRejected(uint256 indexed index, bool canResubmit);
    event CampaignCancelled(string reason);
    event CampaignCompleted();
    event Refunded(address indexed backer, uint256 amount);

    // ---------------------------------------------------------------------
    // Backer actions
    // ---------------------------------------------------------------------

    /// Lock `amount` of the campaign token in escrow. Funding phase only.
    function contribute(uint256 amount) external;

    /// Cast a vote on the milestone currently open for voting.
    /// Vote weight equals the backer's total contribution.
    function vote(bool approve) external;

    /// Pull back the caller's pro-rata share of the unreleased balance.
    /// Only works after the campaign is cancelled.
    function claimRefund() external;

    // ---------------------------------------------------------------------
    // Creator actions
    // ---------------------------------------------------------------------

    /// Submit evidence (IPFS CID) for the current milestone and open voting.
    function submitMilestone(string calldata evidenceCid) external;

    // ---------------------------------------------------------------------
    // Permissionless state transitions (anyone may call once conditions hold)
    // ---------------------------------------------------------------------

    /// After the funding deadline: move to Active if the goal was met,
    /// otherwise to Cancelled so backers can refund.
    function finalizeFunding() external;

    /// After the voting window: count votes and release the tranche,
    /// allow one resubmission, or cancel the campaign.
    function finalizeVote() external;

    /// Cancel the campaign if the current milestone is past its due date
    /// and has not been approved.
    function cancelIfOverdue() external;

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function creator() external view returns (address);
    function status() external view returns (Status);
    function goal() external view returns (uint256);
    function fundingDeadline() external view returns (uint64);
    function totalRaised() external view returns (uint256);
    function totalReleased() external view returns (uint256);
    function currentMilestone() external view returns (uint256);
    function milestoneCount() external view returns (uint256);
    function contributionOf(address backer) external view returns (uint256);
    function getMilestone(uint256 index) external view returns (Milestone memory);
}
