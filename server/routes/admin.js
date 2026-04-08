import { Router } from "express";
import { ethers } from "ethers";
import {
  insertCitizen,
  getAllCitizens,
  deleteCitizen,
  findByAadhaar,
  isWalletLinked,
  linkWallet,
  isAdmin,
  addAdmin,
  removeAdmin,
  getAllAdmins,
  insertElection,
} from "../db.js";
import { deployElection, hasVoterVoted, registerVoterOnChain, isVoterRegistered } from "../lib/blockchain.js";

const router = Router();

const MAX_CANDIDATES = 50;
const MAX_NAME_LENGTH = 200;
const MAX_LABEL_LENGTH = 100;
const VALID_GENDERS = ["Male", "Female", "Other"];

// In-flight lock to prevent TOCTOU race on admin register-voter
const inFlightAadhaar = new Set();
const inFlightWallets = new Set();

// The deployer wallet is always a super-admin (derived from SEPOLIA_PRIVATE_KEY)
function getDeployerAddress() {
  const pk = process.env.SEPOLIA_PRIVATE_KEY;
  if (!pk) throw new Error("SEPOLIA_PRIVATE_KEY not set");
  return new ethers.Wallet(pk).address.toLowerCase();
}

// Auth middleware: verify wallet signature
function requireAdmin(req, res, next) {
  try {
    const signature = req.headers["x-admin-signature"];
    const message = req.headers["x-admin-message"];

    if (!signature || !message) {
      return res.status(401).json({ message: "Missing admin signature. Sign in with your admin wallet." });
    }

    // Verify message is recent (within 2 minutes)
    const match = message.match(/^vox-admin-(\d+)$/);
    if (!match) {
      return res.status(401).json({ message: "Invalid signature message format" });
    }
    const timestamp = parseInt(match[1], 10);
    const now = Date.now();
    if (Math.abs(now - timestamp) > 2 * 60 * 1000) {
      return res.status(401).json({ message: "Signature expired. Please sign in again." });
    }

    // Recover signer address
    const signer = ethers.verifyMessage(message, signature).toLowerCase();

    // Check if signer is the deployer or an appointed admin
    const deployerAddress = getDeployerAddress();
    if (signer !== deployerAddress && !isAdmin(signer)) {
      return res.status(403).json({ message: "This wallet is not authorized as an admin" });
    }

    req.adminAddress = signer;
    req.isDeployer = signer === deployerAddress;
    next();
  } catch {
    return res.status(401).json({ message: "Signature verification failed" });
  }
}

// --- Public endpoints (no auth) ---

// GET /api/admin/check/:walletAddress - check if a wallet is admin
router.get("/check/:walletAddress", (req, res) => {
  try {
    if (!ethers.isAddress(req.params.walletAddress)) {
      return res.status(400).json({ message: "Invalid wallet address" });
    }
    const wallet = req.params.walletAddress.toLowerCase();
    const deployerAddress = getDeployerAddress();
    const isDeployer = wallet === deployerAddress;
    const isAppointedAdmin = isAdmin(wallet);
    res.json({
      isAdmin: isDeployer || isAppointedAdmin,
      isDeployer,
    });
  } catch {
    res.status(500).json({ message: "Failed to check admin status" });
  }
});

// --- Citizen management (any admin) ---

// GET /api/admin/citizens - list all citizens
router.get("/citizens", requireAdmin, (_req, res) => {
  try {
    const citizens = getAllCitizens();
    res.json({ citizens });
  } catch {
    res.status(500).json({ message: "Failed to fetch citizens" });
  }
});

// POST /api/admin/citizens - add a citizen
router.post("/citizens", requireAdmin, (req, res) => {
  try {
    const { aadhaarId, fullName, dateOfBirth, gender, district } = req.body;

    if (!aadhaarId || !fullName || !dateOfBirth || !gender || !district) {
      return res.status(400).json({ message: "All fields required: aadhaarId, fullName, dateOfBirth, gender, district" });
    }

    if (!/^\d{12}$/.test(aadhaarId)) {
      return res.status(400).json({ message: "Aadhaar ID must be exactly 12 digits" });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      return res.status(400).json({ message: "Date of birth must be in YYYY-MM-DD format" });
    }

    if (fullName.length > MAX_NAME_LENGTH) {
      return res.status(400).json({ message: `Full name must be under ${MAX_NAME_LENGTH} characters` });
    }

    if (district.length > MAX_NAME_LENGTH) {
      return res.status(400).json({ message: `District must be under ${MAX_NAME_LENGTH} characters` });
    }

    if (!VALID_GENDERS.includes(gender)) {
      return res.status(400).json({ message: `Gender must be one of: ${VALID_GENDERS.join(", ")}` });
    }

    insertCitizen({
      aadhaar_id: aadhaarId,
      full_name: fullName,
      date_of_birth: dateOfBirth,
      gender,
      district,
    });

    res.json({ success: true, message: `Citizen ${fullName} added to DigiLocker` });
  } catch (err) {
    if (err.message.includes("UNIQUE constraint")) {
      return res.status(409).json({ message: "A citizen with this Aadhaar ID already exists" });
    }
    res.status(500).json({ message: "Failed to add citizen" });
  }
});

