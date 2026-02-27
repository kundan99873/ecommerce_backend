-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "max_uses_per_user" INTEGER;

-- CreateTable
CREATE TABLE "CouponUsage" (
    "id" SERIAL NOT NULL,
    "coupon_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "product_id" INTEGER,
    "order_id" INTEGER NOT NULL,
    "used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CouponUsage_coupon_id_idx" ON "CouponUsage"("coupon_id");

-- CreateIndex
CREATE INDEX "CouponUsage_user_id_idx" ON "CouponUsage"("user_id");

-- CreateIndex
CREATE INDEX "CouponUsage_order_id_idx" ON "CouponUsage"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "CouponUsage_coupon_id_user_id_order_id_key" ON "CouponUsage"("coupon_id", "user_id", "order_id");

-- CreateIndex
CREATE INDEX "Coupon_code_idx" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_is_active_idx" ON "Coupon"("is_active");

-- AddForeignKey
ALTER TABLE "CouponUsage" ADD CONSTRAINT "CouponUsage_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponUsage" ADD CONSTRAINT "CouponUsage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponUsage" ADD CONSTRAINT "CouponUsage_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponUsage" ADD CONSTRAINT "CouponUsage_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
