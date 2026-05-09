import express from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { requireAuth } from "../lib/auth.js";
import { invokeAi } from "../services/ai-service.js";

const router = express.Router();

router.use(requireAuth);

router.post(
  "/invoke",
  asyncHandler(async (req, res) => {
    const result = await invokeAi(req.body || {});
    res.json(result);
  })
);

export default router;
