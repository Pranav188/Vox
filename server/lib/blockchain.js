import { ethers } from "ethers";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ARTIFACT_PATH = join(__dirname, "..", "..", "artifacts", "contracts", "Election.sol", "Election.json");

let provider;
let adminWallet;
let artifact;

function getArtifact() {
  if (!artifact) {
    artifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf-8"));
  }
  return artifact;
}

function ensureProvider() {
  if (!provider) {
    const rpcUrl = process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org";
    const privateKey = process.env.SEPOLIA_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("SEPOLIA_PRIVATE_KEY is not set in .env");
    }
    provider = new ethers.JsonRpcProvider(rpcUrl);
    adminWallet = new ethers.Wallet(privateKey, provider);
  }
}

// Get a contract instance for a specific address (no shared mutable state)
function getContract(contractAddress) {
  ensureProvider();
  const { abi } = getArtifact();
  return new ethers.Contract(contractAddress, abi, adminWallet);
}

// Get the default contract address from env
function getDefaultContractAddress() {
  const addr = process.env.VITE_ELECTION_CONTRACT_ADDRESS;
  if (!addr) throw new Error("VITE_ELECTION_CONTRACT_ADDRESS is not set");
  return addr;
}

export async function deployElection(electionName, candidates) {
  ensureProvider();
  const { abi, bytecode } = getArtifact();
  const factory = new ethers.ContractFactory(abi, bytecode, adminWallet);
  const deployed = await factory.deploy(electionName, candidates);
  await deployed.waitForDeployment();
  return await deployed.getAddress();
}

export async function registerVoterOnChain(walletAddress, contractAddress) {
  const contract = getContract(contractAddress || getDefaultContractAddress());
  const tx = await contract.registerVoter(walletAddress);
  const receipt = await tx.wait();
  return receipt.hash;
}

export async function isVoterRegistered(walletAddress, contractAddress) {
  const contract = getContract(contractAddress || getDefaultContractAddress());
  return contract.isRegisteredVoter(walletAddress);
}

export async function hasVoterVoted(walletAddress, contractAddress) {
  const contract = getContract(contractAddress || getDefaultContractAddress());
  return contract.hasVoted(walletAddress);
}

export async function getAdminBalance() {
  ensureProvider();
  const balance = await provider.getBalance(adminWallet.address);
  return ethers.formatEther(balance);
}
