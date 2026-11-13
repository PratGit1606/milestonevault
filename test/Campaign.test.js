const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

const DAY = 24 * 60 * 60;
const VOTING_PERIOD = 3 * DAY;
const USDC = 10n ** 6n;
const tokens = (value) => BigInt(value) * USDC;

async function deployFixture() {
  const [owner, creator, backer1, backer2, backer3, outsider] = await ethers.getSigners();
  const usdc = await ethers.deployContract("MockUSDC");
  const factory = await ethers.deployContract("CampaignFactory", [await usdc.getAddress()]);
  return { owner, creator, backer1, backer2, backer3, outsider, usdc, factory };
}

async function createCampaignFixture() {
  const base = await loadFixture(deployFixture);
  const now = await time.latest();
  const fundingDeadline = now + DAY;
  const milestones = [
    [3000, fundingDeadline + 10 * DAY],
    [3000, fundingDeadline + 20 * DAY],
    [4000, fundingDeadline + 30 * DAY],
  ];
  await base.factory.connect(base.creator).createCampaign(tokens(3000), fundingDeadline, milestones);
  const address = await base.factory.campaignAt(0);
  const campaign = await ethers.getContractAt("Campaign", address);
  return { ...base, campaign, address, fundingDeadline, milestones };
}

async function fundedCampaignFixture() {
  const base = await loadFixture(createCampaignFixture);
  const funding = [tokens(1600), tokens(1000), tokens(400)];
  const backers = [base.backer1, base.backer2, base.backer3];
  for (let i = 0; i < backers.length; i++) {
    await base.usdc.mint(backers[i].address, funding[i]);
    await base.usdc.connect(backers[i]).approve(base.address, funding[i]);
    await base.campaign.connect(backers[i]).contribute(funding[i]);
  }
  await time.increaseTo(base.fundingDeadline);
  await base.campaign.finalizeFunding();
  return { ...base, funding, backers };
}

async function finishVote(campaign) {
  await time.increaseTo(await campaign.votingEnds());
  await campaign.finalizeVote();
}

describe("CampaignFactory", function () {
  it("creates campaigns and maintains both registries", async function () {
    const { factory, creator } = await loadFixture(deployFixture);
    const now = await time.latest();
    const deadline = now + DAY;
    await expect(factory.connect(creator).createCampaign(tokens(1), deadline, [[10000, deadline + DAY]]))
      .to.emit(factory, "CampaignCreated");
    const address = await factory.campaignAt(0);
    expect(await factory.campaignCount()).to.equal(1);
    expect(await factory.campaignsByCreator(creator.address)).to.deep.equal([address]);
    await expect(factory.campaignAt(1)).to.be.revertedWith("Factory: bad index");
  });

  it("validates goal, deadline, due dates, and milestone shares", async function () {
    const { factory, creator } = await loadFixture(deployFixture);
    const now = await time.latest();
    const deadline = now + DAY;
    await expect(factory.connect(creator).createCampaign(0, deadline, [[10000, deadline + DAY]]))
      .to.be.revertedWith("Campaign: goal is zero");
    await expect(factory.connect(creator).createCampaign(1, now, [[10000, now + DAY]]))
      .to.be.revertedWith("Campaign: deadline in past");
    await expect(factory.connect(creator).createCampaign(1, deadline, []))
      .to.be.revertedWith("Campaign: no milestones");
    await expect(factory.connect(creator).createCampaign(1, deadline, [[10000, deadline]]))
      .to.be.revertedWith("Campaign: bad due date order");
    await expect(factory.connect(creator).createCampaign(1, deadline, [[5000, deadline + 2 * DAY], [5000, deadline + DAY]]))
      .to.be.revertedWith("Campaign: bad due date order");
    await expect(factory.connect(creator).createCampaign(1, deadline, [[9000, deadline + DAY]]))
      .to.be.revertedWith("Campaign: shares must sum to 10000");
  });

  it("rejects a zero token factory", async function () {
    const Factory = await ethers.getContractFactory("CampaignFactory");
    await expect(Factory.deploy(ethers.ZeroAddress)).to.be.revertedWith("Factory: zero token");
  });
});

