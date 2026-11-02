const hre = require("hardhat");

/**
 * Deploys MockUSDC and a CampaignFactory that uses it, then prints both addresses
 * for the frontend. Run with: npx hardhat run scripts/deploy.js --network <localhost|sepolia>
 */
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("MockUSDC deployed to:        ", usdcAddress);

  const CampaignFactory = await hre.ethers.getContractFactory("CampaignFactory");
  const factory = await CampaignFactory.deploy(usdcAddress);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("CampaignFactory deployed to: ", factoryAddress);

  console.log("\nAdd these to the frontend environment file:");
  console.log(`NEXT_PUBLIC_USDC_ADDRESS=${usdcAddress}`);
  console.log(`NEXT_PUBLIC_FACTORY_ADDRESS=${factoryAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
