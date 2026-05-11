import express from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { requireAuth } from "../lib/auth.js";
import { createRateLimiter } from "../lib/rate-limit.js";
import { searchAddressSuggestions } from "../services/address-autocomplete-service.js";

const router = express.Router();

const suggestLimiter = createRateLimiter({
  namespace: "address-autocomplete",
  windowMs: 60 * 1000,
  max: 40,
});

router.use(requireAuth);
router.use(suggestLimiter);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || "").trim();
    const items = await searchAddressSuggestions(q);
    const configured = Boolean(
      String(process.env.ADDRESS_AUTOCOMPLETE_PROVIDER || "").trim()
    );
    res.json({ suggestions: items, configured });
  })
);

export default router;
