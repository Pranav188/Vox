import { Router } from "express";
import { ethers } from "ethers";
import {
  insertCitizen,
  getAllCitizens,
  deleteCitizen,
  isAdmin,
  addAdmin,
  removeAdmin,
  getAllAdmins,
  insertElection,
  getLatestElection,
} from "../db.js";
import { deployElection, hasVoterVoted, setContractAddress } from "../lib/blockchain.js";

const router = Router();

// The deployer wallet is always a super-admin (derived from SEPOLIA_PRIVATE_KEY)
function getDeployerAddress() {
  const pk = process.env.SEPOLIA_PRIVATE_KEY;
  if (!pk) throw new Error("SEPOLIA_PRIVATE_KEY not set");
  return new ethers.Wallet(pk).address.toLowerCase();
}

// Auth middleware: verify wallet signature
// Frontend signs the string "vox-admin-{timestamp}" with MetaMask
// Sends: x-admin-signature header + x-admin-message header
function requireAdmin(req, res, next) {
  try {
    const signature = req.headers["x-admin-signature"];
    const message = req.headers["x-admin-message"];

    if (!signature || !message) {
      return res.status(401).json({ message: "Missing admin signature. Sign in with your admin wallet." });
    }

    // Verify message is recent (within 5 minutes)
    const match = message.match(/^vox-admin-(\d+)$/);
    if (!match) {
      return res.status(401).json({ message: "Invalid signature message format" });
    }
    const timestamp = parseInt(match[1], 10);
    const now = Date.now();
    if (Math.abs(now - timestamp) > 5 * 60 * 1000) {
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
  } catch (err) {
    return res.status(401).json({ message: "Signature verification failed: " + err.message });
  }
}

// --- Public endpoints (no auth) ---

// GET /api/admin/check/:walletAddress - check if a wallet is admin
router.get("/check/:walletAddress", (req, res) => {
  try {
    const wallet = req.params.walletAddress.toLowerCase();
    const deployerAddress = getDeployerAddress();
    const isDeployer = wallet === deployerAddress;
    const isAppointedAdmin = isAdmin(wallet);
    res.json({
      isAdmin: isDeployer || isAppointedAdmin,
      isDeployer,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// --- Citizen management (any admin) ---

// GET /api/admin/citizens - list all citizens
router.get("/citizens", requireAdmin, (_req, res) => {
  try {
    const citizens = getAllCitizens();
    res.json({ citizens });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/admin/citizens/:aadhaarId - remove an unverified citizen
router.delete("/citizens/:aadhaarId", requireAdmin, (req, res) => {
  try {
    const result = deleteCitizen(req.params.aadhaarId);
    if (result.changes === 0) {
      return res.status(404).json({ message: "Citizen not found or already verified (cannot delete verified citizens)" });
    }
    res.json({ success: true, message: "Citizen removed from DigiLocker" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// --- Admin management (deployer only) ---

// GET /api/admin/admins - list appointed admins
router.get("/admins", requireAdmin, (_req, res) => {
  try {
    const admins = getAllAdmins();
    const deployerAddress = getDeployerAddress();
    res.json({ admins, deployerAddress });
  } catch (err) {
    res.status(500).json({ message: err.message });
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

    const deployerAddress = getDeployerAddress();
    if (walletAddress.toLowerCase() === deployerAddress) {
      return res.status(400).json({ message: "The deployer is always an admin and does not need to be appointed" });
    }

    // Check if the wallet has already voted
    try {
      const voted = await hasVoterVoted(walletAddress);
      if (voted) {
        return res.status(400).json({ message: "This wallet has already voted and cannot be appointed as admin" });
      }
    } catch {
      // If the check fails (e.g. contract not reachable), allow the appointment
    }

    addAdmin(walletAddress, label || "", req.adminAddress);
    res.json({ success: true, message: `${label || walletAddress} appointed as admin` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/admin/admins/:walletAddress - remove an admin (deployer only)
router.delete("/admins/:walletAddress", requireAdmin, (req, res) => {
  try {
    if (!req.isDeployer) {
      return res.status(403).json({ message: "Only the deployer wallet can remove admins" });
    }

    const result = removeAdmin(req.params.walletAddress);
    if (result.changes === 0) {
      return res.status(404).json({ message: "Admin not found" });
    }
    res.json({ success: true, message: "Admin removed" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// --- Election management (deployer only) ---

// POST /api/admin/elections - create a new election (deployer only)
router.post("/elections", requireAdmin, async (req, res) => {
  try {
    if (!req.isDeployer) {
      return res.status(403).json({ message: "Only the deployer wallet can create elections" });
    }

    const { electionName, candidates } = req.body;

    if (!electionName || !electionName.trim()) {
      return res.status(400).json({ message: "Election name is required" });
    }

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return res.status(400).json({ message: "At least one candidate is required" });
    }

    const cleanCandidates = candidates.map((c) => (typeof c === "string" ? c.trim() : "")).filter(Boolean);
    if (cleanCandidates.length === 0) {
      return res.status(400).json({ message: "Candidate names cannot be empty" });
    }

    const contractAddress = await deployElection(electionName.trim(), cleanCandidates);

    insertElection({
      contract_address: contractAddress,
      election_name: electionName.trim(),
      candidates: cleanCandidates,
      network: "sepolia",
      created_by: req.adminAddress,
    });

    res.json({
      success: true,
      contractAddress,
      electionName: electionName.trim(),
      candidates: cleanCandidates,
      message: `Election "${electionName.trim()}" deployed to ${contractAddress}`,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to deploy election: " + err.message });
  }
});

export default router;
