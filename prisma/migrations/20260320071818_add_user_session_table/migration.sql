/*
  Warnings:

  - The values [PAID] on the enum `OrderStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `refresh_token` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `refresh_token_expires` on the `User` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('PENDING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'PACKED', 'OUT_FOR_DELIVERY', 'RETURN_REQUESTED', 'RETURNED', 'PROCESSING');
ALTER TABLE "public"."Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "public"."OrderStatus_old";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "refresh_token",
DROP COLUMN "refresh_token_expires";

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "device_id" TEXT NOT NULL,
    "device_name" TEXT,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserSession_user_id_device_id_idx" ON "UserSession"("user_id", "device_id");

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
