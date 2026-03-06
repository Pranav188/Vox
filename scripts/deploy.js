import { network } from "hardhat";

const { ethers } = await network.connect();

async function main() {
  const [deployer] = await ethers.getSigners();
  const contract = await ethers.deployContract("VoxVoting", [deployer.address]);

  await contract.waitForDeployment();

  console.log("VoxVoting deployed");
  console.log(`deployer=${deployer.address}`);
  console.log(`address=${await contract.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
