import { ethers } from "ethers";

const FALLBACK_ELECTION_ABI = [
  {
    inputs: [
      { internalType: "string", name: "_electionName", type: "string" },
      { internalType: "string[]", name: "candidateNames", type: "string[]" },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [],
    name: "admin",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "candidates",
    outputs: [
      { internalType: "string", name: "name", type: "string" },
      { internalType: "uint256", name: "voteCount", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "closeVoting",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "electionName",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getCandidateCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "hasVoted",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "isRegisteredVoter",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "openVoting",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "voter", type: "address" }],
    name: "registerVoter",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "candidateIndex", type: "uint256" }],
    name: "vote",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "votingOpen",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
];

const artifactModules = import.meta.glob("../../artifacts/contracts/Election.sol/Election.json", { eager: true });
const artifactModule = Object.values(artifactModules)[0];
const electionAbi = artifactModule?.default?.abi ?? artifactModule?.abi ?? FALLBACK_ELECTION_ABI;

export const ELECTION_NETWORKS = {
  localhost: {
    rpcUrl: "http://127.0.0.1:8545",
    chainId: 31337,
    chainName: "Hardhat Localhost",
    contractAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  },
  sepolia: {
    rpcUrl: "https://sepolia.infura.io/v3/b0dbf72058bd4f4f8400fc1265e9ddd5",
    chainId: 11155111,
    chainName: "Sepolia",
    contractAddress: "0xa78C18A821150b2077f06BB8F19C0dB44fd5AD35",
  },
};

export const DEFAULT_NETWORK_KEY = import.meta.env.VITE_ELECTION_NETWORK || "sepolia";

export function getConfigForNetwork(networkKey, contractAddressOverride) {
  const base = ELECTION_NETWORKS[networkKey] || ELECTION_NETWORKS.sepolia;
  return {
    ...base,
    contractAddress: contractAddressOverride || base.contractAddress,
  };
}

export function getReadOnlyElectionContract(config) {
  if (!config || !config.contractAddress) {
    throw new Error("No contract address configured.");
  }

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);

  return new ethers.Contract(
    config.contractAddress,
    electionAbi,
    provider,
  );
}
