/*
  Warnings:

  - You are about to drop the column `postal_code` on the `Address` table. All the data in the column will be lost.
  - Added the required column `pin_code` to the `Address` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Address" DROP COLUMN "postal_code",
ADD COLUMN     "pin_code" TEXT NOT NULL;
