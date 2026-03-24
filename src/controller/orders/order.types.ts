export interface OrderPayload {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export type OrderStatus =
  | "PENDING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "PACKED"
  | "OUT_FOR_DELIVERY"
  | "RETURN_REQUESTED"
  | "RETURNED"
  | "PROCESSING";
