import nodemailer from "nodemailer";
import ejs from "ejs";
import path from "path";
import { fileURLToPath } from "url";

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
  data: Record<string, any>;
}) => {
  try {
    const templatePath = path.join(
      __dirname,
      "../views/emails",
      `${template}`
    );

    const html = await ejs.renderFile(templatePath, data);

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: `"My App" <${process.env.SMTP_USER}>`,
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
