import { ethers } from "ethers";
import electionArtifact from "../../artifacts/contracts/Election.sol/Election.json";

export const ELECTION_NETWORKS = {
  localhost: {
    rpcUrl: "http://127.0.0.1:8545",
    chainId: 31337,
    chainName: "Hardhat Localhost",
    contractAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  },
  sepolia: {
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    chainId: 11155111,
    chainName: "Sepolia",
    contractAddress: "",
  },
};

const DEFAULT_NETWORK_KEY = import.meta.env.VITE_ELECTION_NETWORK || "localhost";
const baseConfig = ELECTION_NETWORKS[DEFAULT_NETWORK_KEY] || ELECTION_NETWORKS.localhost;

export const ELECTION_CONFIG = {
  ...baseConfig,
  rpcUrl: import.meta.env.VITE_ELECTION_RPC_URL || baseConfig.rpcUrl,
  chainId: Number(import.meta.env.VITE_ELECTION_CHAIN_ID || baseConfig.chainId),
  chainName: import.meta.env.VITE_ELECTION_CHAIN_NAME || baseConfig.chainName,
  contractAddress: import.meta.env.VITE_ELECTION_CONTRACT_ADDRESS || baseConfig.contractAddress,
};

export function getReadOnlyElectionContract(config = ELECTION_CONFIG) {
  if (!config.contractAddress) {
    throw new Error(`No contract address configured for ${config.chainName}.`);
  }

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);

  return new ethers.Contract(
    config.contractAddress,
    electionArtifact.abi,
    provider,
  );
}
