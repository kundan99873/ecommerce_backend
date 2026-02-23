-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "is_featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_trending" BOOLEAN NOT NULL DEFAULT false;
