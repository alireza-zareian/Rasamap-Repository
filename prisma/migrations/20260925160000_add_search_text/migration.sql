-- Catalogue search over a folded copy of name, city, location and agency.
-- See lib/domain/search.ts: Arabic ي/ك typed for Persian ی/ک, half-spaces,
-- Persian digits.
--
-- Kept by triggers, not by the application, so every writer keeps it right
-- without knowing it exists: the admin panel, a listing, the seed, the nightly
-- import. A generated VIRTUAL column was tried first and measured: it refolds
-- every row on every search, 80 ms against 4 ms on the demo database. SQLite
-- cannot add a STORED generated column to an existing table, so the stored
-- value is filled here and on each insert, and refreshed only when one of the
-- four source columns changes.
--
-- The expression is searchTextSql() from lib/domain/search.ts, pasted, and
-- test/unit/search.test.mjs fails if the two drift apart. Prisma knows the
-- column as a plain optional field that no code writes.
ALTER TABLE "billboards" ADD COLUMN "searchText" TEXT;

UPDATE "billboards" SET "searchText" = lower(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace("name" || ' ' || "city" || ' ' || "location" || ' ' || "agency", 'ي', 'ی'), 'ى', 'ی'), 'ك', 'ک'), 'ة', 'ه'), 'ۀ', 'ه'), 'ـ', ''), char(8204), ' '), '۰', '0'), '۱', '1'), '۲', '2'), '۳', '3'), '۴', '4'), '۵', '5'), '۶', '6'), '۷', '7'), '۸', '8'), '۹', '9'), '٠', '0'), '١', '1'), '٢', '2'), '٣', '3'), '٤', '4'), '٥', '5'), '٦', '6'), '٧', '7'), '٨', '8'), '٩', '9'));

CREATE TRIGGER "billboards_search_text_insert" AFTER INSERT ON "billboards"
BEGIN
  UPDATE "billboards" SET "searchText" = lower(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace("name" || ' ' || "city" || ' ' || "location" || ' ' || "agency", 'ي', 'ی'), 'ى', 'ی'), 'ك', 'ک'), 'ة', 'ه'), 'ۀ', 'ه'), 'ـ', ''), char(8204), ' '), '۰', '0'), '۱', '1'), '۲', '2'), '۳', '3'), '۴', '4'), '۵', '5'), '۶', '6'), '۷', '7'), '۸', '8'), '۹', '9'), '٠', '0'), '١', '1'), '٢', '2'), '٣', '3'), '٤', '4'), '٥', '5'), '٦', '6'), '٧', '7'), '٨', '8'), '٩', '9')) WHERE "id" = NEW."id";
END;

CREATE TRIGGER "billboards_search_text_update" AFTER UPDATE OF "name", "city", "location", "agency" ON "billboards"
BEGIN
  UPDATE "billboards" SET "searchText" = lower(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace("name" || ' ' || "city" || ' ' || "location" || ' ' || "agency", 'ي', 'ی'), 'ى', 'ی'), 'ك', 'ک'), 'ة', 'ه'), 'ۀ', 'ه'), 'ـ', ''), char(8204), ' '), '۰', '0'), '۱', '1'), '۲', '2'), '۳', '3'), '۴', '4'), '۵', '5'), '۶', '6'), '۷', '7'), '۸', '8'), '۹', '9'), '٠', '0'), '١', '1'), '٢', '2'), '٣', '3'), '٤', '4'), '٥', '5'), '٦', '6'), '٧', '7'), '٨', '8'), '٩', '9')) WHERE "id" = NEW."id";
END;
