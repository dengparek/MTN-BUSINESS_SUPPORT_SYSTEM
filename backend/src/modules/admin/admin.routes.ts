import { Router } from "express";
import { AdminAuthController } from "../../modules/admin/admin-auth.controller";
import { AdminDashboardController } from "../../modules/admin/admin-dashboard.controller";
import { verifyAdmin } from "../../middlewares/admin.middleware";

const AdminRouter = Router();

// Public Admin Auth Route
AdminRouter.post("/auth/login", AdminAuthController.login);
AdminRouter.post("/auth/signup", AdminAuthController.createAdmin);
// Protected Admin Routes
AdminRouter.use(verifyAdmin);

AdminRouter.get(
  "/dashboard/metrics",
  AdminDashboardController.getOverviewMetrics,
);

export default AdminRouter;