describe("Funding", function () {
  it("accepts contributions and records vote weight", async function () {
    const { usdc, campaign, address, backer1 } = await loadFixture(createCampaignFixture);
    await usdc.mint(backer1.address, tokens(50));
    await usdc.connect(backer1).approve(address, tokens(50));
    await expect(campaign.connect(backer1).contribute(tokens(50)))
      .to.emit(campaign, "Contributed").withArgs(backer1.address, tokens(50), tokens(50));
    expect(await campaign.contributionOf(backer1.address)).to.equal(tokens(50));
    expect(await usdc.balanceOf(address)).to.equal(tokens(50));
    await expect(campaign.connect(backer1).contribute(0)).to.be.revertedWith("Campaign: amount is zero");
  });

  it("closes funding at the deadline", async function () {
    const { usdc, campaign, address, backer1, fundingDeadline } = await loadFixture(createCampaignFixture);
    await usdc.mint(backer1.address, tokens(1));
    await usdc.connect(backer1).approve(address, tokens(1));
    await time.increaseTo(fundingDeadline);
    await expect(campaign.connect(backer1).contribute(tokens(1))).to.be.revertedWith("Campaign: funding closed");
  });

  it("activates when the goal is met", async function () {
    const { campaign } = await loadFixture(fundedCampaignFixture);
    expect(await campaign.status()).to.equal(1);
    await expect(campaign.finalizeFunding()).to.be.revertedWith("Campaign: wrong status");
  });

  it("cancels when the goal is missed", async function () {
    const { usdc, campaign, address, backer1, fundingDeadline } = await loadFixture(createCampaignFixture);
    await usdc.mint(backer1.address, tokens(10));
    await usdc.connect(backer1).approve(address, tokens(10));
    await campaign.connect(backer1).contribute(tokens(10));
    await expect(campaign.finalizeFunding()).to.be.revertedWith("Campaign: funding still open");
    await time.increaseTo(fundingDeadline);
    await expect(campaign.finalizeFunding()).to.emit(campaign, "FundingFinalized").withArgs(false, tokens(10));
    expect(await campaign.status()).to.equal(2);
  });
});

describe("Voting", function () {
  it("counts weighted votes and blocks invalid voters", async function () {
    const { campaign, creator, backer1, backer2, outsider, funding } = await loadFixture(fundedCampaignFixture);
    await campaign.connect(creator).submitMilestone("bafy-evidence");
    await expect(campaign.connect(backer1).vote(true))
      .to.emit(campaign, "Voted").withArgs(0, backer1.address, true, funding[0]);
    await campaign.connect(backer2).vote(false);
    expect(await campaign.yesWeight()).to.equal(funding[0]);
    expect(await campaign.noWeight()).to.equal(funding[1]);
    expect(await campaign.hasVoted(backer1.address)).to.equal(true);
    await expect(campaign.connect(backer1).vote(true)).to.be.revertedWith("Campaign: already voted");
    await expect(campaign.connect(outsider).vote(true)).to.be.revertedWith("Campaign: not a backer");
  });

  it("requires quorum", async function () {
    const { campaign, creator, backer3 } = await loadFixture(fundedCampaignFixture);
    await campaign.connect(creator).submitMilestone("cid");
    await campaign.connect(backer3).vote(true);
    await finishVote(campaign);
    expect((await campaign.getMilestone(0)).status).to.equal(3);
    expect(await campaign.status()).to.equal(1);
  });

  it("requires a strict yes majority", async function () {
    const { campaign, creator, backer2, backer3 } = await loadFixture(fundedCampaignFixture);
    await campaign.connect(creator).submitMilestone("cid");
    await campaign.connect(backer3).vote(true);
    await campaign.connect(backer2).vote(false);
    await finishVote(campaign);
    expect((await campaign.getMilestone(0)).status).to.equal(3);
  });

  it("enforces the voting window", async function () {
    const { campaign, creator, backer1 } = await loadFixture(fundedCampaignFixture);
    await expect(campaign.connect(backer1).vote(true)).to.be.revertedWith("Campaign: no open vote");
    await campaign.connect(creator).submitMilestone("cid");
    await expect(campaign.finalizeVote()).to.be.revertedWith("Campaign: voting still open");
    const votingEnds = await campaign.votingEnds();
    await time.increaseTo(votingEnds);
    await expect(campaign.connect(backer1).vote(true)).to.be.revertedWith("Campaign: voting closed");
  });

  it("limits submission to the creator with nonempty evidence", async function () {
    const { campaign, creator, outsider } = await loadFixture(fundedCampaignFixture);
    await expect(campaign.connect(outsider).submitMilestone("cid")).to.be.revertedWith("Campaign: not creator");
    await expect(campaign.connect(creator).submitMilestone("")).to.be.revertedWith("Campaign: empty evidence");
    await campaign.connect(creator).submitMilestone("cid");
    await expect(campaign.connect(creator).submitMilestone("again")).to.be.revertedWith("Campaign: cannot submit now");
  });
});

