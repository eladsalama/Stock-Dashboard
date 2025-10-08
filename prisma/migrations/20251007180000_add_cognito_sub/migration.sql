-- Add optional cognitoSub column to User
ALTER TABLE "User" ADD COLUMN "cognitoSub" TEXT UNIQUE;
