export interface VariantInput {
  color?: string;
  size?: string;
  original_price: number;
  discounted_price: number;
  stock: number;
  sku: string;
  images?: Express.Multer.File[];
}