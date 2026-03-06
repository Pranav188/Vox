import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

async function increaseTimeTo(timestamp) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await ethers.provider.send("evm_mine", []);
}

describe("VoxVoting", function () {
  async function deployFixture() {
    const [owner, voterOne, voterTwo] = await ethers.getSigners();
    const contract = await ethers.deployContract("VoxVoting", [owner.address]);

    return { contract, owner, voterOne, voterTwo };
  }

  it("allows the owner to create a poll and stores its metadata", async function () {
    const { contract, owner } = await deployFixture();
    const latestBlock = await ethers.provider.getBlock("latest");
    const startsAt = BigInt(latestBlock.timestamp + 60);
    const endsAt = BigInt(latestBlock.timestamp + 3600);

    await expect(
      contract.createPoll(
        "Should Vox ship the MVP on Sepolia first?",
        ["Yes", "No"],
        startsAt,
        endsAt,
      ),
    )
      .to.emit(contract, "PollCreated")
      .withArgs(0n, "Should Vox ship the MVP on Sepolia first?", startsAt, endsAt, owner.address);

    const poll = await contract.getPoll(0);

    expect(poll.question).to.equal("Should Vox ship the MVP on Sepolia first?");
    expect(poll.options).to.deep.equal(["Yes", "No"]);
    expect(poll.voteCounts).to.deep.equal([0n, 0n]);
    expect(poll.totalVotes).to.equal(0n);
    expect(poll.isActive).to.equal(false);
  });

  it("prevents the same wallet from voting twice", async function () {
    const { contract, voterOne } = await deployFixture();
    const latestBlock = await ethers.provider.getBlock("latest");
    const startsAt = latestBlock.timestamp + 5;
    const endsAt = latestBlock.timestamp + 3600;

    await contract.createPoll("Pick one", ["A", "B"], startsAt, endsAt);
    await increaseTimeTo(startsAt + 1);

    await expect(contract.connect(voterOne).vote(0, 1))
      .to.emit(contract, "VoteCast")
      .withArgs(0n, voterOne.address, 1n);

    await expect(contract.connect(voterOne).vote(0, 0)).to.be.revertedWithCustomError(
      contract,
      "AlreadyVoted",
    );
  });

  it("rejects votes before the poll starts and after it ends", async function () {
    const { contract, voterOne } = await deployFixture();
    const latestBlock = await ethers.provider.getBlock("latest");
    const startsAt = latestBlock.timestamp + 120;
    const endsAt = latestBlock.timestamp + 240;

    await contract.createPoll("Timing test", ["A", "B"], startsAt, endsAt);

    await expect(contract.connect(voterOne).vote(0, 0)).to.be.revertedWithCustomError(
      contract,
      "PollNotActive",
    );

    await increaseTimeTo(endsAt + 1);

    await expect(contract.connect(voterOne).vote(0, 0)).to.be.revertedWithCustomError(
      contract,
      "PollNotActive",
    );
  });

  it("tracks results across different wallets", async function () {
    const { contract, voterOne, voterTwo } = await deployFixture();
    const latestBlock = await ethers.provider.getBlock("latest");
    const startsAt = latestBlock.timestamp + 10;
    const endsAt = latestBlock.timestamp + 3600;

    await contract.createPoll("Best rollout strategy?", ["Localhost", "Sepolia", "Mainnet"], startsAt, endsAt);
    await increaseTimeTo(startsAt + 1);

    await contract.connect(voterOne).vote(0, 0);
    await contract.connect(voterTwo).vote(0, 1);

    const poll = await contract.getPoll(0);

    expect(poll.totalVotes).to.equal(2n);
    expect(poll.voteCounts).to.deep.equal([1n, 1n, 0n]);
    expect(poll.isActive).to.equal(true);
  });
});
