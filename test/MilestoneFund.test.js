const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("MilestoneFund", function () {
  let milestoneFund;
  let creator;
  let backer1;
  let backer2;
  let other;

  /** Matches factory: 60s funding deadline offset & grace, 40s voting. */
  const DEMO_SECONDS = 60;
  const DEMO_VOTING_SECONDS = 40;

  /** Matches MilestoneFund.CreateParams — contract expects a single struct arg. */
  function campaignParams(deadline, overrides = {}) {
    return {
      creator: creator.address,
      title: "Test Campaign",
      description: "Test description",
      fundingGoal: ethers.parseEther("10"),
      deadline,
      payoutRatios: [40, 60],
      votingThreshold: 50,
      quorum: 20,
      minContributionToVote: ethers.parseEther("1"),
      gracePeriodDuration: DEMO_SECONDS,
      votingPeriodDuration: DEMO_VOTING_SECONDS,
      ...overrides,
    };
  }

  beforeEach(async function () {
    [creator, backer1, backer2, other] = await ethers.getSigners();

    const MilestoneFund = await ethers.getContractFactory("MilestoneFund");
    milestoneFund = await MilestoneFund.connect(creator).deploy();
    await milestoneFund.waitForDeployment();
  });

  it("should deploy successfully", async function () {
    const address = await milestoneFund.getAddress();
    expect(address).to.properAddress;
  });

  it("should create a campaign successfully", async function () {
    const latestTime = await time.latest();
    const deadline = latestTime + DEMO_SECONDS;

    await milestoneFund.connect(creator).createCampaign(campaignParams(deadline));

    const campaignInfo = await milestoneFund.getCampaignInfo();

    expect(campaignInfo.creator).to.equal(creator.address);
    expect(campaignInfo.fundingGoal).to.equal(ethers.parseEther("10"));
    expect(campaignInfo.totalRaised).to.equal(0);
    expect(campaignInfo.deadline).to.equal(deadline);
    expect(campaignInfo.currentMilestone).to.equal(0);
    expect(campaignInfo.status).to.equal(0); // Funding
    expect(campaignInfo.votingThreshold).to.equal(50);
    expect(campaignInfo.quorum).to.equal(20);
    expect(campaignInfo.minContributionToVote).to.equal(ethers.parseEther("1"));
    expect(campaignInfo.gracePeriodDuration).to.equal(DEMO_SECONDS);
    expect(campaignInfo.votingPeriodDuration).to.equal(DEMO_VOTING_SECONDS);
    expect(campaignInfo.milestoneCount).to.equal(2);
    expect(campaignInfo.releasedAmount).to.equal(0);

    const milestoneCount = await milestoneFund.getMilestoneCount();
    expect(milestoneCount).to.equal(2);
  });

  it("should accept contributions during Funding", async function () {
    const latestTime = await time.latest();
    const deadline = latestTime + DEMO_SECONDS;

    await milestoneFund.connect(creator).createCampaign(campaignParams(deadline));

    await milestoneFund.connect(backer1).contribute({
      value: ethers.parseEther("3")
    });

    await milestoneFund.connect(backer2).contribute({
      value: ethers.parseEther("2")
    });

    const campaignInfo = await milestoneFund.getCampaignInfo();
    expect(campaignInfo.totalRaised).to.equal(ethers.parseEther("5"));

    const contribution1 = await milestoneFund.getBackerContribution(backer1.address);
    const contribution2 = await milestoneFund.getBackerContribution(backer2.address);

    expect(contribution1).to.equal(ethers.parseEther("3"));
    expect(contribution2).to.equal(ethers.parseEther("2"));
  });

  it("should finalize funding as Failed if goal is not met", async function () {
    const latestTime = await time.latest();
    const deadline = latestTime + DEMO_SECONDS;

    await milestoneFund.connect(creator).createCampaign(campaignParams(deadline));

    await milestoneFund.connect(backer1).contribute({
      value: ethers.parseEther("2")
    });

    // fast forward time to after deadline
    await time.increaseTo(deadline + 1);

    await milestoneFund.connect(other).finalizeFunding();

    const campaignInfo = await milestoneFund.getCampaignInfo();
    expect(campaignInfo.status).to.equal(4); // Failed
  });

  it("should finalize funding as Active if goal is met", async function () {
    const latestTime = await time.latest();
    const deadline = latestTime + DEMO_SECONDS;

    await milestoneFund.connect(creator).createCampaign(campaignParams(deadline));

    await milestoneFund.connect(backer1).contribute({
      value: ethers.parseEther("6")
    });

    await milestoneFund.connect(backer2).contribute({
      value: ethers.parseEther("4")
    });

    // fast forward time to after deadline
    await time.increaseTo(deadline + 1);

    await milestoneFund.connect(other).finalizeFunding();

    const campaignInfo = await milestoneFund.getCampaignInfo();
    expect(campaignInfo.status).to.equal(1); // Active
    expect(campaignInfo.currentMilestone).to.equal(0);
  });
  it("should submit milestone and enter Voting state", async function () {
    const latestTime = await time.latest();
    const deadline = latestTime + DEMO_SECONDS;

    await milestoneFund.connect(creator).createCampaign(campaignParams(deadline));

    await milestoneFund.connect(backer1).contribute({
      value: ethers.parseEther("6")
    });

    await milestoneFund.connect(backer2).contribute({
      value: ethers.parseEther("4")
    });

    await time.increaseTo(deadline + 1);
    await milestoneFund.connect(other).finalizeFunding();

    await milestoneFund.connect(creator).submitMilestone();

    const campaignInfo = await milestoneFund.getCampaignInfo();
    expect(campaignInfo.status).to.equal(2); // Voting

    const milestoneInfo = await milestoneFund.getMilestoneInfo(0);
    expect(milestoneInfo.votingDeadline).to.be.gt(0);
  });

  it("should allow eligible backers to vote and approve a milestone", async function () {
    const latestTime = await time.latest();
    const deadline = latestTime + DEMO_SECONDS;

    await milestoneFund.connect(creator).createCampaign(campaignParams(deadline));

    await milestoneFund.connect(backer1).contribute({
      value: ethers.parseEther("6")
    });

    await milestoneFund.connect(backer2).contribute({
      value: ethers.parseEther("4")
    });

    await time.increaseTo(deadline + 1);
    await milestoneFund.connect(other).finalizeFunding();

    await milestoneFund.connect(creator).submitMilestone();

    await milestoneFund.connect(backer1).voteMilestone(true);
    await milestoneFund.connect(backer2).voteMilestone(true);

    const milestoneBefore = await milestoneFund.getMilestoneInfo(0);
    expect(milestoneBefore.yesVotes).to.equal(ethers.parseEther("10"));
    expect(milestoneBefore.noVotes).to.equal(0);

    await time.increaseTo(Number(milestoneBefore.votingDeadline) + 1);
    await milestoneFund.connect(other).finalizeVote();

    const campaignInfo = await milestoneFund.getCampaignInfo();
    expect(campaignInfo.status).to.equal(1); // Active
    expect(campaignInfo.currentMilestone).to.equal(1);
    expect(campaignInfo.releasedAmount).to.equal(ethers.parseEther("4")); // 40% of 10 ETH

    const milestoneAfter = await milestoneFund.getMilestoneInfo(0);
    expect(milestoneAfter.fundsReleased).to.equal(true);
  });

  it("should enter GracePeriod if milestone vote is rejected", async function () {
    const latestTime = await time.latest();
    const deadline = latestTime + DEMO_SECONDS;

    await milestoneFund.connect(creator).createCampaign(campaignParams(deadline));

    await milestoneFund.connect(backer1).contribute({
      value: ethers.parseEther("6")
    });

    await milestoneFund.connect(backer2).contribute({
      value: ethers.parseEther("4")
    });

    await time.increaseTo(deadline + 1);
    await milestoneFund.connect(other).finalizeFunding();

    await milestoneFund.connect(creator).submitMilestone();

    await milestoneFund.connect(backer1).voteMilestone(false);
    await milestoneFund.connect(backer2).voteMilestone(false);

    const milestoneBefore = await milestoneFund.getMilestoneInfo(0);
    await time.increaseTo(Number(milestoneBefore.votingDeadline) + 1);
    await milestoneFund.connect(other).finalizeVote();

    const campaignInfo = await milestoneFund.getCampaignInfo();
    expect(campaignInfo.status).to.equal(3); // GracePeriod

    const milestoneAfter = await milestoneFund.getMilestoneInfo(0);
    expect(milestoneAfter.graceUsed).to.equal(true);
    expect(milestoneAfter.graceDeadline).to.be.gt(0);
  });

  it("should move to Failed when grace period expires without resubmit (then backers can refund)", async function () {
    const latestTime = await time.latest();
    const deadline = latestTime + DEMO_SECONDS;

    await milestoneFund.connect(creator).createCampaign(campaignParams(deadline));

    await milestoneFund.connect(backer1).contribute({
      value: ethers.parseEther("6"),
    });

    await milestoneFund.connect(backer2).contribute({
      value: ethers.parseEther("4"),
    });

    await time.increaseTo(deadline + 1);
    await milestoneFund.connect(other).finalizeFunding();

    await milestoneFund.connect(creator).submitMilestone();
    await milestoneFund.connect(backer1).voteMilestone(false);
    await milestoneFund.connect(backer2).voteMilestone(false);

    const mBefore = await milestoneFund.getMilestoneInfo(0);
    await time.increaseTo(Number(mBefore.votingDeadline) + 1);
    await milestoneFund.connect(other).finalizeVote();

    expect(await milestoneFund.getCampaignInfo().then((c) => c.status)).to.equal(3);

    const mGrace = await milestoneFund.getMilestoneInfo(0);
    await time.increaseTo(Number(mGrace.graceDeadline) + 1);

    expect(await milestoneFund.getEffectiveStatus()).to.equal(4n);

    await milestoneFund.connect(other).syncExpiredGrace();
    expect(await milestoneFund.getCampaignInfo().then((c) => c.status)).to.equal(4);

    const r1 = await milestoneFund.getRefundableAmount(backer1.address);
    const r2 = await milestoneFund.getRefundableAmount(backer2.address);
    expect(r1).to.be.gt(0n);
    expect(r2).to.be.gt(0n);
  });

  it("should allow creator to resubmit milestone during GracePeriod", async function () {
    const latestTime = await time.latest();
    const deadline = latestTime + DEMO_SECONDS;

    await milestoneFund.connect(creator).createCampaign(campaignParams(deadline));

    await milestoneFund.connect(backer1).contribute({
      value: ethers.parseEther("6")
    });

    await milestoneFund.connect(backer2).contribute({
      value: ethers.parseEther("4")
    });

    await time.increaseTo(deadline + 1);
    await milestoneFund.connect(other).finalizeFunding();

    await milestoneFund.connect(creator).submitMilestone();

    await milestoneFund.connect(backer1).voteMilestone(false);
    await milestoneFund.connect(backer2).voteMilestone(false);

    const milestoneBeforeFinalize = await milestoneFund.getMilestoneInfo(0);
    await time.increaseTo(Number(milestoneBeforeFinalize.votingDeadline) + 1);
    await milestoneFund.connect(other).finalizeVote();

    await milestoneFund.connect(creator).resubmitMilestone();

    const campaignInfo = await milestoneFund.getCampaignInfo();
    expect(campaignInfo.status).to.equal(2); // Voting

    const milestoneAfterResubmit = await milestoneFund.getMilestoneInfo(0);
    expect(milestoneAfterResubmit.votingDeadline).to.be.gt(0);
    expect(milestoneAfterResubmit.yesVotes).to.equal(0);
    expect(milestoneAfterResubmit.noVotes).to.equal(0);
  });
  it("should move to Failed if final vote after GracePeriod is rejected", async function () {
    const latestTime = await time.latest();
    const deadline = latestTime + DEMO_SECONDS;

    await milestoneFund.connect(creator).createCampaign(campaignParams(deadline));

    await milestoneFund.connect(backer1).contribute({
      value: ethers.parseEther("6")
    });

    await milestoneFund.connect(backer2).contribute({
      value: ethers.parseEther("4")
    });

    await time.increaseTo(deadline + 1);
    await milestoneFund.connect(other).finalizeFunding();

    // first vote
    await milestoneFund.connect(creator).submitMilestone();
    await milestoneFund.connect(backer1).voteMilestone(false);
    await milestoneFund.connect(backer2).voteMilestone(false);

    let milestoneInfo = await milestoneFund.getMilestoneInfo(0);
    await time.increaseTo(Number(milestoneInfo.votingDeadline) + 1);
    await milestoneFund.connect(other).finalizeVote();

    let campaignInfo = await milestoneFund.getCampaignInfo();
    expect(campaignInfo.status).to.equal(3); // GracePeriod

    // resubmit and final vote
    await milestoneFund.connect(creator).resubmitMilestone();
    await milestoneFund.connect(backer1).voteMilestone(false);
    await milestoneFund.connect(backer2).voteMilestone(false);

    milestoneInfo = await milestoneFund.getMilestoneInfo(0);
    await time.increaseTo(Number(milestoneInfo.votingDeadline) + 1);
    await milestoneFund.connect(other).finalizeVote();

    campaignInfo = await milestoneFund.getCampaignInfo();
    expect(campaignInfo.status).to.equal(4); // Failed
  });

  it("should allow backers to claim proportional refund after failure", async function () {
    const latestTime = await time.latest();
    const deadline = latestTime + DEMO_SECONDS;

    await milestoneFund.connect(creator).createCampaign(campaignParams(deadline));

    await milestoneFund.connect(backer1).contribute({
      value: ethers.parseEther("6")
    });

    await milestoneFund.connect(backer2).contribute({
      value: ethers.parseEther("4")
    });

    await time.increaseTo(deadline + 1);
    await milestoneFund.connect(other).finalizeFunding();

    // Milestone 1 approved -> release 40% = 4 ETH
    await milestoneFund.connect(creator).submitMilestone();
    await milestoneFund.connect(backer1).voteMilestone(true);
    await milestoneFund.connect(backer2).voteMilestone(true);

    let milestoneInfo = await milestoneFund.getMilestoneInfo(0);
    await time.increaseTo(Number(milestoneInfo.votingDeadline) + 1);
    await milestoneFund.connect(other).finalizeVote();

    let campaignInfo = await milestoneFund.getCampaignInfo();
    expect(campaignInfo.releasedAmount).to.equal(ethers.parseEther("4"));
    expect(campaignInfo.status).to.equal(1); // Active
    expect(campaignInfo.currentMilestone).to.equal(1);

    // Milestone 2 rejected twice -> Failed
    await milestoneFund.connect(creator).submitMilestone();
    await milestoneFund.connect(backer1).voteMilestone(false);
    await milestoneFund.connect(backer2).voteMilestone(false);

    milestoneInfo = await milestoneFund.getMilestoneInfo(1);
    await time.increaseTo(Number(milestoneInfo.votingDeadline) + 1);
    await milestoneFund.connect(other).finalizeVote();

    campaignInfo = await milestoneFund.getCampaignInfo();
    expect(campaignInfo.status).to.equal(3); // GracePeriod

    await milestoneFund.connect(creator).resubmitMilestone();
    await milestoneFund.connect(backer1).voteMilestone(false);
    await milestoneFund.connect(backer2).voteMilestone(false);

    milestoneInfo = await milestoneFund.getMilestoneInfo(1);
    await time.increaseTo(Number(milestoneInfo.votingDeadline) + 1);
    await milestoneFund.connect(other).finalizeVote();

    campaignInfo = await milestoneFund.getCampaignInfo();
    expect(campaignInfo.status).to.equal(4); // Failed

    // remaining pool = 10 - 4 = 6 ETH
    // backer1 contributed 6/10 -> refund = 3.6 ETH
    // backer2 contributed 4/10 -> refund = 2.4 ETH
    const refundable1 = await milestoneFund.getRefundableAmount(backer1.address);
    const refundable2 = await milestoneFund.getRefundableAmount(backer2.address);

    expect(refundable1).to.equal(ethers.parseEther("3.6"));
    expect(refundable2).to.equal(ethers.parseEther("2.4"));

    await expect(
      milestoneFund.connect(backer1).claimRefund()
    ).to.changeEtherBalances(
      [backer1, milestoneFund],
      [ethers.parseEther("3.6"), ethers.parseEther("-3.6")]
    );

    await expect(
      milestoneFund.connect(backer2).claimRefund()
    ).to.changeEtherBalances(
      [backer2, milestoneFund],
      [ethers.parseEther("2.4"), ethers.parseEther("-2.4")]
    );
  });

it("should not allow backer to claim refund twice", async function () {
  const latestTime = await time.latest();
  const deadline = latestTime + DEMO_SECONDS;

  await milestoneFund.connect(creator).createCampaign(campaignParams(deadline, { payoutRatios: [100] }));

  await milestoneFund.connect(backer1).contribute({
    value: ethers.parseEther("10")
  });

  // 先让众筹截止，再结算 funding
  await time.increaseTo(deadline + 1);
  await milestoneFund.connect(other).finalizeFunding();

  // 第一次投票失败
  await milestoneFund.connect(creator).submitMilestone();
  await milestoneFund.connect(backer1).voteMilestone(false);

  let milestoneInfo = await milestoneFund.getMilestoneInfo(0);
  await time.increaseTo(Number(milestoneInfo.votingDeadline) + 1);
  await milestoneFund.connect(other).finalizeVote();

  // 冷静期后再次提交，再失败
  await milestoneFund.connect(creator).resubmitMilestone();
  await milestoneFund.connect(backer1).voteMilestone(false);

  milestoneInfo = await milestoneFund.getMilestoneInfo(0);
  await time.increaseTo(Number(milestoneInfo.votingDeadline) + 1);
  await milestoneFund.connect(other).finalizeVote();

  // 第一次退款成功
  await milestoneFund.connect(backer1).claimRefund();

  // 第二次退款应报错
  await expect(
    milestoneFund.connect(backer1).claimRefund()
  ).to.be.revertedWith("Refund already claimed");
});

  it("should move to Completed after final milestone is approved", async function () {
    const latestTime = await time.latest();
    const deadline = latestTime + DEMO_SECONDS;

    await milestoneFund.connect(creator).createCampaign(campaignParams(deadline));

    await milestoneFund.connect(backer1).contribute({
      value: ethers.parseEther("6")
    });

    await milestoneFund.connect(backer2).contribute({
      value: ethers.parseEther("4")
    });

    await time.increaseTo(deadline + 1);
    await milestoneFund.connect(other).finalizeFunding();

    // Milestone 1 approved
    await milestoneFund.connect(creator).submitMilestone();
    await milestoneFund.connect(backer1).voteMilestone(true);
    await milestoneFund.connect(backer2).voteMilestone(true);

    let milestoneInfo = await milestoneFund.getMilestoneInfo(0);
    await time.increaseTo(Number(milestoneInfo.votingDeadline) + 1);
    await milestoneFund.connect(other).finalizeVote();

    let campaignInfo = await milestoneFund.getCampaignInfo();
    expect(campaignInfo.status).to.equal(1); // Active
    expect(campaignInfo.currentMilestone).to.equal(1);

    // Milestone 2 approved
    await milestoneFund.connect(creator).submitMilestone();
    await milestoneFund.connect(backer1).voteMilestone(true);
    await milestoneFund.connect(backer2).voteMilestone(true);

    milestoneInfo = await milestoneFund.getMilestoneInfo(1);
    await time.increaseTo(Number(milestoneInfo.votingDeadline) + 1);
    await milestoneFund.connect(other).finalizeVote();

    campaignInfo = await milestoneFund.getCampaignInfo();
    expect(campaignInfo.status).to.equal(5); // Completed
    expect(campaignInfo.releasedAmount).to.equal(ethers.parseEther("10"));
  });

it("should run the full demo flow successfully", async function () {
  const latestTime = await time.latest();
  const deadline = latestTime + DEMO_SECONDS;

  // 1. Creator creates campaign
  await milestoneFund.connect(creator).createCampaign(campaignParams(deadline));

  let campaignInfo = await milestoneFund.getCampaignInfo();
  expect(campaignInfo.status).to.equal(0); // Funding

  // 2. Two backers contribute
  await milestoneFund.connect(backer1).contribute({
    value: ethers.parseEther("6")
  });

  await milestoneFund.connect(backer2).contribute({
    value: ethers.parseEther("4")
  });

  campaignInfo = await milestoneFund.getCampaignInfo();
  expect(campaignInfo.totalRaised).to.equal(ethers.parseEther("10"));

  // 3. Finalize funding -> Active
  await time.increaseTo(deadline + 1);
  await milestoneFund.connect(other).finalizeFunding();

  campaignInfo = await milestoneFund.getCampaignInfo();
  expect(campaignInfo.status).to.equal(1); // Active
  expect(campaignInfo.currentMilestone).to.equal(0);

  // 4. Submit milestone 1
  await milestoneFund.connect(creator).submitMilestone();

  campaignInfo = await milestoneFund.getCampaignInfo();
  expect(campaignInfo.status).to.equal(2); // Voting

  // 5. Milestone 1 approved
  await milestoneFund.connect(backer1).voteMilestone(true);
  await milestoneFund.connect(backer2).voteMilestone(true);

  let milestoneInfo = await milestoneFund.getMilestoneInfo(0);
  expect(milestoneInfo.yesVotes).to.equal(ethers.parseEther("10"));
  expect(milestoneInfo.noVotes).to.equal(0);

  await time.increaseTo(Number(milestoneInfo.votingDeadline) + 1);
  await milestoneFund.connect(other).finalizeVote();

  campaignInfo = await milestoneFund.getCampaignInfo();
  expect(campaignInfo.status).to.equal(1); // Active
  expect(campaignInfo.currentMilestone).to.equal(1);
  expect(campaignInfo.releasedAmount).to.equal(ethers.parseEther("4")); // 40% of 10 ETH

  milestoneInfo = await milestoneFund.getMilestoneInfo(0);
  expect(milestoneInfo.fundsReleased).to.equal(true);

  // 6. Submit milestone 2
  await milestoneFund.connect(creator).submitMilestone();

  campaignInfo = await milestoneFund.getCampaignInfo();
  expect(campaignInfo.status).to.equal(2); // Voting

  // 7. First vote fails
  await milestoneFund.connect(backer1).voteMilestone(false);
  await milestoneFund.connect(backer2).voteMilestone(false);

  milestoneInfo = await milestoneFund.getMilestoneInfo(1);
  expect(milestoneInfo.yesVotes).to.equal(0);
  expect(milestoneInfo.noVotes).to.equal(ethers.parseEther("10"));

  await time.increaseTo(Number(milestoneInfo.votingDeadline) + 1);
  await milestoneFund.connect(other).finalizeVote();

  campaignInfo = await milestoneFund.getCampaignInfo();
  expect(campaignInfo.status).to.equal(3); // GracePeriod

  milestoneInfo = await milestoneFund.getMilestoneInfo(1);
  expect(milestoneInfo.graceUsed).to.equal(true);

  // 8. Resubmit during GracePeriod
  await milestoneFund.connect(creator).resubmitMilestone();

  campaignInfo = await milestoneFund.getCampaignInfo();
  expect(campaignInfo.status).to.equal(2); // Voting

  // 9. Final vote fails again
  await milestoneFund.connect(backer1).voteMilestone(false);
  await milestoneFund.connect(backer2).voteMilestone(false);

  milestoneInfo = await milestoneFund.getMilestoneInfo(1);
  await time.increaseTo(Number(milestoneInfo.votingDeadline) + 1);
  await milestoneFund.connect(other).finalizeVote();

  campaignInfo = await milestoneFund.getCampaignInfo();
  expect(campaignInfo.status).to.equal(4); // Failed

  // 10. Check proportional refund
  const refundable1 = await milestoneFund.getRefundableAmount(backer1.address);
  const refundable2 = await milestoneFund.getRefundableAmount(backer2.address);

  expect(refundable1).to.equal(ethers.parseEther("3.6"));
  expect(refundable2).to.equal(ethers.parseEther("2.4"));

  // 11. Claim refunds
  await expect(
    milestoneFund.connect(backer1).claimRefund()
  ).to.changeEtherBalances(
    [backer1, milestoneFund],
    [ethers.parseEther("3.6"), ethers.parseEther("-3.6")]
  );

  await expect(
    milestoneFund.connect(backer2).claimRefund()
  ).to.changeEtherBalances(
    [backer2, milestoneFund],
    [ethers.parseEther("2.4"), ethers.parseEther("-2.4")]
  );

  // 12. Refunds should now be zero
  const refundableAfter1 = await milestoneFund.getRefundableAmount(backer1.address);
  const refundableAfter2 = await milestoneFund.getRefundableAmount(backer2.address);

  expect(refundableAfter1).to.equal(0);
  expect(refundableAfter2).to.equal(0);
});

});

