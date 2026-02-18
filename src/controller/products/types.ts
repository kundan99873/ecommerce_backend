export interface VariantInput {
  color?: string;
  size?: string;
  original_price: number;
  discounted_price: number;
  stock: number;
  // sku: string;
  // images?: Express.Multer.File[];
}

export type SortOptions = "price_low" | "price_high" | "top_rated" | "newest";

export interface productFilter {
  sort?: SortOptions;
  category?: string;
  filter?: any;
}

export interface addProductInput {
  name: string;
  description?: string;
  brand: string;
  category: string;
  variants: string | VariantInput[];
}

