// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract MilestoneFund is Ownable, ReentrancyGuard {
    constructor() Ownable(msg.sender) {}

    enum Status { Funding, Active, Voting, GracePeriod, Failed, Completed }

    // 🌟 新增：专门用来传递创建参数的“打包箱”
    struct CreateParams {
        address creator;
        string title;
        string description;
        uint256 fundingGoal;
        uint256 deadline;
        uint256[] payoutRatios;
        uint256 votingThreshold;
        uint256 quorum;
        uint256 minContributionToVote;
        uint256 gracePeriodDuration;
        uint256 votingPeriodDuration;
    }

    struct Campaign {
        address creator;
        string title;           
        string description;     
        uint256 fundingGoal;
        uint256 totalRaised;
        uint256 deadline;
        uint256 currentMilestone;
        Status status;
        uint256 votingThreshold;       
        uint256 quorum;                
        uint256 minContributionToVote; 
        uint256 gracePeriodDuration;   
        uint256 votingPeriodDuration; 
        uint256 milestoneCount;
        uint256 releasedAmount;
    }

    struct Milestone {
        uint256 payoutRatio;      
        uint256 yesVotes;         
        uint256 noVotes;          
        uint256 votingDeadline;   
        uint256 graceDeadline;    
        bool graceUsed;           
        bool fundsReleased;       
        uint256 voteRound;
    }

    struct Backer {
        uint256 amountContributed;
        bool refundClaimed;
    }

    Campaign public campaign;
    bool public campaignCreated;
    Milestone[] public milestones;
    mapping(address => Backer) public backers;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public hasVoted;

    event CampaignCreated(address indexed creator, string title, uint256 fundingGoal, uint256 deadline, uint256 milestoneCount);
    event ContributionReceived(address indexed backer, uint256 amount);
    event FundingFinalized(bool success);
    event MilestoneSubmitted(uint256 indexed milestoneIndex, uint256 votingDeadline);
    event VoteCast(address indexed voter, uint256 indexed milestoneIndex, bool approve, uint256 weight);
    event VoteFinalized(uint256 indexed milestoneIndex, bool approved);
    event GracePeriodStarted(uint256 indexed milestoneIndex, uint256 graceDeadline);
    event GracePeriodExpired(uint256 indexed milestoneIndex);
    event MilestoneResubmitted(uint256 indexed milestoneIndex, uint256 votingDeadline);
    event RefundClaimed(address indexed backer, uint256 amount);

    modifier onlyCreator() { require(msg.sender == campaign.creator, "Not creator"); _; }
    modifier campaignExists() { require(campaignCreated, "Campaign not created"); _; }
    modifier inState(Status _status) { require(campaign.status == _status, "Invalid state"); _; }

    /// @dev After a failed vote, if creator does not call `resubmitMilestone` before `graceDeadline`, status becomes Failed and backers use `claimRefund`.
    function _failIfGraceExpired() private {
        if (campaign.status != Status.GracePeriod) return;
        if (campaign.currentMilestone >= campaign.milestoneCount) return;
        Milestone storage m = milestones[campaign.currentMilestone];
        if (!m.graceUsed) return;
        if (block.timestamp > m.graceDeadline) {
            campaign.status = Status.Failed;
            emit GracePeriodExpired(campaign.currentMilestone);
        }
    }

    function _effectiveStatusView() private view returns (Status) {
        if (!campaignCreated) return campaign.status;
        if (campaign.status != Status.GracePeriod) return campaign.status;
        if (campaign.currentMilestone >= campaign.milestoneCount) return campaign.status;
        Milestone memory m = milestones[campaign.currentMilestone];
        if (m.graceUsed && block.timestamp > m.graceDeadline) return Status.Failed;
        return campaign.status;
    }

    /// @notice Same rule as storage after `syncExpiredGrace` / `claimRefund`: GracePeriod past deadline without resubmit reads as Failed.
    function getEffectiveStatus() external view returns (Status) {
        return _effectiveStatusView();
    }

    /// @notice Anyone can persist Failed once grace has expired (no-op otherwise).
    function syncExpiredGrace() external campaignExists {
        _failIfGraceExpired();
    }

    /// @notice Funding deadline and voting/grace durations come from `params` (MilestoneFundFactory: 60s funding & grace, 40s voting for local demo).
    function createCampaign(CreateParams memory params) external {
        require(!campaignCreated, "Campaign already created");
        require(params.fundingGoal > 0, "Funding goal must be > 0");
        require(params.deadline > block.timestamp, "Deadline must be in future");
        require(params.payoutRatios.length > 0, "Need milestones");
        require(params.votingThreshold > 0 && params.votingThreshold <= 100, "Invalid voting threshold");
        require(params.quorum > 0 && params.quorum <= 100, "Invalid quorum");
        require(params.gracePeriodDuration > 0, "Invalid grace period");
        require(params.votingPeriodDuration > 0, "Invalid voting period");

        uint256 totalRatio = 0;
        for (uint256 i = 0; i < params.payoutRatios.length; i++) {
            require(params.payoutRatios[i] > 0, "Milestone ratio must be > 0");
            totalRatio += params.payoutRatios[i];
            milestones.push(Milestone({
                payoutRatio: params.payoutRatios[i], yesVotes: 0, noVotes: 0, votingDeadline: 0,
                graceDeadline: 0, graceUsed: false, fundsReleased: false, voteRound: 0
            }));
        }
        require(totalRatio == 100, "Payout ratios must sum to 100");

        campaign = Campaign({
            creator: params.creator,
            title: params.title,              
            description: params.description,  
            fundingGoal: params.fundingGoal, totalRaised: 0, deadline: params.deadline, currentMilestone: 0, status: Status.Funding,
            votingThreshold: params.votingThreshold, quorum: params.quorum, minContributionToVote: params.minContributionToVote,
            gracePeriodDuration: params.gracePeriodDuration, votingPeriodDuration: params.votingPeriodDuration,
            milestoneCount: params.payoutRatios.length, releasedAmount: 0
        });

        campaignCreated = true;
        _transferOwnership(params.creator);
        emit CampaignCreated(params.creator, params.title, params.fundingGoal, params.deadline, params.payoutRatios.length);
    }

    function contribute() external payable nonReentrant campaignExists inState(Status.Funding) {
        require(block.timestamp < campaign.deadline, "Funding period ended");
        require(msg.value > 0, "Contribution must be > 0");
        campaign.totalRaised += msg.value;
        backers[msg.sender].amountContributed += msg.value;
        emit ContributionReceived(msg.sender, msg.value);
    }

    function manualFinalizeFunding() external campaignExists onlyCreator inState(Status.Funding) {
        _executeFinalizeFunding();
    }

    function finalizeFunding() external campaignExists inState(Status.Funding) {
        require(block.timestamp >= campaign.deadline, "Funding still active");
        _executeFinalizeFunding();
    }

    function _executeFinalizeFunding() internal {
        if (campaign.totalRaised >= campaign.fundingGoal) {
            campaign.status = Status.Active;
            campaign.currentMilestone = 0;
            emit FundingFinalized(true);
        } else {
            campaign.status = Status.Failed;
            emit FundingFinalized(false);
        }
    }

    function submitMilestone() external campaignExists onlyCreator inState(Status.Active) {
        require(campaign.currentMilestone < campaign.milestoneCount, "No more milestones");
        Milestone storage m = milestones[campaign.currentMilestone];
        require(!m.fundsReleased, "Milestone already released");
        m.yesVotes = 0; m.noVotes = 0;
        m.votingDeadline = block.timestamp + campaign.votingPeriodDuration;
        m.graceDeadline = 0; m.voteRound = 1;
        campaign.status = Status.Voting;
        emit MilestoneSubmitted(campaign.currentMilestone, m.votingDeadline);
    }

    function voteMilestone(bool approve) external campaignExists inState(Status.Voting) {
        require(campaign.currentMilestone < campaign.milestoneCount, "Invalid milestone");
        Milestone storage m = milestones[campaign.currentMilestone];
        require(block.timestamp <= m.votingDeadline, "Voting ended");
        require(backers[msg.sender].amountContributed >= campaign.minContributionToVote, "Not eligible to vote");
        require(!hasVoted[campaign.currentMilestone][m.voteRound][msg.sender], "Already voted");

        uint256 weight = backers[msg.sender].amountContributed;
        if (approve) { m.yesVotes += weight; } else { m.noVotes += weight; }
        hasVoted[campaign.currentMilestone][m.voteRound][msg.sender] = true;
        emit VoteCast(msg.sender, campaign.currentMilestone, approve, weight);
    }

    function finalizeVote() external nonReentrant campaignExists inState(Status.Voting) {
        require(campaign.currentMilestone < campaign.milestoneCount, "Invalid milestone");
        Milestone storage m = milestones[campaign.currentMilestone];
        require(block.timestamp > m.votingDeadline, "Voting still active");

        uint256 totalVotes = m.yesVotes + m.noVotes;
        bool quorumMet = false; bool thresholdMet = false;
        if (campaign.totalRaised > 0) { quorumMet = (totalVotes * 100 >= campaign.totalRaised * campaign.quorum); }
        if (totalVotes > 0) { thresholdMet = (m.yesVotes * 100 >= totalVotes * campaign.votingThreshold); }

        bool approved = quorumMet && thresholdMet;
        if (approved) {
            uint256 payoutAmount = (campaign.totalRaised * m.payoutRatio) / 100;
            require(address(this).balance >= payoutAmount, "Insufficient contract balance");
            m.fundsReleased = true;
            campaign.releasedAmount += payoutAmount;
            (bool success, ) = payable(campaign.creator).call{value: payoutAmount}("");
            require(success, "Transfer failed");
            emit VoteFinalized(campaign.currentMilestone, true);
            if (campaign.currentMilestone + 1 < campaign.milestoneCount) {
                campaign.currentMilestone += 1; campaign.status = Status.Active;
            } else { campaign.status = Status.Completed; }
        } else {
            emit VoteFinalized(campaign.currentMilestone, false);
            if (!m.graceUsed) {
                m.graceUsed = true;
                m.graceDeadline = block.timestamp + campaign.gracePeriodDuration;
                campaign.status = Status.GracePeriod;
                emit GracePeriodStarted(campaign.currentMilestone, m.graceDeadline);
            } else { campaign.status = Status.Failed; }
        }
    }

    /// @notice While in grace: if `block.timestamp <= graceDeadline`, moves to Voting; if grace already expired, moves to Failed and returns (no resubmit).
    function resubmitMilestone() external campaignExists onlyCreator {
        _failIfGraceExpired();
        if (campaign.status != Status.GracePeriod) return;

        require(campaign.currentMilestone < campaign.milestoneCount, "Invalid milestone");
        Milestone storage m = milestones[campaign.currentMilestone];
        require(m.graceUsed, "Grace period not enabled");
        require(block.timestamp <= m.graceDeadline, "Grace period expired");
        m.yesVotes = 0; m.noVotes = 0;
        m.votingDeadline = block.timestamp + campaign.votingPeriodDuration;
        m.voteRound += 1;
        campaign.status = Status.Voting;
        emit MilestoneResubmitted(campaign.currentMilestone, m.votingDeadline);
    }

    function claimRefund() external nonReentrant campaignExists {
        _failIfGraceExpired();
        require(campaign.status == Status.Failed, "Not failed");
        Backer storage b = backers[msg.sender];
        require(b.amountContributed > 0, "No contribution");
        require(!b.refundClaimed, "Refund already claimed");
        uint256 remainingPool = campaign.totalRaised - campaign.releasedAmount;
        uint256 refundAmount = (b.amountContributed * remainingPool) / campaign.totalRaised;
        require(refundAmount > 0, "No refundable amount");
        b.refundClaimed = true;
        (bool success, ) = payable(msg.sender).call{value: refundAmount}("");
        require(success, "Refund transfer failed");
        emit RefundClaimed(msg.sender, refundAmount);
    }

    function getCampaignInfo() external view returns (
        address creator, string memory title, string memory description,
        uint256 fundingGoal, uint256 totalRaised, uint256 deadline,
        uint256 currentMilestone, Status status, uint256 votingThreshold,
        uint256 quorum, uint256 minContributionToVote, uint256 gracePeriodDuration,
        uint256 votingPeriodDuration, uint256 milestoneCount, uint256 releasedAmount
    ) {
        return (
            campaign.creator, campaign.title, campaign.description,
            campaign.fundingGoal, campaign.totalRaised, campaign.deadline,
            campaign.currentMilestone, campaign.status, campaign.votingThreshold,
            campaign.quorum, campaign.minContributionToVote, campaign.gracePeriodDuration,
            campaign.votingPeriodDuration, campaign.milestoneCount, campaign.releasedAmount
        );
    }

    function getMilestoneInfo(uint256 index) external view returns (
        uint256 payoutRatio, uint256 yesVotes, uint256 noVotes, uint256 votingDeadline, uint256 graceDeadline, bool graceUsed, bool fundsReleased
    ) {
        Milestone memory m = milestones[index];
        return (m.payoutRatio, m.yesVotes, m.noVotes, m.votingDeadline, m.graceDeadline, m.graceUsed, m.fundsReleased);
    }

    function getBackerContribution(address user) external view returns (uint256) { return backers[user].amountContributed; }
    function getMilestoneCount() external view returns (uint256) { return milestones.length; }
    function getRefundableAmount(address user) external view returns (uint256) {
        if (_effectiveStatusView() != Status.Failed) return 0;
        Backer memory b = backers[user];
        if (b.refundClaimed || b.amountContributed == 0 || campaign.totalRaised == 0) return 0;
        uint256 remainingPool = campaign.totalRaised - campaign.releasedAmount;
        return (b.amountContributed * remainingPool) / campaign.totalRaised;
    }

    receive() external payable {}
}