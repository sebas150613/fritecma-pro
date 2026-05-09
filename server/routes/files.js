import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { asyncHandler } from "../lib/async-handler.js";
import { canAccessHiddenUsers, requireAuth } from "../lib/auth.js";
import { HttpError } from "../lib/http-error.js";
import { serverConfig } from "../config.js";

const SAFE_EXTENSION_PATTERN = /^\.[a-z0-9]{1,12}$/i;

const getSafeExtension = (originalName = "") => {
  const extension = path.extname(String(originalName)).toLowerCase();
  return SAFE_EXTENSION_PATTERN.test(extension) ? extension : "";
};

const resolveUploadPath = (fileUri) => {
  const normalized = normalizeFileUri(fileUri);
  const uploadsRoot = path.resolve(serverConfig.uploadsDir);
  const absolutePath = path.resolve(uploadsRoot, normalized);
  const relativePath = path.relative(uploadsRoot, absolutePath);

  if (!normalized || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new HttpError(400, "Invalid file_uri");
  }

  return absolutePath;
};

const createStorage = (scopeName, getDir) =>
  multer.diskStorage({
    destination: async (req, _file, cb) => {
      try {
        const targetDir = getDir(req);
        await fs.mkdir(targetDir, { recursive: true });
        cb(null, targetDir);
      } catch (error) {
        cb(error);
      }
    },
    filename: (_req, file, cb) => {
      const extension = getSafeExtension(file.originalname);
      cb(null, `${randomUUID()}${extension}`);
      void scopeName;
    },
  });

const uploadLimits = {
  fileSize: serverConfig.uploadMaxFileSizeBytes,
};
const publicUpload = multer({
  storage: createStorage("public", (req) =>
    path.join(serverConfig.publicUploadsDir, req.currentOrganization.id)
  ),
  limits: uploadLimits,
});
const privateUpload = multer({
  storage: createStorage("private", (req) =>
    path.join(serverConfig.privateUploadsDir, req.currentOrganization.id)
  ),
  limits: uploadLimits,
});
const router = express.Router();

const getBaseOrigin = (req) => `${req.protocol}://${req.get("host")}`;

const normalizeFileUri = (value = "") => String(value).replace(/^\/+/, "");

const assertFileAccess = (req, fileUri) => {
  const normalized = normalizeFileUri(fileUri);

  if (!normalized) {
    throw new HttpError(400, "file_uri is required");
  }

  resolveUploadPath(normalized);

  if (canAccessHiddenUsers(req.currentUser)) {
    return normalized;
  }

  const publicPrefix = `public/${req.currentOrganization.id}/`;
  const privatePrefix = `private/${req.currentOrganization.id}/`;

  if (
    normalized.startsWith(publicPrefix) ||
    normalized.startsWith(privatePrefix)
  ) {
    return normalized;
  }

  throw new HttpError(403, "Forbidden");
};

const buildPublicFileUrl = (req, fileUri) =>
  `${getBaseOrigin(req)}/uploads/${normalizeFileUri(fileUri)}`;

const buildFilePayload = (req, scopeName, file) => {
  const fileUri = `${scopeName}/${req.currentOrganization.id}/${file.filename}`;
  return {
    file_url: scopeName === "public" ? buildPublicFileUrl(req, fileUri) : null,
    file_uri: fileUri,
    original_name: file.originalname,
    mime_type: file.mimetype,
    size: file.size,
  };
};

router.use(requireAuth);

router.post(
  "/public",
  publicUpload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new HttpError(400, "Missing file");
    }

    res.status(201).json(buildFilePayload(req, "public", req.file));
  })
);

router.post(
  "/private",
  privateUpload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new HttpError(400, "Missing file");
    }

    res.status(201).json(buildFilePayload(req, "private", req.file));
  })
);

router.get(
  "/access",
  asyncHandler(async (req, res) => {
    const normalized = assertFileAccess(req, req.query.file_uri?.toString());
    const absolutePath = resolveUploadPath(normalized);

    await fs.access(absolutePath);
    res.sendFile(absolutePath);
  })
);

router.post(
  "/signed-url",
  asyncHandler(async (req, res) => {
    const normalized = assertFileAccess(req, req.body?.file_uri);
    const absolutePath = resolveUploadPath(normalized);

    await fs.access(absolutePath);

    if (normalized.startsWith("public/")) {
      const publicUrl = buildPublicFileUrl(req, normalized);
      return res.json({
        signed_url: publicUrl,
        file_url: publicUrl,
        file_uri: normalized,
      });
    }

    const signedUrl = `${getBaseOrigin(req)}/api/files/access?file_uri=${encodeURIComponent(
      normalized
    )}`;

    res.json({
      signed_url: signedUrl,
      file_url: signedUrl,
      file_uri: normalized,
    });
  })
);

export default router;
