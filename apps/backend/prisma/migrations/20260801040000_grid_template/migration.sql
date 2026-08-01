-- CreateTable
CREATE TABLE "GridTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rows" INTEGER NOT NULL,
    "cols" INTEGER NOT NULL,
    "cells" JSONB NOT NULL,
    "zones" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GridTemplate_pkey" PRIMARY KEY ("id")
);
