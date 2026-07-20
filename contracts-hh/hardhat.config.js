require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");

/** RH chain placeholders: fill RPC + chainId when deploying */
module.exports = {
  solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 200 } } },
  networks: {
    robinhood: {
      url: process.env.RH_RPC_URL || "https://rpc.placeholder.robinhood.example",
      chainId: Number(process.env.RH_CHAIN_ID || 0) || 31337,
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
    },
  },
};
