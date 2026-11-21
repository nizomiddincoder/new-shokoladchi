-- Kassa dasturidan keladigan kirim (Ҳарид) faylini mahsulotlarga moslashtirish uchun shtrix-kod
ALTER TABLE "Product" ADD COLUMN "barcode" TEXT;
CREATE INDEX "Product_barcode_idx" ON "Product"("barcode");
