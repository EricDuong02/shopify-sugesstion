/*
  Warnings:

  - The `typeId` column on the `ProductGroups` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "ProductGroups" DROP COLUMN "typeId",
ADD COLUMN     "typeId" TEXT[];
