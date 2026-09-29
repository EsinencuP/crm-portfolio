import { z } from "zod";

export const registrationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Name must be at least 2 characters." })
    .max(120, { error: "Name must be at most 120 characters." }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, { error: "Email address is too long." })
    .pipe(z.email({ error: "Please enter a valid email address." })),
  password: z
    .string()
    .min(6, { error: "Password must be at least 6 characters." })
    // bcrypt uses at most 72 UTF-8 bytes. Reject longer passwords instead of truncating them.
    .refine((password) => new TextEncoder().encode(password).length <= 72, {
      error: "Password is too long. Please use a shorter password.",
    }),
});
