// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICampaign} from "./interfaces/ICampaign.sol";

/**
 * @title Campaign
 * @notice Escrow for one crowdfunding project (DRAFT, interfaces and
 * high-level logic; not audited, test suite still to be written).
 *
 * Flow:
 *   1. Backers call contribute() until fundingDeadline.
 *   2. Anyone calls finalizeFunding(). Goal met -> Active, else Cancelled.
 *   3. Creator calls submitMilestone(cid). A 3-day voting window opens.
 *   4. Backers call vote(). Weight = contribution.
 *   5. Anyone calls finalizeVote() after the window. With 20% quorum and a
 *      majority of yes weight, the tranche is paid to the creator.
 *   6. A rejected milestone can be resubmitted once. After a second
 *      rejection, or if a due date passes (cancelIfOverdue), the campaign is
 *      Cancelled and backers call claimRefund() for their pro-rata share.
 *
 * Security notes:
 *   - Refunds are pull-based (backers withdraw, the contract never loops
 *     over backers and never pushes funds to them).
 *   - State is updated before every token transfer (checks-effects-interactions).
 *   - ReentrancyGuard protects every function that moves tokens.
 */
contract Campaign is ICampaign, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Constants (values come from the project proposal)
    // ---------------------------------------------------------------------

    uint64 public constant VOTING_PERIOD = 3 days;
    uint256 public constant QUORUM_BPS = 2000;    // 20% of total raised must vote
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint8 public constant MAX_ATTEMPTS = 2;       // first submission + one resubmission

    // ---------------------------------------------------------------------
    // Immutable campaign settings
    // ---------------------------------------------------------------------

    IERC20 public immutable token;
    address public immutable override creator;
    uint256 public immutable override goal;
    uint64 public immutable override fundingDeadline;

    // ---------------------------------------------------------------------
    // Mutable state
    // ---------------------------------------------------------------------

    Status public override status;
    uint256 public override totalRaised;
    uint256 public override totalReleased;
    uint256 public override currentMilestone; // index of the milestone being worked on

    Milestone[] private _milestones;
    mapping(address => uint256) private _contributions;
    mapping(address => bool) private _refunded;

    // Voting state for the milestone currently open for voting.
    uint64 public votingEnds;
    uint256 public yesWeight;
    uint256 public noWeight;
    uint256 private _voteRound; // increases every time voting opens
    mapping(uint256 => mapping(address => bool)) private _hasVoted; // round => backer => voted

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier onlyCreator() {
        require(msg.sender == creator, "Campaign: not creator");
        _;
    }

    modifier inStatus(Status expected) {
        require(status == expected, "Campaign: wrong status");
        _;
    }

    // ---------------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------------

    /**
     * @param token_ ERC-20 used for contributions (MockUSDC on Sepolia).
     * @param creator_ Project creator who receives released tranches.
     * @param goal_ Funding target in token units.
     * @param fundingDeadline_ Unix time when funding closes.
     * @param milestones_ Ordered milestones. shareBps must sum to 10000 and
     *        due dates must increase and fall after the funding deadline.
     */
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

    // ---------------------------------------------------------------------
    // Backer actions
    // ---------------------------------------------------------------------

    /// @inheritdoc ICampaign
    function contribute(uint256 amount) external override nonReentrant inStatus(Status.Funding) {
        require(block.timestamp < fundingDeadline, "Campaign: funding closed");
        require(amount > 0, "Campaign: amount is zero");

        // Effects first, then the token transfer.
        _contributions[msg.sender] += amount;
        totalRaised += amount;
        emit Contributed(msg.sender, amount, totalRaised);

        token.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @inheritdoc ICampaign
    function vote(bool approve) external override {
        require(status == Status.Active, "Campaign: not active");
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

    /// @inheritdoc ICampaign
    function claimRefund() external override nonReentrant inStatus(Status.Cancelled) {
        require(!_refunded[msg.sender], "Campaign: already refunded");
        uint256 contributed = _contributions[msg.sender];
        require(contributed > 0, "Campaign: nothing to refund");

        // Pro-rata share of whatever has not yet been paid to the creator.
        uint256 amount = (contributed * (totalRaised - totalReleased)) / totalRaised;

        _refunded[msg.sender] = true; // effect before interaction
        emit Refunded(msg.sender, amount);

        token.safeTransfer(msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Creator actions
    // ---------------------------------------------------------------------

    /// @inheritdoc ICampaign
    function submitMilestone(string calldata evidenceCid) external override onlyCreator inStatus(Status.Active) {
        Milestone storage m = _milestones[currentMilestone];
        require(
            m.status == MilestoneStatus.Pending || m.status == MilestoneStatus.Rejected,
            "Campaign: cannot submit now"
        );
        require(m.attempts < MAX_ATTEMPTS, "Campaign: no attempts left");
        require(bytes(evidenceCid).length > 0, "Campaign: empty evidence");

        m.evidenceCid = evidenceCid;
        m.status = MilestoneStatus.Voting;
        m.attempts += 1;

        // Open a fresh voting round.
        _voteRound += 1;
        yesWeight = 0;
        noWeight = 0;
        votingEnds = uint64(block.timestamp) + VOTING_PERIOD;

        emit MilestoneSubmitted(currentMilestone, evidenceCid, votingEnds);
    }

    // ---------------------------------------------------------------------
    // Permissionless state transitions
    // ---------------------------------------------------------------------

    /// @inheritdoc ICampaign
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

    /// @inheritdoc ICampaign
    function finalizeVote() external override nonReentrant inStatus(Status.Active) {
        Milestone storage m = _milestones[currentMilestone];
        require(m.status == MilestoneStatus.Voting, "Campaign: no open vote");
        require(block.timestamp >= votingEnds, "Campaign: voting still open");

        uint256 index = currentMilestone;
        bool quorumReached = (yesWeight + noWeight) * BPS_DENOMINATOR >= totalRaised * QUORUM_BPS;
        bool approved = quorumReached && yesWeight > noWeight;

        if (approved) {
            m.status = MilestoneStatus.Approved;

            // The last tranche takes any rounding dust so nothing stays locked.
            bool isLast = index == _milestones.length - 1;
            uint256 amount = isLast
                ? totalRaised - totalReleased
                : (totalRaised * m.shareBps) / BPS_DENOMINATOR;

            totalReleased += amount; // effect before interaction
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
            bool canResubmit = m.attempts < MAX_ATTEMPTS;
            emit MilestoneRejected(index, canResubmit);

            if (!canResubmit) {
                status = Status.Cancelled;
                emit CampaignCancelled("milestone rejected twice");
            }
        }
    }

    /// @inheritdoc ICampaign
    function cancelIfOverdue() external override inStatus(Status.Active) {
        Milestone storage m = _milestones[currentMilestone];
        require(block.timestamp > m.dueDate, "Campaign: not overdue");
        // A vote that is still open gets to finish first.
        require(m.status != MilestoneStatus.Voting, "Campaign: vote in progress");

        status = Status.Cancelled;
        emit CampaignCancelled("milestone overdue");
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @inheritdoc ICampaign
    function milestoneCount() external view override returns (uint256) {
        return _milestones.length;
    }

    /// @inheritdoc ICampaign
    function contributionOf(address backer) external view override returns (uint256) {
        return _contributions[backer];
    }

    /// @inheritdoc ICampaign
    function getMilestone(uint256 index) external view override returns (Milestone memory) {
        require(index < _milestones.length, "Campaign: bad index");
        return _milestones[index];
    }
}
