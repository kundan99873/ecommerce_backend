-- CreateTable
CREATE TABLE "SearchHistory" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "search_query" TEXT NOT NULL,
    "category_filter" TEXT,
    "brand_filter" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SearchHistory_user_id_idx" ON "SearchHistory"("user_id");

-- CreateIndex
CREATE INDEX "SearchHistory_user_id_created_at_idx" ON "SearchHistory"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "SearchHistory_search_query_idx" ON "SearchHistory"("search_query");

-- AddForeignKey
ALTER TABLE "SearchHistory" ADD CONSTRAINT "SearchHistory_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
