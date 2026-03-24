import { ethers } from "ethers";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ARTIFACT_PATH = join(__dirname, "..", "..", "artifacts", "contracts", "Election.sol", "Election.json");

let provider;
let adminWallet;
let contract;
let artifact;

function getArtifact() {
  if (!artifact) {
    artifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf-8"));
  }
  return artifact;
}

function init() {
  if (contract) return;

  const rpcUrl = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY;
  const contractAddress = process.env.VITE_ELECTION_CONTRACT_ADDRESS || "0xa78C18A821150b2077f06BB8F19C0dB44fd5AD35";

  if (!privateKey) {
    throw new Error("SEPOLIA_PRIVATE_KEY is not set in .env");
  }

  const { abi } = getArtifact();

  provider = new ethers.JsonRpcProvider(rpcUrl);
  adminWallet = new ethers.Wallet(privateKey, provider);
  contract = new ethers.Contract(contractAddress, abi, adminWallet);
}

export function setContractAddress(address) {
  const { abi } = getArtifact();
  if (!provider || !adminWallet) {
    init();
  }
  contract = new ethers.Contract(address, abi, adminWallet);
}

export async function deployElection(electionName, candidates) {
  init();
  const { abi, bytecode } = getArtifact();
  const factory = new ethers.ContractFactory(abi, bytecode, adminWallet);
  const deployed = await factory.deploy(electionName, candidates);
  await deployed.waitForDeployment();
  const address = await deployed.getAddress();
  // Point the in-memory contract to the newly deployed one
  contract = new ethers.Contract(address, abi, adminWallet);
  return address;
}

export async function registerVoterOnChain(walletAddress) {
  init();
  const tx = await contract.registerVoter(walletAddress);
  const receipt = await tx.wait();
  return receipt.hash;
}

export async function isVoterRegistered(walletAddress) {
  init();
  return contract.isRegisteredVoter(walletAddress);
}

export async function hasVoterVoted(walletAddress) {
  init();
  return contract.hasVoted(walletAddress);
}

export async function getAdminBalance() {
  init();
  const balance = await provider.getBalance(adminWallet.address);
  return ethers.formatEther(balance);
}