describe("Payouts and rejection", function () {
  it("uses tranche shares and gives rounding dust to the last tranche", async function () {
    const { creator, backer1, usdc, factory } = await loadFixture(deployFixture);
    const now = await time.latest();
    const deadline = now + DAY;
    const total = 1_000_001n;
    await factory.connect(creator).createCampaign(total, deadline, [
      [3333, deadline + 10 * DAY], [3333, deadline + 20 * DAY], [3334, deadline + 30 * DAY],
    ]);
    const address = await factory.campaignAt(0);
    const campaign = await ethers.getContractAt("Campaign", address);
    await usdc.mint(backer1.address, total);
    await usdc.connect(backer1).approve(address, total);
    await campaign.connect(backer1).contribute(total);
    await time.increaseTo(deadline);
    await campaign.finalizeFunding();

    const expected = [(total * 3333n) / 10000n, (total * 3333n) / 10000n];
    expected.push(total - expected[0] - expected[1]);
    for (let i = 0; i < 3; i++) {
      await campaign.connect(creator).submitMilestone(`cid-${i}`);
      await campaign.connect(backer1).vote(true);
      await expect(campaign.finalizeVote()).to.be.revertedWith("Campaign: voting still open");
      await time.increase(VOTING_PERIOD);
      await expect(campaign.finalizeVote()).to.emit(campaign, "MilestoneApproved").withArgs(i, expected[i]);
    }
    expect(await usdc.balanceOf(creator.address)).to.equal(total);
    expect(await campaign.totalReleased()).to.equal(total);
    expect(await campaign.status()).to.equal(3);
  });

  it("allows one resubmission and cancels after the second rejection", async function () {
    const { campaign, creator, backer1 } = await loadFixture(fundedCampaignFixture);
    await campaign.connect(creator).submitMilestone("first");
    await campaign.connect(backer1).vote(false);
    await finishVote(campaign);
    let milestone = await campaign.getMilestone(0);
    expect(milestone.status).to.equal(3);
    expect(milestone.attempts).to.equal(1);

    await campaign.connect(creator).submitMilestone("second");
    await campaign.connect(backer1).vote(false);
    await time.increaseTo(await campaign.votingEnds());
    await expect(campaign.finalizeVote()).to.emit(campaign, "CampaignCancelled").withArgs("milestone rejected twice");
    expect(await campaign.status()).to.equal(2);
    await expect(campaign.connect(creator).submitMilestone("third")).to.be.revertedWith("Campaign: wrong status");
  });

  it("cancels an overdue pending milestone", async function () {
    const { campaign, milestones } = await loadFixture(fundedCampaignFixture);
    await time.increaseTo(milestones[0][1] + 1);
    await expect(campaign.cancelIfOverdue()).to.emit(campaign, "CampaignCancelled").withArgs("milestone overdue");
    expect(await campaign.status()).to.equal(2);
  });

  it("will not cancel while a vote is open", async function () {
    const { campaign, creator, milestones } = await loadFixture(fundedCampaignFixture);
    await campaign.connect(creator).submitMilestone("cid");
    await time.increaseTo(milestones[0][1] + 1);
    await expect(campaign.cancelIfOverdue()).to.be.revertedWith("Campaign: vote in progress");
  });

  it("cancels when a rejected vote finishes after its due date", async function () {
    const { campaign, creator, backer1, milestones } = await loadFixture(fundedCampaignFixture);
    await time.increaseTo(milestones[0][1] - DAY);
    await campaign.connect(creator).submitMilestone("late-cid");
    await campaign.connect(backer1).vote(false);
    await time.increaseTo(await campaign.votingEnds());
    await expect(campaign.finalizeVote()).to.emit(campaign, "CampaignCancelled").withArgs("milestone overdue");
  });
});

