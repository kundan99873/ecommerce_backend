import ejs from "ejs";
import path from "path";
import { fileURLToPath } from "url";
import {
  mailDefaults,
  nodemailerTransporter,
} from "../config/nodemailer.config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const sendTemplateEmail = async ({
  to,
  subject,
  template,
  data,
}: {
  to: string;
  subject: string;
  template: string;
  data: Record<string, unknown>;
}) => {
  try {
    const templatePath = path.join(__dirname, "../views/emails", template);

    const html = await ejs.renderFile(templatePath, data);

    const info = await nodemailerTransporter.sendMail({
      from: `"${mailDefaults.fromName}" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });

    console.log("Message sent: %s", info);

    return {
      success: true,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Failed to send email",
    };
  }
};
