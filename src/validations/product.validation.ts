import { z } from "zod";

const productQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  filter: z.string().optional(),
  is_product_listing_page: z.string().optional(),
});

const productAvailabilityQuerySchema = z.object({
  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Valid 6 digit pincode is required"),
});

export { productQuerySchema, productAvailabilityQuerySchema };
