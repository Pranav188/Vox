import { Router } from "express";
import { ethers } from "ethers";
import { findByAadhaar, findByWallet, isWalletLinked, linkWallet } from "../db.js";
import { registerVoterOnChain, isVoterRegistered } from "../lib/blockchain.js";

const router = Router();

function maskAadhaar(aadhaarId) {
  return "XXXX XXXX " + aadhaarId.slice(-4);
}

// In-flight lock to prevent TOCTOU race between check and on-chain registration
const inFlightAadhaar = new Set();
const inFlightWallets = new Set();

// POST /api/verify - verify Aadhaar and register wallet as voter
router.post("/", async (req, res) => {
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
      return res.status(404).json({ message: "Citizen record not found in DigiLocker" });
    }

    if (citizen.registered_wallet) {
      return res.status(409).json({ message: "This Aadhaar has already been verified and linked to a wallet" });
    }

    if (isWalletLinked(walletAddress)) {
      return res.status(409).json({ message: "This wallet is already linked to another identity" });
    }

    const alreadyRegistered = await isVoterRegistered(walletAddress);
    if (alreadyRegistered) {
      return res.status(409).json({ message: "This wallet is already registered as a voter on-chain" });
    }

    const txHash = await registerVoterOnChain(walletAddress);
    linkWallet(aadhaarId, walletAddress);

    return res.json({
      success: true,
      txHash,
      message: `Welcome, ${citizen.full_name}! You are now a registered voter.`,
      citizen: {
        fullName: citizen.full_name,
        aadhaarId: maskAadhaar(citizen.aadhaar_id),
        district: citizen.district,
      },
    });
  } catch (err) {
    console.error("Verification error:", err.message || "unknown");
    return res.status(500).json({ message: "Verification failed. Please try again." });
  } finally {
    if (lockedAadhaar) inFlightAadhaar.delete(aadhaarId);
    if (lockedWallet) inFlightWallets.delete(walletAddress?.toLowerCase());
  }
});

// GET /api/verify/profile/:walletAddress - get citizen profile by linked wallet
router.get("/profile/:walletAddress", (req, res) => {
  try {
    if (!ethers.isAddress(req.params.walletAddress)) {
      return res.status(400).json({ message: "Invalid wallet address" });
    }
    const wallet = req.params.walletAddress.toLowerCase();
    const citizen = findByWallet(wallet);
    if (!citizen) {
      return res.status(404).json({ message: "No verified identity linked to this wallet" });
    }
    return res.json({
      fullName: citizen.full_name,
      aadhaarId: maskAadhaar(citizen.aadhaar_id),
      district: citizen.district,
    });
  } catch {
    res.status(500).json({ message: "Failed to fetch profile" });
  }
});

export default router;
