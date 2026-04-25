import z from "zod";

const addAddressSchema = z.object({
  first_name: z.string().trim().min(2).max(100),
  last_name: z.string().trim().min(2).max(100),
  phone_code: z
    .string()
    .trim()
    .regex(/^\+\d{1,4}$/),
  phone_number: z
    .string()
    .trim()
    .regex(/^\d{6,15}$/),
  line1: z.string().trim().min(2).max(255),
  line2: z.string().trim().max(255).optional(),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  pin_code: z.string().trim().min(4).max(10),
  country: z.string().trim().min(2).max(100),
  landmark: z.string().trim().max(255).optional(),
  is_default: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone_code: z
    .string()
    .trim()
    .regex(/^\+\d{1,4}$/)
    .optional(),
  phone_number: z
    .string()
    .trim()
    .regex(/^\d{6,15}$/)
    .optional(),
});

export { addAddressSchema, updateProfileSchema };