describe("Refunds", function () {
  it("pays pro-rata refunds after a partial release and blocks double claims", async function () {
    const { campaign, creator, backer1, backer2, backer3, usdc, funding } = await loadFixture(fundedCampaignFixture);
    await expect(campaign.connect(backer1).claimRefund()).to.be.revertedWith("Campaign: wrong status");

    await campaign.connect(creator).submitMilestone("approved");
    await campaign.connect(backer1).vote(true);
    await finishVote(campaign);
    expect(await campaign.totalReleased()).to.equal(tokens(900));

    for (const cid of ["reject-one", "reject-two"]) {
      await campaign.connect(creator).submitMilestone(cid);
      await campaign.connect(backer1).vote(false);
      await finishVote(campaign);
    }

    const remaining = tokens(2100);
    const recipients = [backer1, backer2, backer3];
    for (let i = 0; i < recipients.length; i++) {
      const expected = (funding[i] * remaining) / tokens(3000);
      await expect(() => campaign.connect(recipients[i]).claimRefund())
        .to.changeTokenBalance(usdc, recipients[i], expected);
    }
    await expect(campaign.connect(backer1).claimRefund()).to.be.revertedWith("Campaign: already refunded");
  });

  it("blocks refund claims by non-backers", async function () {
    const { campaign, outsider } = await loadFixture(fundedCampaignFixture);
    await time.increaseTo((await campaign.getMilestone(0)).dueDate + 1n);
    await campaign.cancelIfOverdue();
    await expect(campaign.connect(outsider).claimRefund()).to.be.revertedWith("Campaign: nothing to refund");
  });
});

describe("Reentrancy", function () {
  it("blocks a malicious token callback during payout", async function () {
    const [creator, backer] = await ethers.getSigners();
    const token = await ethers.deployContract("ReentrantToken");
    const factory = await ethers.deployContract("CampaignFactory", [await token.getAddress()]);
    const now = await time.latest();
    const deadline = now + DAY;
    await factory.connect(creator).createCampaign(1000, deadline, [[10000, deadline + 10 * DAY]]);
    const address = await factory.campaignAt(0);
    const campaign = await ethers.getContractAt("Campaign", address);
    await token.mint(backer.address, 1000);
    await token.connect(backer).approve(address, 1000);
    await campaign.connect(backer).contribute(1000);
    await time.increaseTo(deadline);
    await campaign.finalizeFunding();
    await campaign.connect(creator).submitMilestone("cid");
    await campaign.connect(backer).vote(true);
    await time.increaseTo(await campaign.votingEnds());
    await token.armCallback(address, campaign.interface.encodeFunctionData("finalizeVote"));

    await campaign.finalizeVote();
    expect(await token.callbackSucceeded()).to.equal(false);
    expect(await token.balanceOf(creator.address)).to.equal(1000);
    expect(await token.balanceOf(address)).to.equal(0);
    expect(await campaign.status()).to.equal(3);
  });
});
