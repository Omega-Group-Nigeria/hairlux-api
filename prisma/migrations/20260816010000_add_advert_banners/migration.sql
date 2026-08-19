-- Home-screen advert banners managed by admins.
-- is_active controls visibility; sort_order (ascending) controls carousel order.

CREATE TABLE "advert_banners" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "image_public_id" TEXT NOT NULL,
    "link_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advert_banners_pkey" PRIMARY KEY ("id")
);