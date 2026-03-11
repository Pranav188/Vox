import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("Election", function () {
  async function deployElectionFixture() {
    const [admin, voterOne, voterTwo, outsider] = await ethers.getSigners();

    const election = await ethers.deployContract("Election", [
      "Student Council Election 2026",
      ["Alice", "Bob"],
    ]);

    await election.waitForDeployment();

    return { election, admin, voterOne, voterTwo, outsider };
  }

  it("sets the deployer as admin", async function () {
    const { election, admin } = await deployElectionFixture();

    expect(await election.admin()).to.equal(admin.address);
  });

  it("starts with voting closed", async function () {
    const { election } = await deployElectionFixture();

    expect(await election.votingOpen()).to.equal(false);
  });

  it("registers a voter when called by the admin", async function () {
    const { election, voterOne } = await deployElectionFixture();

    await election.registerVoter(voterOne.address);

    expect(await election.isRegisteredVoter(voterOne.address)).to.equal(true);
  });

  it("rejects voter registration when called by a non-admin", async function () {
    const { election, voterOne, voterTwo } = await deployElectionFixture();

    await expect(
      election.connect(voterOne).registerVoter(voterTwo.address),
    ).to.be.revertedWith("Only admin can register voters");
  });

  it("allows a registered voter to vote when voting is open", async function () {
    const { election, voterOne } = await deployElectionFixture();

    await election.registerVoter(voterOne.address);
    await election.openVoting();

    await election.connect(voterOne).vote(0);

    const candidate = await election.candidates(0);
    expect(candidate.voteCount).to.equal(1n);
    expect(await election.hasVoted(voterOne.address)).to.equal(true);
  });

  it("rejects votes from unregistered voters", async function () {
    const { election, outsider } = await deployElectionFixture();

    await election.openVoting();

    await expect(election.connect(outsider).vote(0)).to.be.revertedWith(
      "You are not a registered voter",
    );
  });

  it("rejects double voting", async function () {
    const { election, voterOne } = await deployElectionFixture();

    await election.registerVoter(voterOne.address);
    await election.openVoting();

    await election.connect(voterOne).vote(0);

    await expect(election.connect(voterOne).vote(1)).to.be.revertedWith(
      "You have already voted",
    );
  });

  it("rejects invalid candidate indexes", async function () {
    const { election, voterOne } = await deployElectionFixture();

    await election.registerVoter(voterOne.address);
    await election.openVoting();

    await expect(election.connect(voterOne).vote(99)).to.be.revertedWith(
      "Invalid candidate index",
    );
  });

  it("rejects votes while voting is closed", async function () {
    const { election, voterOne } = await deployElectionFixture();

    await election.registerVoter(voterOne.address);

    await expect(election.connect(voterOne).vote(0)).to.be.revertedWith(
      "Voting is closed",
    );
  });

  it("rejects opening voting when called by a non-admin", async function () {
    const { election, voterOne } = await deployElectionFixture();

    await expect(election.connect(voterOne).openVoting()).to.be.revertedWith(
      "Only admin can open voting",
    );
  });

  it("rejects closing voting when called by a non-admin", async function () {
    const { election, voterOne } = await deployElectionFixture();

    await expect(election.connect(voterOne).closeVoting()).to.be.revertedWith(
      "Only admin can close voting",
    );
  });

  it("supports repeated open and close actions without corrupting state", async function () {
    const { election, voterOne } = await deployElectionFixture();

    await election.registerVoter(voterOne.address);

    await election.openVoting();
    await election.openVoting();
    expect(await election.votingOpen()).to.equal(true);

    await election.connect(voterOne).vote(0);

    await election.closeVoting();
    await election.closeVoting();
    expect(await election.votingOpen()).to.equal(false);

    await expect(election.connect(voterOne).vote(1)).to.be.revertedWith(
      "Voting is closed",
    );
  });

  it("allows duplicate voter registration without affecting vote eligibility", async function () {
    const { election, voterOne } = await deployElectionFixture();

    await election.registerVoter(voterOne.address);
    await election.registerVoter(voterOne.address);
    await election.openVoting();

    await election.connect(voterOne).vote(0);

    expect(await election.isRegisteredVoter(voterOne.address)).to.equal(true);
    expect(await election.hasVoted(voterOne.address)).to.equal(true);
  });

  it("uses a fresh deployment for each fixture run", async function () {
    const firstDeployment = await deployElectionFixture();
    await firstDeployment.election.registerVoter(firstDeployment.voterOne.address);
    await firstDeployment.election.openVoting();
    await firstDeployment.election.connect(firstDeployment.voterOne).vote(0);

    const secondDeployment = await deployElectionFixture();

    expect(
      await secondDeployment.election.isRegisteredVoter(secondDeployment.voterOne.address),
    ).to.equal(false);
    expect(await secondDeployment.election.hasVoted(secondDeployment.voterOne.address)).to.equal(
      false,
    );
    expect(await secondDeployment.election.votingOpen()).to.equal(false);

    const candidate = await secondDeployment.election.candidates(0);
    expect(candidate.voteCount).to.equal(0n);
  });
});
