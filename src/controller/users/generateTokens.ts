import jwt from "jsonwebtoken";
import { encryptData } from "../../utils/utils.js";
import type { GeneratedTokens, TokenPayload } from "./types.js";

const generateTokens = (payload: TokenPayload): GeneratedTokens => {
  console.log(process.env.ACCESS_TOKEN_SECRET, process.env.REFRESH_TOKEN_SECRET);
  const secretData = encryptData(payload);

  const accessToken = jwt.sign(
    { data: secretData },
    process.env.ACCESS_TOKEN_SECRET!,
    { expiresIn: "15m" },
  );

  const refreshToken = jwt.sign(
    { data: secretData },
    process.env.REFRESH_TOKEN_SECRET!,
    { expiresIn: "7d" },
  );

  return { accessToken, refreshToken };
};

export default generateTokens;
