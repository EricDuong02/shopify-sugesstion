/*
  This migration is intentionally fail-fast. Legacy recommender ownership and
  product membership must be auditable before the destructive drop below.
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "OfferProduct"
    WHERE "shopId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot remove ListProduct: OfferProduct rows still have NULL shopId';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ListProduct" lp
    LEFT JOIN "OfferProduct" op
      ON op."id" = lp."offerProductId"
     AND op."shopId" = lp."shopId"
    WHERE lp."offerProductId" IS NULL
       OR lp."shopId" IS NULL
       OR op."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot remove ListProduct: legacy rows have incomplete or mismatched ownership';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ListProduct" lp
    LEFT JOIN "CatalogProduct" cp
      ON cp."shopId" = lp."shopId"
     AND cp."shopifyProductId" = regexp_replace(lp."idProduct", '^.*/', '')
    WHERE regexp_replace(lp."idProduct", '^.*/', '') = ''
       OR cp."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot remove ListProduct: legacy rows cannot be matched to CatalogProduct';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "OfferProductItem" item
    LEFT JOIN "OfferProduct" offer
      ON offer."id" = item."offerProductId"
    WHERE offer."id" IS NULL
       OR offer."shopId" IS NULL
       OR offer."shopId" <> item."shopId"
  ) THEN
    RAISE EXCEPTION 'Cannot remove ListProduct: existing OfferProductItem ownership is inconsistent';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        lp."offerProductId",
        lp."shopId",
        regexp_replace(lp."idProduct", '^.*/', '') AS "shopifyProductId",
        COUNT(*) AS row_count
      FROM "ListProduct" lp
      WHERE lp."offerProductId" IS NOT NULL
        AND lp."shopId" IS NOT NULL
      GROUP BY lp."offerProductId", lp."shopId", regexp_replace(lp."idProduct", '^.*/', '')
      HAVING COUNT(*) > 1
    ) duplicates
  ) THEN
    RAISE EXCEPTION 'Cannot remove ListProduct: normalized legacy product IDs collide';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ListProduct" lp
    JOIN "OfferProductItem" item
      ON item."offerProductId" = lp."offerProductId"
     AND item."shopId" = lp."shopId"
     AND item."shopifyProductId" = regexp_replace(lp."idProduct", '^.*/', '')
  ) THEN
    RAISE EXCEPTION 'Cannot remove ListProduct: legacy rows collide with existing OfferProductItem rows';
  END IF;
END $$;

INSERT INTO "OfferProductItem"
  ("offerProductId", "shopId", "shopifyProductId", "source", "createdAt", "updatedAt")
SELECT
  lp."offerProductId",
  lp."shopId",
  regexp_replace(lp."idProduct", '^.*/', ''),
  'legacy_list_product',
  NOW(),
  NOW()
FROM "ListProduct" lp
JOIN "CatalogProduct" cp
  ON cp."shopId" = lp."shopId"
 AND cp."shopifyProductId" = regexp_replace(lp."idProduct", '^.*/', '')
WHERE lp."offerProductId" IS NOT NULL
  AND lp."shopId" IS NOT NULL
  AND regexp_replace(lp."idProduct", '^.*/', '') <> ''
ON CONFLICT ("offerProductId", "shopId", "shopifyProductId") DO NOTHING;

ALTER TABLE "OfferProductItem"
DROP CONSTRAINT "OfferProductItem_offerProductId_fkey";

ALTER TABLE "OfferProduct"
ALTER COLUMN "shopId" SET NOT NULL;

ALTER TABLE "OfferProduct"
ADD CONSTRAINT "OfferProduct_id_shopId_key" UNIQUE ("id", "shopId");

ALTER TABLE "OfferProductItem"
ADD CONSTRAINT "OfferProductItem_offerProductId_shopId_fkey"
FOREIGN KEY ("offerProductId", "shopId")
REFERENCES "OfferProduct"("id", "shopId")
ON DELETE CASCADE;

ALTER TABLE "ListProduct"
DROP CONSTRAINT "ListProduct_offerProductId_fkey";

DROP TABLE "ListProduct";

DROP TYPE "Status";
