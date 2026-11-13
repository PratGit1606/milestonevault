const { ethers, network } = require("hardhat");

const USDC = 10n ** 6n;
const DAY = 24 * 60 * 60;
const amount = (value) => BigInt(value) * USDC;
const format = (value) => `${ethers.formatUnits(value, 6)} mUSDC`;

function heading(label) {
  console.log(`\n=== ${label} ===`);
}

async function advanceTo(timestamp) {
  const block = await ethers.provider.getBlock("latest");
  const delta = Number(timestamp) - block.timestamp;
  if (delta > 0) {
    await network.provider.send("evm_increaseTime", [delta]);
  }
  await network.provider.send("hardhat_mine", ["0x1"]);
}

async function printBalances(usdc, campaign, accounts) {
  for (const [name, signer] of accounts) {
    console.log(`${name.padEnd(10)} ${signer.address}  ${format(await usdc.balanceOf(signer.address))}`);
  }
  console.log(`${"Escrow".padEnd(10)} ${await campaign.getAddress()}  ${format(await usdc.balanceOf(await campaign.getAddress()))}`);
}

async function voteAndFinalize(campaign, votes) {
  for (const [signer, approve] of votes) {
    await (await campaign.connect(signer).vote(approve)).wait();
  }
  await advanceTo(await campaign.votingEnds());
  await (await campaign.finalizeVote()).wait();
}

async function main() {
  const [deployer, creator, backer1, backer2, backer3] = await ethers.getSigners();

  heading("1. Deploy contracts");
  const usdc = await ethers.deployContract("MockUSDC");
  await usdc.waitForDeployment();
  const factory = await ethers.deployContract("CampaignFactory", [await usdc.getAddress()]);
  await factory.waitForDeployment();
  console.log("MockUSDC:       ", await usdc.getAddress());
  console.log("CampaignFactory:", await factory.getAddress());

  heading("2. Fund demo accounts from the faucet");
  for (const signer of [creator, backer1, backer1, backer2, backer3]) {
    await (await usdc.connect(signer).faucet()).wait();
  }
  console.log("Creator and all three backers received test mUSDC.");

  heading("3. Create a 3,000 mUSDC campaign");
  const latest = await ethers.provider.getBlock("latest");
  const fundingDeadline = latest.timestamp + 120;
  const milestones = [
    [3000, fundingDeadline + 10 * DAY],
    [3000, fundingDeadline + 25 * DAY],
    [4000, fundingDeadline + 40 * DAY],
  ];
  await (await factory.connect(creator).createCampaign(amount(3000), fundingDeadline, milestones)).wait();
  const campaignAddress = await factory.campaignAt(0);
  const campaign = await ethers.getContractAt("Campaign", campaignAddress);
  console.log("Campaign:", campaignAddress);
  console.log("Shares: 30% / 30% / 40%");

  heading("4. Approve and contribute unequal amounts");
  const contributions = [[backer1, amount(1400)], [backer2, amount(1000)], [backer3, amount(600)]];
  for (const [backer, value] of contributions) {
    await (await usdc.connect(backer).approve(campaignAddress, value)).wait();
    await (await campaign.connect(backer).contribute(value)).wait();
    console.log(`${backer.address}: ${format(value)}`);
  }
  console.log("Total raised:", format(await campaign.totalRaised()));

  heading("5. Close funding and activate the campaign");
  await advanceTo(fundingDeadline);
  await (await campaign.finalizeFunding()).wait();
  console.log("Status:", await campaign.status() === 1n ? "Active" : "Unexpected");

  heading("6. Approve milestone 1 and release 30%");
  await (await campaign.connect(creator).submitMilestone("bafy-demo-milestone-1")).wait();
  await voteAndFinalize(campaign, [[backer1, true], [backer2, true], [backer3, false]]);
  console.log("Creator tranche:", format(await usdc.balanceOf(creator.address) - amount(1000)));
  console.log("Released total:", format(await campaign.totalReleased()));

  heading("7. Reject, resubmit, and approve milestone 2");
  await (await campaign.connect(creator).submitMilestone("bafy-demo-milestone-2-first")).wait();
  await voteAndFinalize(campaign, [[backer1, false], [backer2, true]]);
  console.log("First attempt status: Rejected");
  await (await campaign.connect(creator).submitMilestone("bafy-demo-milestone-2-revised")).wait();
  await voteAndFinalize(campaign, [[backer1, true], [backer2, true]]);
  console.log("Second attempt status: Approved");
  console.log("Released total:", format(await campaign.totalReleased()));

  heading("8. Reject milestone 3 twice, cancel, and refund");
  for (const cid of ["bafy-demo-milestone-3-first", "bafy-demo-milestone-3-revised"]) {
    await (await campaign.connect(creator).submitMilestone(cid)).wait();
    await voteAndFinalize(campaign, [[backer1, false], [backer2, true]]);
  }
  console.log("Status:", await campaign.status() === 2n ? "Cancelled" : "Unexpected");
  for (const [backer] of contributions) {
    const before = await usdc.balanceOf(backer.address);
    await (await campaign.connect(backer).claimRefund()).wait();
    console.log(`${backer.address} refund: ${format((await usdc.balanceOf(backer.address)) - before)}`);
  }

  heading("Final balances");
  await printBalances(usdc, campaign, [
    ["Deployer", deployer], ["Creator", creator], ["Backer 1", backer1], ["Backer 2", backer2], ["Backer 3", backer3],
  ]);
  console.log("\nDemo completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
