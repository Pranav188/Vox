import { ethers } from "ethers";
import { Election__factory } from "../../types/ethers-contracts/factories/Election__factory";

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
    Election__factory.abi,
    provider,
  );
}

