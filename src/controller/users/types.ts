export interface TokenPayload {
  user_id: number;
  role_id: number;
}

export interface GeneratedTokens {
  accessToken: string;
  refreshToken: string;
}
