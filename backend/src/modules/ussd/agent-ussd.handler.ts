import { USSDSessionService } from "../agents/ussd_session.service.js";
import { AgentServiceError } from "../agents/AgentServiceError.js";
import { AgentService } from "../agents/agent.service";
import { resolveUSSDInputs } from "./ussd-navigation.helper.js";

export class AgentUSSDHandler {
  static async handle(
    sessionId: string,
    phoneNumber: string,
    text: string,
  ): Promise<string> {
    const inputs = resolveUSSDInputs(text);
    const session = await USSDSessionService.getSession(sessionId);

    // Resolve active agent via sim_assignments
    const agentData = await AgentService.getAgentByPhone(phoneNumber);
    if (!agentData) {
      return "END Access Denied. Phone Number does not exists.";
    }

    const { agent, user } = agentData;

    if (agent.status === "SUSPENDED") {
      return "END Access Denied: Your Agent account is currently SUSPENDED due to multiple failed PIN attempts. Please contact Admin support.";
    }

    if (agent.status !== "ACTIVE" || user.status !== "ACTIVE") {
      return "END Access Denied: Your Agent account is inactive.";
    }

    // MENU 0: Root Menu
    if (inputs.length === 0) {
      return (
        "CON MTN Agent Portal\n" +
        "1. Sell Airtime\n" +
        "2. Check Float Balance\n" +
        "3. My Sales"
      );
    }

    const selection = inputs[0];

    // --- OPTION 1: SELL AIRTIME ---
    if (selection === "1") {
      // Step 1: Prompt for Subscriber Phone Number
      if (inputs.length === 1) {
        return "CON Enter Subscriber Phone Number";
      }

      // Step 2: Save Phone Number & Prompt for Amount
      if (inputs.length === 2) {
        const targetPhone = inputs[1].trim();
        await USSDSessionService.updateSession(sessionId, {
          targetPhoneNumber: targetPhone,
        });
        return "CON Enter Airtime Amount in SSP:";
      }

      // Step 3: Save Amount & Prompt for PIN
      if (inputs.length === 3) {
        const amountSSP = parseFloat(inputs[2].trim());
        if (isNaN(amountSSP) || amountSSP <= 0) {
          return "END Invalid amount entered. Please enter a positive number.";
        }

        const targetPhone = session.targetPhoneNumber || inputs[1].trim();
        return (
          `CON Sell ${amountSSP.toLocaleString()} SSP Airtime to ${targetPhone}?\n` +
          `Enter 4-digit Agent PIN:`
        );
      }

      // Step 4: Validate PIN & Execute Transaction with Idempotency Key
      if (inputs.length === 4) {
        const inputPin = inputs[3].trim();
        const targetPhone = session.targetPhoneNumber || inputs[1].trim();
        const amountSSP = parseFloat(inputs[2].trim());

        // Convert SSP amount to minor units (1 SSP = 100 minor units)
        const amountMinor = BigInt(Math.round(amountSSP * 100));

        // Use sessionId as the idempotencyKey for USSD session safety
        const idempotencyKey = `ussd:airtime:${sessionId}`;

        const pinVerification = await AgentService.verifyPinWithLockout(
          agent.id,
          inputPin,
        );
        if (!pinVerification.success) {
          await USSDSessionService.clearSession(sessionId);
          return `END Transaction Failed: ${pinVerification.message}`;
        }

        try {
          const result = await AgentService.sellAirtime(
            agent.id,
            targetPhone,
            amountMinor,
            idempotencyKey,
          );

          await USSDSessionService.clearSession(sessionId);

          const refCode = result.orderId.substring(0, 8).toUpperCase();
          let responseMsg = `END Success! ${amountSSP.toLocaleString()} SSP airtime loaded to ${targetPhone}.\nRef: TXN-${refCode}`;

          if (result.newFloatMinor) {
            const newFloatSSP = (
              Number(result.newFloatMinor) / 100
            ).toLocaleString();
            responseMsg += `\nNew Float Balance: ${newFloatSSP} SSP.`;
          }

          return responseMsg;
        } catch (error) {
          await USSDSessionService.clearSession(sessionId);

          if (error instanceof AgentServiceError) {
            return `END Transaction Failed: ${error.message}`;
          }

          return "END Transaction Failed: System error occurred during airtime transfer.";
        }
      }
    }

    // --- OPTION 2: CHECK FLOAT BALANCE ---
    if (selection === "2") {
      const floatSSP = (Number(agent.floatBalanceMinor) / 100).toLocaleString();
      return `END Your current float balance is ${floatSSP} SSP.`;
    }

    // --- OPTION 3: MY SALES ---
    if (selection === "3") {
      // Step 1: Show Sales Period Menu
      if (inputs.length === 1) {
        return (
          "CON Select Sales Period:\n" +
          "1. Today's Sales\n" +
          "2. This Week's Sales\n" +
          "3. This Month's Sales"
        );
      }

      // Step 2: Handle Sub-menu Selection ("3*1", "3*2", "3*3")
      if (inputs.length === 2) {
        const subSelection = inputs[1].trim();

        if (subSelection === "1") {
          const sales = await AgentService.getSalesToday(agent.id);
          const total = (Number(sales.totalSalesMinor) / 100).toLocaleString();
          return `END Today's Sales:\nRevenue: ${total} SSP\nTransactions: ${sales.transactionCount}`;
        }

        if (subSelection === "2") {
          const sales = await AgentService.getSalesThisWeek(agent.id);
          const total = (Number(sales.totalSalesMinor) / 100).toLocaleString();
          return `END This Week's Sales:\nRevenue: ${total} SSP\nTransactions: ${sales.transactionCount}`;
        }

        if (subSelection === "3") {
          const sales = await AgentService.getSalesThisMonth(agent.id);
          const total = (Number(sales.totalSalesMinor) / 100).toLocaleString();
          return `END This Month's Sales:\nRevenue: ${total} SSP\nTransactions: ${sales.transactionCount}`;
        }

        return "END Invalid sub-menu selection.";
      }
    }

    return "END Invalid menu selection.";
  }
}
