import { Router } from "express";
import { AdminAuthController } from "../../modules/admin/admin-auth.controller";
import { AdminDashboardController } from "../../modules/admin/admin-dashboard.controller";
import { verifyAdmin } from "../../middlewares/admin.middleware";
import { AdminKycController } from "./kyc.controller";

const adminRouter = Router();

// Public Admin Auth Route
adminRouter.post("/auth/login", AdminAuthController.login);
adminRouter.post("/auth/signup", AdminAuthController.createAdmin);
// Protected Admin Routes
adminRouter.use(verifyAdmin);

adminRouter.get(
  "/dashboard/metrics",
  AdminDashboardController.getOverviewMetrics,
);

adminRouter.get("/subscribers", AdminKycController.getSubscribers);
adminRouter.patch("/kyc/:userId", AdminKycController.updateKycStatus);
adminRouter.post("/subscribers", AdminKycController.createSubscriber);
adminRouter.get("/subscribers/:id", AdminKycController.getSubscriberById);
adminRouter.patch("/kyc/:userId", AdminKycController.updateKycStatus);

export default adminRouter;
