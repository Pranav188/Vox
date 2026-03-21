import { Router } from "express";
import { ethers } from "ethers";
import { findByAadhaar, isWalletLinked, linkWallet } from "../db.js";
import { registerVoterOnChain, isVoterRegistered } from "../lib/blockchain.js";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const { aadhaarId, fullName, dateOfBirth, walletAddress } = req.body;

    // Validate required fields
    if (!aadhaarId || !fullName || !dateOfBirth || !walletAddress) {
      return res.status(400).json({ message: "All fields are required: aadhaarId, fullName, dateOfBirth, walletAddress" });
    }

    // Validate aadhaar format (12 digits)
    if (!/^\d{12}$/.test(aadhaarId)) {
      return res.status(400).json({ message: "Aadhaar ID must be exactly 12 digits" });
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      return res.status(400).json({ message: "Date of birth must be in YYYY-MM-DD format" });
    }

    // Validate wallet address
    if (!ethers.isAddress(walletAddress)) {
      return res.status(400).json({ message: "Invalid Ethereum wallet address" });
    }

    // Look up citizen in database
    const citizen = findByAadhaar(aadhaarId);
    if (!citizen) {
      return res.status(404).json({ message: "Citizen record not found in DigiLocker" });
    }

    // Verify identity details match
    if (citizen.full_name.trim().toLowerCase() !== fullName.trim().toLowerCase()) {
      return res.status(400).json({ message: "Identity details do not match our records" });
    }

    if (citizen.date_of_birth !== dateOfBirth) {
      return res.status(400).json({ message: "Identity details do not match our records" });
    }

    // Check if citizen already verified
    if (citizen.registered_wallet) {
      return res.status(409).json({ message: "This identity has already been verified and linked to a wallet" });
    }

    // Check if wallet already linked to another citizen
    if (isWalletLinked(walletAddress)) {
      return res.status(409).json({ message: "This wallet is already linked to another identity" });
    }

    // Check on-chain if already registered
    const alreadyRegistered = await isVoterRegistered(walletAddress);
    if (alreadyRegistered) {
      return res.status(409).json({ message: "This wallet is already registered as a voter on-chain" });
    }

    // Register on-chain
    const txHash = await registerVoterOnChain(walletAddress);

    // Update database
    linkWallet(aadhaarId, walletAddress);

    return res.json({
      success: true,
      txHash,
      message: "Identity verified. You are now a registered voter.",
    });
  } catch (err) {
    console.error("Verification error:", err);
    return res.status(500).json({ message: "Verification failed: " + err.message });
  }
});

export default router;
