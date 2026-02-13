import { z } from "zod";

const productQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  filter: z.string().optional(),
});

export { productQuerySchema };
