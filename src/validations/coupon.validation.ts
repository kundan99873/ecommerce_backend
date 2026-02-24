import { z } from "zod";

const addCouponSchema = z.object({
  code: z.string().min(1, "Coupon code is required"),
  discount: z.number().min(0, "Discount must be a positive number"),
  start_date: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Invalid date format",
  }),
  end_date: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Invalid date format",
  }),
  discount_value: z.number().min(0, "Discount value must be a positive number"),
  minimum_purchase: z
    .number()
    .min(0, "Minimum purchase must be a positive number")
    .optional(),
  is_active: z.boolean().optional(),
  is_global: z.boolean().optional(),
  discount_type: z.enum(["percentage", "fixed"]).optional(),
});

export { addCouponSchema };
