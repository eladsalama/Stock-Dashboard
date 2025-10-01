/*
  Warnings:

  - Made the column `externalId` on table `Trade` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."Trade" ALTER COLUMN "externalId" SET NOT NULL;
