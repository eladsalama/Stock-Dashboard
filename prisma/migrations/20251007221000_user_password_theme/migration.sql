-- Add passwordHash and themePreference columns to User
ALTER TABLE "User" ADD COLUMN "passwordHash" text;
ALTER TABLE "User" ADD COLUMN "themePreference" text;
