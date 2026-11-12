-- Yuklangan rasmlarning bazadagi zaxira nusxasi (deploy'da disk tozalansa ham rasmlar yo'qolmaydi)
CREATE TABLE "UploadBlob" (
    "path" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadBlob_pkey" PRIMARY KEY ("path")
);
