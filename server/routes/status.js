import { Router } from "express";
import { getAdminBalance } from "../lib/blockchain.js";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const adminBalance = await getAdminBalance();
    res.json({
      ok: true,
      network: "sepolia",
      contract: process.env.VITE_ELECTION_CONTRACT_ADDRESS || "not configured",
      adminBalance,
    });
  } catch {
    res.status(500).json({ ok: false, message: "Failed to fetch status" });
  }
});

export default router;
