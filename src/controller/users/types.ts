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

export interface addAddressBody {
  first_name: string;
  last_name: string;
  phone_code?: string;
  phone_number: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pin_code: string;
  country: string;
  landmark?: string;
  is_default?: boolean;
  is_active?: boolean;
}