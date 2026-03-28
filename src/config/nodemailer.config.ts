import nodemailer from "nodemailer";

const SMTP_PORT = Number(process.env.SMTP_PORT || 465);

console.log(process.env.SMTP_HOST, process.env.SMTP_USER, process.env.SMTP_PASS)

export const nodemailerTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth:
    process.env.SMTP_USER && process.env.SMTP_PASS
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
      : undefined,
});

export const mailDefaults = {
  appName: process.env.APP_NAME || "Ecommerce",
  supportEmail:
    process.env.SUPPORT_EMAIL || process.env.SMTP_USER || "support@example.com",
  fromName: process.env.MAIL_FROM_NAME || process.env.APP_NAME || "Ecommerce",
};
