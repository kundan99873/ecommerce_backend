-- DropIndex
DROP INDEX "Wishlist_user_id_key";

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "Product_created_at_idx" ON "Product"("created_at");

-- CreateIndex
CREATE INDEX "Product_is_active_idx" ON "Product"("is_active");

-- CreateIndex
CREATE INDEX "Product_category_id_idx" ON "Product"("category_id");

-- CreateIndex
CREATE INDEX "ProductImage_variant_id_idx" ON "ProductImage"("variant_id");

-- CreateIndex
CREATE INDEX "ProductPincode_product_id_idx" ON "ProductPincode"("product_id");

-- CreateIndex
CREATE INDEX "ProductVariant_product_id_idx" ON "ProductVariant"("product_id");
