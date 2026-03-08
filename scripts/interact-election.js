import { network } from "hardhat";
import electionArtifact from "../artifacts/contracts/Election.sol/Election.json" with { type: "json" };

const { ethers } = await network.connect({
  network: "localhost",
});

const electionAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

async function main() {
  const [admin, voterOne] = await ethers.getSigners();

  const electionAsAdmin = new ethers.Contract(
    electionAddress,
    electionArtifact.abi,
    admin,
  );

  const electionAsVoter = new ethers.Contract(
    electionAddress,
    electionArtifact.abi,
    voterOne,
  );

  console.log("Admin:", admin.address);
  console.log("Voter:", voterOne.address);

  console.log("Voting open before:", await electionAsAdmin.votingOpen());

  await (await electionAsAdmin.registerVoter(voterOne.address)).wait();
  console.log("Registered voter:", await electionAsAdmin.isRegisteredVoter(voterOne.address));

  await (await electionAsAdmin.openVoting()).wait();
  console.log("Voting open after:", await electionAsAdmin.votingOpen());

  await (await electionAsVoter.vote(0)).wait();

  const candidate = await electionAsAdmin.candidates(0);
  console.log("Candidate 0 name:", candidate.name);
  console.log("Candidate 0 votes:", candidate.voteCount.toString());
  console.log("Has voter voted:", await electionAsAdmin.hasVoted(voterOne.address));
}
 
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
