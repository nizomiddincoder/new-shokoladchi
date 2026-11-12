-- "Mening shokoladim": maxsus buyurtmalar
ALTER TABLE "Order" ADD COLUMN "isPersonal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrderItem" ADD COLUMN "designUrl" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "templateId" INTEGER;

-- Shablonlar
CREATE TABLE "PersonalTemplate" (
    "id" SERIAL NOT NULL,
    "titleUz" TEXT NOT NULL,
    "titleRu" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "areaX" DOUBLE PRECISION NOT NULL DEFAULT 0.67,
    "areaY" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "areaW" DOUBLE PRECISION NOT NULL DEFAULT 0.31,
    "areaH" DOUBLE PRECISION NOT NULL DEFAULT 0.45,
    "productId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalTemplate_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PersonalTemplate" ADD CONSTRAINT "PersonalTemplate_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;