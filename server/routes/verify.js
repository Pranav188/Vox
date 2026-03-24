import { Router } from "express";
import { ethers } from "ethers";
import { findByAadhaar, findByWallet, isWalletLinked, linkWallet } from "../db.js";
import { registerVoterOnChain, isVoterRegistered } from "../lib/blockchain.js";

const router = Router();

// POST /api/verify - verify Aadhaar and register wallet as voter
router.post("/", async (req, res) => {
  try {
    const { aadhaarId, walletAddress } = req.body;

    if (!aadhaarId || !walletAddress) {
      return res.status(400).json({ message: "Aadhaar ID and wallet address are required" });
    }

    if (!/^\d{12}$/.test(aadhaarId)) {
      return res.status(400).json({ message: "Aadhaar ID must be exactly 12 digits" });
    }

    if (!ethers.isAddress(walletAddress)) {
      return res.status(400).json({ message: "Invalid Ethereum wallet address" });
    }

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
        aadhaarId: citizen.aadhaar_id,
        dateOfBirth: citizen.date_of_birth,
        gender: citizen.gender,
        district: citizen.district,
      },
    });
  } catch (err) {
    console.error("Verification error:", err);
    return res.status(500).json({ message: "Verification failed: " + err.message });
  }
});

// GET /api/verify/profile/:walletAddress - get citizen profile by linked wallet
router.get("/profile/:walletAddress", (req, res) => {
  try {
    const wallet = req.params.walletAddress.toLowerCase();
    const citizen = findByWallet(wallet);
    if (!citizen) {
      return res.status(404).json({ message: "No verified identity linked to this wallet" });
    }
    return res.json({
      fullName: citizen.full_name,
      aadhaarId: citizen.aadhaar_id,
      dateOfBirth: citizen.date_of_birth,
      gender: citizen.gender,
      district: citizen.district,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
