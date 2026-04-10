// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./MilestoneFund.sol";

contract MilestoneFundFactory {
    address[] public deployedCampaigns;

    /// @dev Demo-friendly fixed windows (override here for production deployments).
    uint256 public constant FUNDING_PERIOD_SECONDS = 60;
    uint256 public constant VOTING_PERIOD_SECONDS = 40;
    uint256 public constant GRACE_PERIOD_SECONDS = 60;

    event CampaignDeployed(address indexed campaignAddress, address indexed creator, string title);

    function createCampaign(
        string memory title,
        string memory description,
        uint256 fundingGoal,
        uint256[] memory payoutRatios,
        uint256 votingThreshold,
        uint256 quorum,
        uint256 minContributionToVote
    ) public {
        MilestoneFund newCampaign = new MilestoneFund();

        MilestoneFund.CreateParams memory params = MilestoneFund.CreateParams({
            creator: msg.sender,
            title: title,
            description: description,
            fundingGoal: fundingGoal,
            deadline: block.timestamp + FUNDING_PERIOD_SECONDS,
            payoutRatios: payoutRatios,
            votingThreshold: votingThreshold,
            quorum: quorum,
            minContributionToVote: minContributionToVote,
            gracePeriodDuration: GRACE_PERIOD_SECONDS,
            votingPeriodDuration: VOTING_PERIOD_SECONDS
        });

        newCampaign.createCampaign(params);

        deployedCampaigns.push(address(newCampaign));

        emit CampaignDeployed(address(newCampaign), msg.sender, title);
    }

    function getDeployedCampaigns() public view returns (address[] memory) {
        return deployedCampaigns;
    }
}