// DELETE /api/admin/citizens/:aadhaarId - remove an unverified citizen
router.delete("/citizens/:aadhaarId", requireAdmin, (req, res) => {
  try {
    if (!/^\d{12}$/.test(req.params.aadhaarId)) {
      return res.status(400).json({ message: "Aadhaar ID must be exactly 12 digits" });
    }
    const result = deleteCitizen(req.params.aadhaarId);
    if (result.changes === 0) {
      return res.status(404).json({ message: "Citizen not found or already verified (cannot delete verified citizens)" });
    }
    res.json({ success: true, message: "Citizen removed from DigiLocker" });
  } catch {
    res.status(500).json({ message: "Failed to delete citizen" });
  }
});

// POST /api/admin/register-voter - register a voter by Aadhaar (admin enters Aadhaar + wallet)
router.post("/register-voter", requireAdmin, async (req, res) => {
  const { aadhaarId, walletAddress } = req.body;
  let lockedAadhaar = false;
  let lockedWallet = false;

  try {
    if (!aadhaarId || !walletAddress) {
      return res.status(400).json({ message: "Aadhaar ID and wallet address are required" });
    }

    if (!/^\d{12}$/.test(aadhaarId)) {
      return res.status(400).json({ message: "Aadhaar ID must be exactly 12 digits" });
    }

    if (!ethers.isAddress(walletAddress)) {
      return res.status(400).json({ message: "Invalid Ethereum wallet address" });
    }

    const walletLower = walletAddress.toLowerCase();

    // Acquire in-flight locks
    if (inFlightAadhaar.has(aadhaarId)) {
      return res.status(409).json({ message: "Registration already in progress for this Aadhaar" });
    }
    if (inFlightWallets.has(walletLower)) {
      return res.status(409).json({ message: "Registration already in progress for this wallet" });
    }
    inFlightAadhaar.add(aadhaarId);
    lockedAadhaar = true;
    inFlightWallets.add(walletLower);
    lockedWallet = true;

    const citizen = findByAadhaar(aadhaarId);
    if (!citizen) {
      return res.status(404).json({ message: "Citizen not found in DigiLocker database" });
    }

    if (citizen.registered_wallet) {
      return res.status(409).json({ message: `This Aadhaar is already linked to wallet ${citizen.registered_wallet.slice(0, 8)}...` });
    }

    if (isWalletLinked(walletAddress)) {
      return res.status(409).json({ message: "This wallet is already linked to another citizen" });
    }

    const alreadyRegistered = await isVoterRegistered(walletAddress);
    if (alreadyRegistered) {
      return res.status(409).json({ message: "This wallet is already registered as a voter on-chain" });
    }

    const txHash = await registerVoterOnChain(walletAddress);
    linkWallet(aadhaarId, walletAddress);

    res.json({
      success: true,
      txHash,
      message: `${citizen.full_name} registered as voter (${walletAddress.slice(0, 8)}...)`,
    });
  } catch {
    res.status(500).json({ message: "Registration failed. Please try again." });
  } finally {
    if (lockedAadhaar) inFlightAadhaar.delete(aadhaarId);
    if (lockedWallet) inFlightWallets.delete(walletAddress?.toLowerCase());
  }
});

// --- Admin management (deployer only) ---

// GET /api/admin/admins - list appointed admins
router.get("/admins", requireAdmin, (_req, res) => {
  try {
    const admins = getAllAdmins();
    const deployerAddress = getDeployerAddress();
    res.json({ admins, deployerAddress });
  } catch {
    res.status(500).json({ message: "Failed to fetch admins" });
  }
});

