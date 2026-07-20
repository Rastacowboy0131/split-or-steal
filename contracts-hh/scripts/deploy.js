// Deploy script for RH chain. Usage:
// RH_RPC_URL=... RH_CHAIN_ID=... DEPLOYER_KEY=... SOS_TOKEN=0x... npx hardhat run scripts/deploy.js --network robinhood
const hre = require("hardhat");

async function main() {
  const token = process.env.SOS_TOKEN || hre.ethers.ZeroAddress; // placeholder until $SoS launches
  const F = await hre.ethers.getContractFactory("SplitOrSteal");
  const c = await F.deploy(token);
  await c.waitForDeployment();
  const addr = await c.getAddress();
  console.log("SplitOrSteal deployed:", addr);

  // v1 room: bronze tier (minHold set later once token supply is known)
  const tx = await c.createRoom(
    process.env.ROOM_MIN_HOLD || 0n,
    process.env.ROOM_POT || hre.ethers.parseEther("0.1"),
    process.env.ROOM_COOLDOWN || 600
  );
  await tx.wait();
  console.log("Room 0 created");
}

main().catch((e) => { console.error(e); process.exit(1); });
