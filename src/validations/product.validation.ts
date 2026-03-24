import { z } from "zod";

const sixDigitPincodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Valid 6 digit pincode is required");

const productQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  filter: z.string().optional(),
  is_product_listing_page: z.string().optional(),
  pincode: sixDigitPincodeSchema.optional(),
});

const productAvailabilityQuerySchema = z.object({
  pincode: sixDigitPincodeSchema,
});

const productPincodesBodySchema = z.object({
  pincodes: z
    .array(sixDigitPincodeSchema)
    .min(1, "At least one pincode is required"),
});

const productPincodeParamSchema = z.object({
  pincode: sixDigitPincodeSchema,
});

const productReviewBodySchema = z.object({
  rating: z
    .number()
    .int("Rating must be an integer")
    .min(1, "Rating must be at least 1")
    .max(5, "Rating must be at most 5"),
  comment: z
    .string()
    .trim()
    .max(1000, "Comment must be at most 1000 characters")
    .optional(),
});

const productReviewQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
});

export {
  sixDigitPincodeSchema,
  productQuerySchema,
  productAvailabilityQuerySchema,
  productPincodesBodySchema,
  productPincodeParamSchema,
  productReviewBodySchema,
  productReviewQuerySchema,
};
