import z from "zod";

const addAddressSchema = z.object({
  first_name: z.string().min(2).max(100),
  last_name: z.string().min(2).max(100),
  phone_code: z.string().min(1).max(5),
  phone_number: z.string().min(6).max(15),
  line1: z.string().min(2).max(255),
  line2: z.string().optional(),
  city: z.string().min(2).max(100),
  state: z.string().min(2).max(100),
  pin_code: z.string().min(4).max(10),
  country: z.string().min(2).max(100),
  landmark: z.string().optional(),
  is_default: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

export { addAddressSchema };
