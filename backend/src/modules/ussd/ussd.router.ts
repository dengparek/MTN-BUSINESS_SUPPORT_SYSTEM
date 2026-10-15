import { Router } from "express";
import { USSDController } from "./ussd.controller.js";
import { ussdRateLimiter } from "../../middlewares/ussd-rate-limiter.middleware.js";

const ussdRouter = Router();

ussdRouter.post("/", ussdRateLimiter, USSDController.handleUSSD);

export { ussdRouter };
