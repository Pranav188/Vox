import { Router } from "express";
import { getAdminBalance } from "../lib/blockchain.js";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const adminBalance = await getAdminBalance();
    res.json({
      ok: true,
      network: "sepolia",
      contract: process.env.VITE_ELECTION_CONTRACT_ADDRESS || "0xa78C18A821150b2077f06BB8F19C0dB44fd5AD35",
      adminBalance,
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

export default router;
