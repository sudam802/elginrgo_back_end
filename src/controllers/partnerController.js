import { getPartners } from "../services/partnerService.js";

export const findPartners = async (req, res) => {
  try {
    const userId = req.session?.userId; // make sure session is set
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    console.log("✅ Route hit! Finding partners for user:", userId);

    const partners = await getPartners(userId);
    console.log("✅ Partners found:", partners);
    res.json({ partners });
  } catch (err) {
    console.error("❌ Error in findPartners:", err);
    res.status(500).json({ error: err.message });
  }
};
