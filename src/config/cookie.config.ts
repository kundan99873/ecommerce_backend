import type { CookieOptions } from "express";

const isProduction = process.env.NODE_ENV === "production";
const cookieDomain = process.env.COOKIE_DOMAIN?.trim() || undefined;
const cookieSameSite: CookieOptions["sameSite"] = isProduction ? "none" : "lax";

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: cookieSameSite,
  ...(cookieDomain ? { domain: cookieDomain } : {}),
};

const accessTokenCookieOptions: CookieOptions = {
  ...baseCookieOptions,
  maxAge: 15 * 60 * 1000,
};

const refreshTokenCookieOptions: CookieOptions = {
  ...baseCookieOptions,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const clearCookieOptions: CookieOptions = {
  ...baseCookieOptions,
  expires: new Date(0),
};

export {
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
  clearCookieOptions,
};
