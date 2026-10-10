import {
  SubscriberService,
  SubscriberServiceError,
} from "../subscribers/subscriber.service.js";
import { USSDSessionService } from "../agents/ussd_session.service.js";
import { formatAllowance } from "../../helpers/utils.js";
import { ROOT_MENU } from "../../constants/consts.js";
import { resolveUSSDInputs } from "./ussd-navigation.helper.js";

export class SubscriberUSSDHandler {
  static async handle(
    sessionId: string,
    phoneNumber: string,
    text: string,
  ): Promise<string> {
    const inputs = resolveUSSDInputs(text);
    const session = await USSDSessionService.getSession(sessionId);

    // 1. Session Ownership & Security Check
    if (session.phoneNumber && session.phoneNumber !== phoneNumber) {
      await USSDSessionService.clearSession(sessionId);
      return "END Security Error: Invalid session ownership detected.";
    }

    // Resolve subscriber via current active SIM assignment
    const subscriberData =
      await SubscriberService.getSubscriberByPhone(phoneNumber);
    if (!subscriberData) {
      return "END Access Denied. This Number does not exists.";
    }

    const { subscriber } = subscriberData;

    // Cache initial session metadata
    if (!session.phoneNumber) {
      await USSDSessionService.updateSession(sessionId, {
        phoneNumber,
        role: "SUBSCRIBER",
      });
    }

    // MENU 0: Root Menu
    if (inputs.length === 0) {
      return ROOT_MENU;
    }

    const rootChoice = inputs[0];

    // --- OPTION 1: CHECK BALANCES ---
    if (rootChoice === "1") {
      const { airtimeBalanceMinor, activeBundles } =
        await SubscriberService.getSubscriberBalances(subscriber.id);

      const airtimeSSP = (Number(airtimeBalanceMinor) / 100).toLocaleString();
      let responseText = `END MTN Balance Summary\nAirtime Balance: ${airtimeSSP} SSP\n`;

      if (activeBundles.length === 0) {
        responseText += "Active Bundles: None";
      } else {
        responseText += "Active Bundles:\n";
        for (const item of activeBundles) {
          const qtyStr = formatAllowance(
            item.instance.remainingQuantity,
            item.product.unit,
          );
          const exp = item.instance.expiresAt.toISOString().split("T")[0];
          responseText += `• ${item.product.name}: ${qtyStr} (Exp: ${exp})\n`;
        }
      }

      return responseText.trim();
    }

    // --- OPTIONS 2, 3, 4: BUNDLE PURCHASES (DATA, VOICE, SMS) ---
    if (["2", "3", "4"].includes(rootChoice)) {
      const categoryMap: Record<string, "DATA" | "VOICE" | "SMS"> = {
        "2": "DATA",
        "3": "VOICE",
        "4": "SMS",
      };

      const category = categoryMap[rootChoice];
      const availableProducts =
        await SubscriberService.getProductsByCategory(category);

      if (availableProducts.length === 0) {
        return `END MTN Notice: No active ${category} bundles are currently available.`;
      }

      // Enforce USSD menu size limit (max 5 options per screen to prevent truncation)
      const visibleProducts = availableProducts.slice(0, 5);

      // Step 1: Package Selection Menu
      if (inputs.length === 1) {
        let menuText = `CON Select MTN ${category} Bundle:\n`;
        visibleProducts.forEach((prod, index) => {
          const priceSSP = (Number(prod.priceMinor) / 100).toLocaleString();
          menuText += `${index + 1}. ${prod.name} @ ${priceSSP} SSP\n`;
        });
        menuText += `0. Back\n00. Main Menu`;
        return menuText;
      }

      // Step 2: Package Selection & Confirmation Prompt
      if (inputs.length === 2) {
        const selectionIndex = parseInt(inputs[1], 10) - 1;
        const selectedProduct = visibleProducts[selectionIndex];
        if (!selectedProduct) {
          await USSDSessionService.clearSession(sessionId);
          return "END Invalid product selection. Session terminated.";
        }

        // Cache selected product ID in Redis session
        await USSDSessionService.updateSession(sessionId, {
          selectedProductId: selectedProduct.id,
        });

        const priceSSP = (
          Number(selectedProduct.priceMinor) / 100
        ).toLocaleString();

        return (
          `CON Confirm purchase of ${selectedProduct.name} for ${priceSSP} SSP?\n` +
          "1. Confirm\n" +
          "2. Cancel"
        );
      }

      // Step 3: Purchase Execution
      if (inputs.length === 3) {
        const confirmChoice = inputs[2].trim();

        if (confirmChoice === "2") {
          await USSDSessionService.clearSession(sessionId);
          return "END Transaction cancelled. No airtime was deducted.";
        }

        if (confirmChoice !== "1") {
          await USSDSessionService.clearSession(sessionId);
          return "END Invalid choice. Transaction cancelled.";
        }

        const productId = session.selectedProductId;
        if (!productId) {
          await USSDSessionService.clearSession(sessionId);
          return "END Session expired or invalid product selected. Please try again.";
        }

        // Generate deterministic USSD idempotency key
        const idempotencyKey = `ussd:bundle:${sessionId}`;

        try {
          const result = await SubscriberService.purchaseBundle(
            subscriber.id,
            productId,
            idempotencyKey,
          );

          await USSDSessionService.clearSession(sessionId);

          const remSSP = (
            Number(result.remainingAirtimeMinor) / 100
          ).toLocaleString();

          return (
            `END Success! You have bought ${result.productName}.\n` +
            `Remaining Airtime Balance: ${remSSP} SSP.`
          );
        } catch (error) {
          await USSDSessionService.clearSession(sessionId);

          if (error instanceof SubscriberServiceError) {
            return `END Purchase Failed: ${error.message}`;
          }

          return "END Purchase Failed: System error processing bundle purchase.";
        }
      }
    }

    return "END Invalid choice. Session terminated.";
  }
}
