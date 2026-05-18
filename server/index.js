import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
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
import addressAutocompleteRoutes from "./routes/address-autocomplete.js";
import billingRoutes, { stripeWebhookHandler } from "./routes/billing.js";
import purchaseOrderRoutes from "./routes/purchase-orders.js";
import cspReportRoutes from "./routes/csp-report.js";
import backupRoutes from "./routes/backups.js";
import breakdownRoutes from "./routes/breakdowns.js";
import { ensureSaasBootstrap } from "./lib/auth.js";
import { initializeStoreBackend } from "./lib/json-store.js";
import { bootstrapOrganizationSubscriptions } from "./services/billing-service.js";
import { startVerifactuRetryScheduler } from "./services/verifactu-service.js";
import { createRateLimiter } from "./lib/rate-limit.js";
import { createSecurityHeadersMiddleware } from "./lib/security-headers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

if (serverConfig.trustProxy !== false) {
  app.set("trust proxy", serverConfig.trustProxy);
}

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
  const error = new Error(
    "Este origen no está permitido por la política de la aplicación. Si usas un dominio distinto para la web y la API, revisa APP_ALLOWED_ORIGINS."
  );
  error.status = 403;
  return error;
};

/** Permite peticiones cuyo Origin coincide con el host público de esta API (p. ej. HTML de /api/auth/accept-invite). */
const productionOriginIsAllowed = (req, origin) => {
  if (!serverConfig.isProduction) {
    return true;
  }
  if (!origin) {
    return true;
  }
  if (serverConfig.allowedOrigins.includes(origin)) {
    return true;
  }
  try {
    const url = new URL(origin);
    const forwarded = String(req.headers["x-forwarded-host"] || req.headers.host || "");
    const requestHost = forwarded.split(",")[0].trim().split(":")[0].toLowerCase();
    const originHost = url.hostname.toLowerCase();
    return Boolean(requestHost && originHost === requestHost);
  } catch {
    return false;
  }
};

const sendProductionOriginRejected = (req, res) => {
  const message =
    "Este origen no está permitido por la política de la aplicación. Si usas un dominio distinto para la web y la API, revisa APP_ALLOWED_ORIGINS.";
  const wantsHtml =
    String(req.headers.accept || "").includes("text/html") ||
    String(req.headers["content-type"] || "").includes("application/x-www-form-urlencoded");

  if (wantsHtml) {
    return res.status(403).type("html").send(`<!doctype html>
<html lang="es"><head><meta charset="UTF-8"/><title>Acceso denegado</title></head>
<body style="font-family:system-ui,sans-serif;padding:24px;max-width:520px;margin:40px auto;">
<p style="font-size:16px;line-height:1.6">${message}</p>
</body></html>`);
  }

  return res.status(403).json({ message });
};

if (serverConfig.isProduction) {
  app.use((req, res, next) => {
    cors({
      credentials: true,
      origin(origin, callback) {
        if (productionOriginIsAllowed(req, origin)) {
          callback(null, true);
          return;
        }
        callback(createCorsForbiddenError());
      },
    })(req, res, next);
  });
} else {
  app.use(cors({ credentials: true, origin: true }));
}

app.use(cookieParser());

app.use((req, res, next) => {
  if (!serverConfig.isProduction) {
    next();
    return;
  }

  const origin = req.headers.origin;
  if (!origin) {
    next();
    return;
  }

  if (productionOriginIsAllowed(req, origin)) {
    next();
    return;
  }

  return sendProductionOriginRejected(req, res);
});

app.use(
  createSecurityHeadersMiddleware({
    isProduction: serverConfig.isProduction,
  })
);

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
app.use("/api/address-autocomplete", addressAutocompleteRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/ai", aiRateLimiter, aiRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/business", businessNotificationRoutes);
app.use("/api/functions", functionRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/purchase-orders", purchaseOrderRoutes);
app.use("/api/csp-report", cspReportRoutes);
app.use("/api/backups", backupRoutes);
app.use("/api/breakdowns", breakdownRoutes);

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
  // Start Verifactu retry scheduler in production (retries pending AEAT submissions every 60s)
  if (serverConfig.isProduction) {
    startVerifactuRetryScheduler();
    console.log("[verifactu] Retry scheduler started (interval: 60s)");
  }
});
