import { network } from "hardhat";

const { ethers } = await network.connect({
  network: "localhost",
});

async function main() {
  const election = await ethers.deployContract("Election", [
    "Student Council Election 2026",
    ["Alice", "Bob"],
  ]);

  await election.waitForDeployment();

  console.log("Election deployed to:", await election.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
