import { Router } from "express";
import { AdminAuthController } from "../../modules/admin/admin-auth.controller.js";
import { AdminDashboardController } from "../../modules/admin/admin-dashboard.controller.js";
import { verifyAdmin } from "../../middlewares/admin.middleware.js";
import { AdminKycController } from "./kyc.controller.js";
import { AdminSimController } from "./sim.controller.js";

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

adminRouter.get("/sims", AdminSimController.getSimCards);
adminRouter.post("/sims", AdminSimController.createSimCard);
adminRouter.patch("/sims/:id/status", AdminSimController.updateSimStatus);
adminRouter.get("/sims/:id", AdminSimController.getSimById);
adminRouter.post("/sims/assign", AdminSimController.assignSim);

export default adminRouter;
