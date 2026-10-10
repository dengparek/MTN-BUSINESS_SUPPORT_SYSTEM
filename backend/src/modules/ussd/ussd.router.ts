import { Router } from "express";
import { USSDController } from "./ussd.controller.ts";
import { ussdRateLimiter } from "../../middlewares/ussd-rate-limiter.middleware.ts";

const ussdRouter = Router();

ussdRouter.post("/", ussdRateLimiter, USSDController.handleUSSD);

export { ussdRouter };
