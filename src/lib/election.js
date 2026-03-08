import { ethers } from "ethers";
import electionArtifact from "../../artifacts/contracts/Election.sol/Election.json";

export const LOCAL_ELECTION = {
  rpcUrl: "http://127.0.0.1:8545",
  chainId: 31337,
  chainName: "Hardhat Localhost",
  contractAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
};

export function getReadOnlyElectionContract() {
  const provider = new ethers.JsonRpcProvider(LOCAL_ELECTION.rpcUrl);

  return new ethers.Contract(
    LOCAL_ELECTION.contractAddress,
    electionArtifact.abi,
    provider,
  );
}
