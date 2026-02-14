export interface TokenPayload {
  user_id: number;
  role_id: number;
}

export interface GeneratedTokens {
  accessToken: string;
  refreshToken: string;
}


export interface getUserQuery {
  search?: string;
  role?: number;
  limit?: number;
  page?: number;
  sort?: "asc" | "desc";
}