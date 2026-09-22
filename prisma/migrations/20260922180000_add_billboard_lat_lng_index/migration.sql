-- The radial search (boundingBox, lib/db/billboards.ts) and getMapPins both
-- filter on lat/lng but had no index covering either column, so the box
-- comparison ran as a residual filter over a full table scan — harmless at
-- today's row count, but the query plan didn't match what the code's own
-- comment claimed ("this box narrows the table in the query").
CREATE INDEX "billboards_lat_lng_idx" ON "billboards"("lat", "lng");
