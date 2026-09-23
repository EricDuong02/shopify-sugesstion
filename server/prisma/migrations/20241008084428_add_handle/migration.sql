/*
  Warnings:

  - Added the required column `handle` to the `ListProduct` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ListProduct" ADD COLUMN     "handle" TEXT NOT NULL;
