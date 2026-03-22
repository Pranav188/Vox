import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import verifyRouter from "./routes/verify.js";
import statusRouter from "./routes/status.js";
import adminRouter from "./routes/admin.js";
import { getLatestElection } from "./db.js";
import { setContractAddress } from "./lib/blockchain.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === "production";

// CORS: in dev allow Vite dev server, in production same-origin so not needed
if (!isProduction) {
  app.use(cors({ origin: "http://localhost:5173" }));
}

app.use(express.json());

// Rate limit the verify endpoint (costs gas on success)
const verifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { message: "Too many verification attempts. Please try again in a minute." },
});

app.use("/api/verify", verifyLimiter, verifyRouter);
app.use("/api/status", statusRouter);
app.use("/api/admin", adminRouter);

// Public endpoint: get latest election contract address
app.get("/api/elections/latest", (req, res) => {
  try {
    const network = req.query.network || "sepolia";
    const election = getLatestElection(network);
    if (!election) {
      return res.status(404).json({ message: "No elections found" });
    }
    const candidates = JSON.parse(election.candidates);
    // Point the blockchain module to this contract
    setContractAddress(election.contract_address);
    res.json({
      contractAddress: election.contract_address,
      electionName: election.election_name,
      candidates,
      createdAt: election.created_at,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// In production, serve the built frontend
if (isProduction) {
  const distPath = join(__dirname, "..", "dist");
  app.use(express.static(distPath));
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(join(distPath, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Vox server running on port ${PORT} (${isProduction ? "production" : "development"})`);
});
