import express from "express";
import { findPartners } from "../controllers/partnerController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/find-partner", requireAuth, findPartners);

export default router;
