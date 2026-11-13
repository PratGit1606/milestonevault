const fs = require("fs");
const path = require("path");

const contracts = [
  ["contracts/mocks/MockUSDC.sol/MockUSDC.json", "MockUSDC.json"],
  ["contracts/CampaignFactory.sol/CampaignFactory.json", "CampaignFactory.json"],
  ["contracts/Campaign.sol/Campaign.json", "Campaign.json"],
];

const artifactRoot = path.join(__dirname, "..", "artifacts");
const outputDir = path.join(__dirname, "..", "frontend", "abi");
fs.mkdirSync(outputDir, { recursive: true });

for (const [source, output] of contracts) {
  const artifact = JSON.parse(fs.readFileSync(path.join(artifactRoot, source), "utf8"));
  fs.writeFileSync(path.join(outputDir, output), `${JSON.stringify(artifact.abi, null, 2)}\n`);
  console.log(`Copied ${output}`);
}
