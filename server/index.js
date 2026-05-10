import express from "express";
import cors from "cors";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { serverConfig } from "./config.js";
import authRoutes from "./routes/auth.js";
import accountRoutes from "./routes/account.js";
import entityRoutes from "./routes/entities.js";
import userRoutes from "./routes/users.js";
import fileRoutes from "./routes/files.js";
import aiRoutes from "./routes/ai.js";
import emailRoutes from "./routes/email.js";
import businessNotificationRoutes from "./routes/business-notifications.js";
import functionRoutes from "./routes/functions.js";
import publicAppRoutes from "./routes/public-app.js";
import organizationRoutes from "./routes/organizations.js";
import billingRoutes, { stripeWebhookHandler } from "./routes/billing.js";
import purchaseOrderRoutes from "./routes/purchase-orders.js";
import { ensureSaasBootstrap } from "./lib/auth.js";
import { initializeStoreBackend } from "./lib/json-store.js";
import { bootstrapOrganizationSubscriptions } from "./services/billing-service.js";
import { createRateLimiter } from "./lib/rate-limit.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const authRateLimiter = createRateLimiter({
  namespace: "auth",
  windowMs: 15 * 60 * 1000,
  max: 80,
});

const aiRateLimiter = createRateLimiter({
  namespace: "ai",
  windowMs: 60 * 1000,
  max: 30,
});

const ensureRuntimeDirs = async () => {
  await fs.mkdir(serverConfig.dataDir, { recursive: true });
  await fs.mkdir(serverConfig.publicUploadsDir, { recursive: true });
  await fs.mkdir(serverConfig.privateUploadsDir, { recursive: true });
};

const createCorsForbiddenError = () => {
  const error = new Error("Origin is not allowed by CORS policy.");
  error.status = 403;
  return error;
};

const corsOptions = serverConfig.isProduction
  ? {
      origin(origin, callback) {
        if (!origin || serverConfig.allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(createCorsForbiddenError());
      },
    }
  : undefined;

app.use(cors(corsOptions));
app.use((req, res, next) => {
  if (!serverConfig.isProduction || !req.headers.origin) {
    next();
    return;
  }

  if (!serverConfig.allowedOrigins.includes(req.headers.origin)) {
    return res.status(403).json({ message: "Origin is not allowed by CORS policy." });
  }

  next();
});

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=()"
  );
  if (serverConfig.isProduction) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=15552000; includeSubDomains"
    );
  }
  next();
});

app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads/public", express.static(serverConfig.publicUploadsDir));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    provider: "rest",
    appId: serverConfig.appId,
  });
});

app.use("/api/apps/public", publicAppRoutes);
app.use("/api/auth", authRateLimiter, authRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/entities", entityRoutes);
app.use("/api/users", userRoutes);
app.use("/api/organizations", organizationRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/ai", aiRateLimiter, aiRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/business", businessNotificationRoutes);
app.use("/api/functions", functionRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/purchase-orders", purchaseOrderRoutes);

app.use((error, _req, res, _next) => {
  const status =
    error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
      ? 413
      : error.status || 500;
  const message =
    error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
      ? `File exceeds the maximum allowed size of ${serverConfig.uploadMaxFileSizeMb} MB`
      : error.message || "Unexpected server error";
  const payload = {
    message,
    ...(error.data ? { extra_data: error.data } : {}),
  };

  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json(payload);
});

await ensureRuntimeDirs();
await initializeStoreBackend();
await ensureSaasBootstrap();
await bootstrapOrganizationSubscriptions();

app.listen(serverConfig.port, serverConfig.host, () => {
  console.log(
    `[server] REST scaffold running at http://${serverConfig.host}:${serverConfig.port}`
  );
});
