import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import verifyRouter from "./routes/verify.js";
import statusRouter from "./routes/status.js";
import adminRouter from "./routes/admin.js";

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
