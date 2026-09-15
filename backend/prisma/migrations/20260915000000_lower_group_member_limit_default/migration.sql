-- Lower the default member_limit for new groups from 10 to 5
-- (docs/backlog.md「収益化」参照。既存グループの値は変更しない)
ALTER TABLE "groups" ALTER COLUMN "member_limit" SET DEFAULT 5;
