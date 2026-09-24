import { z } from "zod";
import { zEmail } from "@/lib/validation/form";
import { passwordSchema } from "@/lib/validation/password";

export const loginSchema = z.object({
  email: zEmail,
  password: z.string({ error: "La contraseña es obligatoria" }).min(1, "La contraseña es obligatoria").max(128),
  next: z.string().optional(),
});

export const forgotPasswordSchema = z.object({ email: zEmail });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10).max(200),
    password: passwordSchema,
    confirmPassword: z.string({ error: "Confirma la contraseña" }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden",
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string({ error: "Ingresa tu contraseña actual" }).min(1, "Ingresa tu contraseña actual"),
    newPassword: passwordSchema,
    confirmPassword: z.string({ error: "Confirma la contraseña" }),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden",
  });
