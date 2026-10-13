DO $$
DECLARE
  invalid_rows INTEGER;
  invalid_ids TEXT;
BEGIN
  SELECT COUNT(*), string_agg("id"::TEXT, ', ' ORDER BY "id")
  INTO invalid_rows, invalid_ids
  FROM "TriggerProduct"
  WHERE "pageIds" IS NOT NULL
    AND (
      array_position("pageIds", NULL) IS NOT NULL
      OR EXISTS (
        SELECT 1
        FROM unnest("pageIds") AS page_id
        WHERE page_id IS NULL OR page_id NOT IN (1, 2, 3, 4)
      )
      OR cardinality("pageIds") <> (
        SELECT COUNT(DISTINCT page_id)
        FROM unnest("pageIds") AS page_id
      )
    );

  IF invalid_rows > 0 THEN
    RAISE EXCEPTION
      'TriggerProduct.pageIds contains % invalid rows (IDs: %); expected unique non-null values from 1, 2, 3, 4',
      invalid_rows,
      invalid_ids;
  END IF;
END $$;

UPDATE "TriggerProduct"
SET "pageIds" = ARRAY[]::INTEGER[]
WHERE "pageIds" IS NULL;

ALTER TABLE "TriggerProduct"
ALTER COLUMN "pageIds" SET DEFAULT ARRAY[]::INTEGER[],
ALTER COLUMN "pageIds" SET NOT NULL;

ALTER TABLE "TriggerProduct"
ADD CONSTRAINT "TriggerProduct_pageIds_valid_check"
CHECK (
  array_position("pageIds", NULL) IS NULL
  AND "pageIds" <@ ARRAY[1, 2, 3, 4]::INTEGER[]
  AND cardinality(array_positions("pageIds", 1)) <= 1
  AND cardinality(array_positions("pageIds", 2)) <= 1
  AND cardinality(array_positions("pageIds", 3)) <= 1
  AND cardinality(array_positions("pageIds", 4)) <= 1
);
