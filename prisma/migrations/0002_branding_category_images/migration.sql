-- Do'kon logosi
ALTER TABLE "Settings" ADD COLUMN "logoUrl" TEXT;

-- Kategoriya rasmi va AI holati
ALTER TABLE "Category" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "Category" ADD COLUMN "imageStatus" "AiStatus" NOT NULL DEFAULT 'NONE';
