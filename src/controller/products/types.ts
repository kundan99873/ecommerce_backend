export interface VariantInput {
  color?: string;
  size?: string;
  original_price: number;
  discounted_price: number;
  stock: number;
  id?: number;
  removed_image_ids?: number[]; 
  primary_image_index?: number;
  // sku: string;
  // images?: Express.Multer.File[];
}

export type SortOptions = "price_low" | "price_high" | "top_rated" | "newest";
export type FilterOptions = "in_stock" | "out_of_stock" | "featured" | "trending"

export interface productFilter {
  sort?: SortOptions;
  category?: string;
  filter?: any;
  is_product_listing_page?: any;
}

export interface addProductInput {
  name: string;
  description?: string;
  brand: string;
  category: string;
  variants: string | VariantInput[];
}

