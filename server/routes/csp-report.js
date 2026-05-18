import express from "express";

const router = express.Router();

router.post(
  "/",
  express.json({ type: ["application/json", "application/csp-report"] }),
  (req, res) => {
    const report = req.body?.["csp-report"] || req.body;
    if (report) {
      console.warn("[CSP]", JSON.stringify({
        blocked: report["blocked-uri"],
        directive: report["violated-directive"],
        source: report["source-file"],
        line: report["line-number"],
      }));
    }
    res.status(204).end();
  }
);

export default router;
