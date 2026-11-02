// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICampaign} from "./interfaces/ICampaign.sol";

/**
 * @title Campaign
 * @notice Escrow for one crowdfunding project, deployed by CampaignFactory.
 * Backers fund it with MockUSDC and the creator is paid one tranche per
 * approved milestone. Draft code, not audited.
 * @dev Lifecycle: backers contribute until the funding deadline, then
 * finalizeFunding makes the campaign Active (goal met) or Cancelled (goal
 * missed). The creator submits an IPFS CID per milestone, backers vote for
 * 3 days weighted by contribution, and finalizeVote releases the tranche if
 * 20% quorum is reached and yes beats no. A rejected milestone can be
 * resubmitted once. A second rejection or a missed due date cancels the
 * campaign, and backers then pull their pro-rata share of what is left.
 * Security: refunds are pull-based, state changes happen before token
 * transfers, and every token-moving function uses ReentrancyGuard and SafeERC20.
 */
contract Campaign is ICampaign, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint64 public constant VOTING_PERIOD = 3 days;
    uint256 public constant QUORUM_BPS = 2000;
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint8 public constant MAX_ATTEMPTS = 2;

    IERC20 public immutable override token;
    address public immutable override creator;
    uint256 public immutable override goal;
    uint64 public immutable override fundingDeadline;

    Status public override status;
    uint256 public override totalRaised;
    uint256 public override totalReleased;
    uint256 public override currentMilestone;

    Milestone[] private _milestones;
    mapping(address => uint256) private _contributions;
    mapping(address => bool) private _refunded;

    uint64 public override votingEnds;
    uint256 public override yesWeight;
    uint256 public override noWeight;
    uint256 private _voteRound;
    mapping(uint256 => mapping(address => bool)) private _hasVoted;

    modifier onlyCreator() {
        require(msg.sender == creator, "Campaign: not creator");
        _;
    }

    modifier inStatus(Status expected) {
        require(status == expected, "Campaign: wrong status");
        _;
    }

    constructor(
        address token_,
        address creator_,
        uint256 goal_,
        uint64 fundingDeadline_,
        MilestoneInput[] memory milestones_
    ) {
        require(token_ != address(0) && creator_ != address(0), "Campaign: zero address");
        require(goal_ > 0, "Campaign: goal is zero");
        require(fundingDeadline_ > block.timestamp, "Campaign: deadline in past");
        require(milestones_.length > 0, "Campaign: no milestones");

        uint256 shareSum;
        uint64 previousDue = fundingDeadline_;
        for (uint256 i = 0; i < milestones_.length; i++) {
            require(milestones_[i].dueDate > previousDue, "Campaign: bad due date order");
            previousDue = milestones_[i].dueDate;
            shareSum += milestones_[i].shareBps;
            _milestones.push(
                Milestone({
                    shareBps: milestones_[i].shareBps,
                    dueDate: milestones_[i].dueDate,
                    evidenceCid: "",
                    status: MilestoneStatus.Pending,
                    attempts: 0
                })
            );
        }
        require(shareSum == BPS_DENOMINATOR, "Campaign: shares must sum to 10000");

        token = IERC20(token_);
        creator = creator_;
        goal = goal_;
        fundingDeadline = fundingDeadline_;
        status = Status.Funding;
    }

    /// @notice Backer locks tokens in escrow. Only during Funding, before the deadline.
    function contribute(uint256 amount) external override nonReentrant inStatus(Status.Funding) {
        require(block.timestamp < fundingDeadline, "Campaign: funding closed");
        require(amount > 0, "Campaign: amount is zero");

        _contributions[msg.sender] += amount;
        totalRaised += amount;
        emit Contributed(msg.sender, amount, totalRaised);

        token.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Backer votes on the open milestone, weighted by contribution. Once per voting round.
    function vote(bool approve) external override inStatus(Status.Active) {
        Milestone storage m = _milestones[currentMilestone];
        require(m.status == MilestoneStatus.Voting, "Campaign: no open vote");
        require(block.timestamp < votingEnds, "Campaign: voting closed");
        require(!_hasVoted[_voteRound][msg.sender], "Campaign: already voted");

        uint256 weight = _contributions[msg.sender];
        require(weight > 0, "Campaign: not a backer");

        _hasVoted[_voteRound][msg.sender] = true;
        if (approve) {
            yesWeight += weight;
        } else {
            noWeight += weight;
        }
        emit Voted(currentMilestone, msg.sender, approve, weight);
    }

    /// @notice Backer withdraws their pro-rata share of the unreleased balance. Only after cancellation, once.
    function claimRefund() external override nonReentrant inStatus(Status.Cancelled) {
        require(!_refunded[msg.sender], "Campaign: already refunded");
        uint256 contributed = _contributions[msg.sender];
        require(contributed > 0, "Campaign: nothing to refund");

        uint256 amount = (contributed * (totalRaised - totalReleased)) / totalRaised;

        _refunded[msg.sender] = true;
        emit Refunded(msg.sender, amount);

        token.safeTransfer(msg.sender, amount);
    }

    /// @notice Creator submits an IPFS CID for the current milestone and opens a 3-day vote. Only before its due date.
    function submitMilestone(string calldata evidenceCid) external override onlyCreator inStatus(Status.Active) {
        Milestone storage m = _milestones[currentMilestone];
        require(
            m.status == MilestoneStatus.Pending || m.status == MilestoneStatus.Rejected,
            "Campaign: cannot submit now"
        );
        require(m.attempts < MAX_ATTEMPTS, "Campaign: no attempts left");
        require(block.timestamp <= m.dueDate, "Campaign: milestone overdue");
        require(bytes(evidenceCid).length > 0, "Campaign: empty evidence");

        m.evidenceCid = evidenceCid;
        m.status = MilestoneStatus.Voting;
        m.attempts += 1;

        _voteRound += 1;
        yesWeight = 0;
        noWeight = 0;
        votingEnds = uint64(block.timestamp) + VOTING_PERIOD;

        emit MilestoneSubmitted(currentMilestone, evidenceCid, votingEnds);
    }

    /// @notice Anyone moves the campaign to Active or Cancelled. Only after the funding deadline.
    function finalizeFunding() external override inStatus(Status.Funding) {
        require(block.timestamp >= fundingDeadline, "Campaign: funding still open");

        if (totalRaised >= goal) {
            status = Status.Active;
            emit FundingFinalized(true, totalRaised);
        } else {
            status = Status.Cancelled;
            emit FundingFinalized(false, totalRaised);
            emit CampaignCancelled("goal not met");
        }
    }

    /// @notice Anyone tallies the vote and releases the tranche, rejects, or cancels. Only after the voting window.
    function finalizeVote() external override nonReentrant inStatus(Status.Active) {
        Milestone storage m = _milestones[currentMilestone];
        require(m.status == MilestoneStatus.Voting, "Campaign: no open vote");
        require(block.timestamp >= votingEnds, "Campaign: voting still open");

        uint256 index = currentMilestone;
        bool quorumReached = (yesWeight + noWeight) * BPS_DENOMINATOR >= totalRaised * QUORUM_BPS;
        bool approved = quorumReached && yesWeight > noWeight;

        if (approved) {
            m.status = MilestoneStatus.Approved;

            bool isLast = index == _milestones.length - 1;
            uint256 amount = isLast
                ? totalRaised - totalReleased
                : (totalRaised * m.shareBps) / BPS_DENOMINATOR;

            totalReleased += amount;
            emit MilestoneApproved(index, amount);

            if (isLast) {
                status = Status.Completed;
                emit CampaignCompleted();
            } else {
                currentMilestone = index + 1;
            }

            token.safeTransfer(creator, amount);
        } else {
            m.status = MilestoneStatus.Rejected;
            bool canResubmit = m.attempts < MAX_ATTEMPTS && block.timestamp <= m.dueDate;
            emit MilestoneRejected(index, canResubmit);

            if (!canResubmit) {
                status = Status.Cancelled;
                emit CampaignCancelled(m.attempts < MAX_ATTEMPTS ? "milestone overdue" : "milestone rejected twice");
            }
        }
    }

    /// @notice Anyone cancels the campaign when the current milestone is past its due date and no vote is open.
    function cancelIfOverdue() external override inStatus(Status.Active) {
        Milestone storage m = _milestones[currentMilestone];
        require(block.timestamp > m.dueDate, "Campaign: not overdue");
        require(m.status != MilestoneStatus.Voting, "Campaign: vote in progress");

        status = Status.Cancelled;
        emit CampaignCancelled("milestone overdue");
    }

    /// @notice Returns the number of milestones.
    function milestoneCount() external view override returns (uint256) {
        return _milestones.length;
    }

    /// @notice Returns how much a backer contributed, which is also their vote weight.
    function contributionOf(address backer) external view override returns (uint256) {
        return _contributions[backer];
    }

    /// @notice Returns whether a backer has voted in the current round.
    function hasVoted(address backer) external view override returns (bool) {
        return _hasVoted[_voteRound][backer];
    }

    /// @notice Returns the full data for one milestone.
    function getMilestone(uint256 index) external view override returns (Milestone memory) {
        require(index < _milestones.length, "Campaign: bad index");
        return _milestones[index];
    }
}
