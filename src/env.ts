// src/env.ts
import { z } from "zod";

const envSchema = z.object({
  DB_HOST: z.string().min(1),
  DB_PORT: z.string().regex(/^\d+$/).transform(Number),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().url(),
});

export const env = envSchema.parse(process.env);