// POST /api/admin/admins - appoint a new admin (deployer only)
router.post("/admins", requireAdmin, async (req, res) => {
  try {
    if (!req.isDeployer) {
      return res.status(403).json({ message: "Only the deployer wallet can appoint new admins" });
    }

    const { walletAddress, label } = req.body;

    if (!walletAddress) {
      return res.status(400).json({ message: "walletAddress is required" });
    }

    if (!ethers.isAddress(walletAddress)) {
      return res.status(400).json({ message: "Invalid Ethereum wallet address" });
    }

    if (label && label.length > MAX_LABEL_LENGTH) {
      return res.status(400).json({ message: `Label must be under ${MAX_LABEL_LENGTH} characters` });
    }

    const deployerAddress = getDeployerAddress();
    if (walletAddress.toLowerCase() === deployerAddress) {
      return res.status(400).json({ message: "The deployer is always an admin and does not need to be appointed" });
    }

    // Fail closed: if we can't verify voter status, reject the appointment
    try {
      const voted = await hasVoterVoted(walletAddress);
      if (voted) {
        return res.status(400).json({ message: "This wallet has already voted and cannot be appointed as admin" });
      }
    } catch {
      return res.status(503).json({ message: "Cannot verify voter status right now. Try again later." });
    }

    addAdmin(walletAddress, label || "", req.adminAddress);
    res.json({ success: true, message: `${label || walletAddress} appointed as admin` });
  } catch {
    res.status(500).json({ message: "Failed to appoint admin" });
  }
});

// DELETE /api/admin/admins/:walletAddress - remove an admin (deployer only)
router.delete("/admins/:walletAddress", requireAdmin, (req, res) => {
  try {
    if (!req.isDeployer) {
      return res.status(403).json({ message: "Only the deployer wallet can remove admins" });
    }

    if (!ethers.isAddress(req.params.walletAddress)) {
      return res.status(400).json({ message: "Invalid wallet address" });
    }
    const result = removeAdmin(req.params.walletAddress);
    if (result.changes === 0) {
      return res.status(404).json({ message: "Admin not found" });
    }
    res.json({ success: true, message: "Admin removed" });
  } catch {
    res.status(500).json({ message: "Failed to remove admin" });
  }
});

// --- Election management (deployer only) ---

// POST /api/admin/elections - create a new election (deployer only)
router.post("/elections", requireAdmin, async (req, res) => {
  try {
    if (!req.isDeployer) {
      return res.status(403).json({ message: "Only the deployer wallet can create elections" });
    }

    const { electionName, candidates, network: clientNetwork } = req.body;
    const VALID_NETWORKS = ["sepolia", "localhost"];
    const network = VALID_NETWORKS.includes(clientNetwork) ? clientNetwork : (process.env.VITE_ELECTION_NETWORK || "sepolia");

    if (!electionName || !electionName.trim()) {
      return res.status(400).json({ message: "Election name is required" });
    }

    if (electionName.trim().length > MAX_NAME_LENGTH) {
      return res.status(400).json({ message: `Election name must be under ${MAX_NAME_LENGTH} characters` });
    }

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return res.status(400).json({ message: "At least one candidate is required" });
    }

    if (candidates.length > MAX_CANDIDATES) {
      return res.status(400).json({ message: `Maximum ${MAX_CANDIDATES} candidates allowed` });
    }

    const cleanCandidates = candidates
      .map((c) => (typeof c === "string" ? c.trim() : ""))
      .filter(Boolean);

    if (cleanCandidates.length === 0) {
      return res.status(400).json({ message: "Candidate names cannot be empty" });
    }

    if (cleanCandidates.some((c) => c.length > MAX_NAME_LENGTH)) {
      return res.status(400).json({ message: `Candidate names must be under ${MAX_NAME_LENGTH} characters` });
    }

    const uniqueNames = new Set(cleanCandidates.map((c) => c.toLowerCase()));
    if (uniqueNames.size !== cleanCandidates.length) {
      return res.status(400).json({ message: "Duplicate candidate names are not allowed" });
    }

    const contractAddress = await deployElection(electionName.trim(), cleanCandidates);

    insertElection({
      contract_address: contractAddress,
      election_name: electionName.trim(),
      candidates: cleanCandidates,
      network,
      created_by: req.adminAddress,
    });

    res.json({
      success: true,
      contractAddress,
      electionName: electionName.trim(),
      candidates: cleanCandidates,
      message: `Election "${electionName.trim()}" deployed to ${contractAddress}`,
    });
  } catch {
    res.status(500).json({ message: "Failed to deploy election. Check admin wallet balance and try again." });
  }
});

export default router;
