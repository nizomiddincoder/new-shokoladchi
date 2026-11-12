-- Kuryer roli olib tashlandi: yetkazish taksi orqali, sotuvchi boshqaradi.

-- Mavjud kuryerlar oddiy mijozga aylanadi, kuryer takliflari o'chiriladi
UPDATE "User" SET "role" = 'CUSTOMER' WHERE "role" = 'COURIER';
DELETE FROM "Invite" WHERE "role" = 'COURIER';

-- Role enum'dan COURIER ni olib tashlash
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'SELLER', 'WAREHOUSE', 'ADMIN');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'CUSTOMER';
ALTER TABLE "Invite" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
DROP TYPE "Role_old";

-- Buyurtmadagi kuryer maydonlari
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_courierId_fkey";
DROP INDEX IF EXISTS "Order_courierId_idx";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "courierId";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "courierMsgs";
