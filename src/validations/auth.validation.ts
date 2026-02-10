import { z } from "zod";

const registerUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const loginUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});


const changePasswordSchema = z.object({
  password: z.string().min(6, "Password must be at least 6 characters"),
  new_password: z.string().min(6, "New Password must be at least 6 characters"),
});

const resetPasswordSchema = z.object({
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export { registerUserSchema, loginUserSchema, changePasswordSchema, resetPasswordSchema };
