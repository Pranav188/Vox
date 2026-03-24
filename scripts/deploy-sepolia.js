import { network } from "hardhat";

const { ethers } = await network.connect({
  network: "sepolia",
});

async function main() {
  console.log("Deploying Election contract to Sepolia...");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  const election = await ethers.deployContract("Election", [
    "Student Council Election 2026",
    ["Alice", "Bob"],
  ]);

  await election.waitForDeployment();

  const address = await election.getAddress();
  console.log("Election deployed to Sepolia at:", address);
  console.log("Update ELECTION_NETWORKS.sepolia.contractAddress in src/lib/election.js with this address.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
