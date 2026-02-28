import { z } from "zod";

const productQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  filter: z.string().optional(),
  is_product_listing_page: z.string().optional(),
});

export { productQuerySchema };
