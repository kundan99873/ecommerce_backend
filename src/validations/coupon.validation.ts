import { z } from "zod";

const addCouponSchema = z.object({
  code: z.string().min(1, "Coupon code is required"),
  description: z.string().optional(),
  discount_type: z.enum(["PERCENTAGE", "FIXED"]).optional(),
  discount_value: z.number().min(0, "Discount value must be a positive number"),
  start_date: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Invalid date format",
  }),
  end_date: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Invalid date format",
  }),
  min_purchase: z
    .number()
    .min(0, "Minimum purchase must be a positive number")
    .nullable()
    .optional(),
  max_uses: z
    .number()
    .min(0, "Max uses must be a positive number")
    .nullable()
    .optional(),
  is_active: z.boolean().optional(),
  is_global: z.boolean().optional(),
});

export { addCouponSchema };
