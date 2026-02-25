export interface CouponInput {
    code: string;
    description?: string;
    discount_type: "PERCENTAGE" | "FIXED";
    discount_value: number;
    start_date: string;
    end_date: string;
    min_purchase?: number | null;
    max_uses?: number | null;
    is_active?: boolean;
    is_global?: boolean;
}

export interface CouponUpdateInput {
    code?: string;
    description?: string;
    discount_type?: "PERCENTAGE" | "FIXED";
    discount_value?: number;
    start_date?: string;
    end_date?: string;
    min_purchase?: number | null;
    max_uses?: number | null;
    is_active?: boolean;
    is_global?: boolean;
}

export interface CouponQuery {
    page?: number;
    limit?: number;
    search?: string;
}

