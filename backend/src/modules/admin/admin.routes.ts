import { Router } from "express";
import { AdminAuthController } from "../../modules/admin/admin-auth.controller";
import { AdminDashboardController } from "../../modules/admin/admin-dashboard.controller";
import { verifyAdmin } from "../../middlewares/admin.middleware";

const router = Router();

// Public Admin Auth Route
router.post("/auth/login", AdminAuthController.login);

// Protected Admin Routes
router.use(verifyAdmin);

router.get("/dashboard/metrics", AdminDashboardController.getOverviewMetrics);

export default router;
