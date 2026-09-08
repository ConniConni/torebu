-- CreateEnum
CREATE TYPE "GroupMemberRole" AS ENUM ('owner', 'member');

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "invite_code" TEXT NOT NULL,
    "invite_expires_at" TIMESTAMPTZ(3),
    "member_limit" INTEGER NOT NULL DEFAULT 10,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "group_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "GroupMemberRole" NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(3),

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("group_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "groups_invite_code_key" ON "groups"("invite_code");

-- CreateIndex
CREATE INDEX "groups_created_by_idx" ON "groups"("created_by");

-- CreateIndex
CREATE INDEX "group_members_user_id_idx" ON "group_members"("user_id");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

