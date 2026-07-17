-- AlterTable
ALTER TABLE "users" ADD COLUMN "date_of_birth" DATE;

-- CreateIndex
CREATE INDEX "users_first_name_last_name_date_of_birth_idx" ON "users"("first_name", "last_name", "date_of_birth");