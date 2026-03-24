-- CreateTable
CREATE TABLE "RecentlyViewedProduct" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecentlyViewedProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecentlyViewedProduct_user_id_idx" ON "RecentlyViewedProduct"("user_id");

-- CreateIndex
CREATE INDEX "RecentlyViewedProduct_user_id_updated_at_idx" ON "RecentlyViewedProduct"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "RecentlyViewedProduct_product_id_idx" ON "RecentlyViewedProduct"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "RecentlyViewedProduct_user_id_product_id_key" ON "RecentlyViewedProduct"("user_id", "product_id");

-- AddForeignKey
ALTER TABLE "RecentlyViewedProduct" ADD CONSTRAINT "RecentlyViewedProduct_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecentlyViewedProduct" ADD CONSTRAINT "RecentlyViewedProduct_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
