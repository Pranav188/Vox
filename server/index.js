import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import verifyRouter from "./routes/verify.js";
import statusRouter from "./routes/status.js";
import adminRouter from "./routes/admin.js";
import { getLatestElection } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const VALID_NETWORKS = ["sepolia", "localhost"];

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === "production";

// Trust first proxy (nginx/ALB) so rate limiting uses real client IP
if (isProduction) {
  app.set("trust proxy", 1);
}

// Redirect HTTP to HTTPS in production
if (isProduction) {
  app.use((req, res, next) => {
    if (req.headers["x-forwarded-proto"] !== "https") {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// Security headers
app.use(helmet({
  contentSecurityPolicy: isProduction ? undefined : false,
}));

// CORS
if (isProduction) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "https://vox2026.duckdns.org";
  app.use(cors({ origin: allowedOrigin }));
} else {
  app.use(cors({ origin: "http://localhost:5173" }));
}

// Body size limit
app.use(express.json({ limit: "16kb" }));

// Rate limiters
const verifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { message: "Too many verification attempts. Please try again in a minute." },
});

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { message: "Too many admin requests. Please try again in a minute." },
});

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { message: "Too many requests. Please try again in a minute." },
});

app.use("/api/verify", verifyLimiter, verifyRouter);
app.use("/api/status", publicLimiter, statusRouter);
app.use("/api/admin", adminLimiter, adminRouter);

// Public endpoint: get latest election contract address
app.get("/api/elections/latest", publicLimiter, (req, res) => {
  try {
    const network = req.query.network || "sepolia";
    if (!VALID_NETWORKS.includes(network)) {
      return res.status(400).json({ message: "Invalid network. Must be one of: " + VALID_NETWORKS.join(", ") });
    }
    const election = getLatestElection(network);
    if (!election) {
      return res.status(404).json({ message: "No elections found" });
    }
    const candidates = JSON.parse(election.candidates);
    res.json({
      contractAddress: election.contract_address,
      electionName: election.election_name,
      candidates,
      createdAt: election.created_at,
    });
  } catch {
    res.status(500).json({ message: "Failed to fetch election data" });
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
