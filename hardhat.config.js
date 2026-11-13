/**
 * Hardhat config: compiles the contracts with solc 0.8.20 and adds the
 * Sepolia network only when SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY are set in .env.
 */
require("@nomicfoundation/hardhat-toolbox");
require("solidity-coverage");
require("dotenv").config();

const { SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY } = process.env;

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    ...(SEPOLIA_RPC_URL && DEPLOYER_PRIVATE_KEY
      ? { sepolia: { url: SEPOLIA_RPC_URL, accounts: [DEPLOYER_PRIVATE_KEY] } }
      : {}),
  },
};
