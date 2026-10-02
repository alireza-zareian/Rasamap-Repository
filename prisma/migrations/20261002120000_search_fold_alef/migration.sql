-- Search folds آ, أ and إ to ا (lib/domain/search.ts): a phone keyboard
-- rarely reaches آ, and «ازادی» found 3 boards where «آزادی» found 57; both
-- find 60 now. Same column and triggers as 20260925160000_add_search_text,
-- rebuilt from the new searchTextSql() — test/unit/search.test.mjs checks this
-- file holds it.
DROP TRIGGER IF EXISTS "billboards_search_text_insert";
DROP TRIGGER IF EXISTS "billboards_search_text_update";

UPDATE "billboards" SET "searchText" = lower(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace("name" || ' ' || "city" || ' ' || "location" || ' ' || "agency", 'ي', 'ی'), 'ى', 'ی'), 'ك', 'ک'), 'ة', 'ه'), 'ۀ', 'ه'), 'آ', 'ا'), 'أ', 'ا'), 'إ', 'ا'), 'ـ', ''), char(8204), ' '), '۰', '0'), '۱', '1'), '۲', '2'), '۳', '3'), '۴', '4'), '۵', '5'), '۶', '6'), '۷', '7'), '۸', '8'), '۹', '9'), '٠', '0'), '١', '1'), '٢', '2'), '٣', '3'), '٤', '4'), '٥', '5'), '٦', '6'), '٧', '7'), '٨', '8'), '٩', '9'));

CREATE TRIGGER "billboards_search_text_insert" AFTER INSERT ON "billboards"
BEGIN
  UPDATE "billboards" SET "searchText" = lower(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace("name" || ' ' || "city" || ' ' || "location" || ' ' || "agency", 'ي', 'ی'), 'ى', 'ی'), 'ك', 'ک'), 'ة', 'ه'), 'ۀ', 'ه'), 'آ', 'ا'), 'أ', 'ا'), 'إ', 'ا'), 'ـ', ''), char(8204), ' '), '۰', '0'), '۱', '1'), '۲', '2'), '۳', '3'), '۴', '4'), '۵', '5'), '۶', '6'), '۷', '7'), '۸', '8'), '۹', '9'), '٠', '0'), '١', '1'), '٢', '2'), '٣', '3'), '٤', '4'), '٥', '5'), '٦', '6'), '٧', '7'), '٨', '8'), '٩', '9')) WHERE "id" = NEW."id";
END;

CREATE TRIGGER "billboards_search_text_update" AFTER UPDATE OF "name", "city", "location", "agency" ON "billboards"
BEGIN
  UPDATE "billboards" SET "searchText" = lower(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace("name" || ' ' || "city" || ' ' || "location" || ' ' || "agency", 'ي', 'ی'), 'ى', 'ی'), 'ك', 'ک'), 'ة', 'ه'), 'ۀ', 'ه'), 'آ', 'ا'), 'أ', 'ا'), 'إ', 'ا'), 'ـ', ''), char(8204), ' '), '۰', '0'), '۱', '1'), '۲', '2'), '۳', '3'), '۴', '4'), '۵', '5'), '۶', '6'), '۷', '7'), '۸', '8'), '۹', '9'), '٠', '0'), '١', '1'), '٢', '2'), '٣', '3'), '٤', '4'), '٥', '5'), '٦', '6'), '٧', '7'), '٨', '8'), '٩', '9')) WHERE "id" = NEW."id";
END;
