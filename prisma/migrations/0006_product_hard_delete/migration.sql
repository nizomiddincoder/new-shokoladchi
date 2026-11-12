-- Mahsulotni haqiqatan o'chirish mumkin bo'lsin:
-- buyurtma qatorlari nom/narx nusxasi bilan qoladi (productId NULL bo'ladi),
-- shu mahsulotga bog'langan "Mening shokoladim" shablonlari ham o'chadi.

ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_productId_fkey";
ALTER TABLE "OrderItem" ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PersonalTemplate" DROP CONSTRAINT "PersonalTemplate_productId_fkey";
ALTER TABLE "PersonalTemplate" ADD CONSTRAINT "PersonalTemplate_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
