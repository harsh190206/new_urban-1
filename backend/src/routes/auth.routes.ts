import { Router } from "express";
import {
  registerUser,
  loginUser,
} from "../controllers/auth/user.auth.controller.ts";
import {
  registerAdmin,
  loginAdmin,
} from "../controllers/auth/admin.auth.controller.ts";
import {
  registerAgent,
  loginAgent,
} from "../controllers/auth/agent.auth.controller.ts";
import { checkPhoneAvailability } from "../controllers/auth/phone.controller.ts";
import { prisma } from "../../db/index.ts";
import { upload } from "../middleware/upload.middleware.ts";

const router = Router();

// Public: active cities list (no auth needed — used during registration)
router.get("/cities/active", async (_req, res) => {
  try {
    const cities = await prisma.city.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, state: true },
    });
    res.json({ cities });
  } catch {
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Public: active categories list (no auth needed — used during agent registration)
router.get("/categories/active", async (_req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        documentRequirements: {
          select: { id: true, name: true, description: true, isRequired: true },
          orderBy: { id: "asc" },
        },
      },
    });
    res.json({ categories });
  } catch {
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Public: is this number free for the given role? Called before an OTP is sent
// so a duplicate signup never costs an SMS.
router.post("/phone/check", checkPhoneAvailability);

// User routes
router.post("/user/register", registerUser);
router.post("/user/login", loginUser);

// Admin routes
router.post("/admin/register", registerAdmin);
router.post("/admin/login", loginAdmin);

// Agent routes
router.post("/agent/register", upload.any(), registerAgent);
router.post("/agent/login", loginAgent);

export default router;
