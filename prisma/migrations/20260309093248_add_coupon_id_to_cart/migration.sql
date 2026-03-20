-- AlterTable
ALTER TABLE "Cart" ADD COLUMN "coupon_id" INTEGER;

-- CreateIndex
CREATE INDEX "Cart_coupon_id_idx" ON "Cart"("coupon_id");

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
