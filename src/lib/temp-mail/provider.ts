import type { EmailReceiver } from "./types";
import { MailPaceProvider } from "./providers/mailpace";

let providerInstance: EmailReceiver | null = null;

export function getEmailReceiver(): EmailReceiver {
  if (providerInstance) return providerInstance;

  const providerName = (process.env.TEMP_MAIL_PROVIDER || "").toLowerCase().trim();

  switch (providerName) {
    case "mailpace":
    case "mailpace.com":
      providerInstance = new MailPaceProvider();
      break;
    default:
      providerInstance = createNoOpProvider();
      break;
  }

  return providerInstance;
}

function createNoOpProvider(): EmailReceiver {
  return {
    isConfigured: () => false,
    createMailbox: async () => {
      throw new Error("No email provider configured");
    },
    deleteMailbox: async () => {},
    verifyWebhookSignature: async () => ({
      valid: false,
      error: "No email provider configured",
    }),
    parseWebhookBody: () => {
      throw new Error("No email provider configured");
    },
  };
}
