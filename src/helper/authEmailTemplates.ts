export const AUTH_EMAIL_TEMPLATES = {
  registrationSuccess: {
    subject: "Welcome to {{appName}}",
    template: "auth/registration-success.ejs",
  },
  verifyAccount: {
    subject: "Verify your account",
    template: "auth/verify-account.ejs",
  },
  forgotPassword: {
    subject: "Reset your password",
    template: "auth/forgot-password.ejs",
  },
  passwordResetSuccess: {
    subject: "Your password has been changed",
    template: "auth/password-reset-success.ejs",
  },
  accountLocked: {
    subject: "Account temporarily locked",
    template: "auth/account-locked.ejs",
  },
  newLoginAlert: {
    subject: "New login detected",
    template: "auth/new-login-alert.ejs",
  },
  emailChangedAlert: {
    subject: "Your email was changed",
    template: "auth/email-changed-alert.ejs",
  },
} as const;

export type AuthEmailTemplateKey = keyof typeof AUTH_EMAIL_TEMPLATES;
