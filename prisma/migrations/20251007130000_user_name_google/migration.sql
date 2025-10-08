-- Add googleSub and name columns to User
ALTER TABLE "User" ADD COLUMN "googleSub" TEXT;
ALTER TABLE "User" ADD COLUMN "name" TEXT;
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub") WHERE "googleSub" IS NOT NULL;