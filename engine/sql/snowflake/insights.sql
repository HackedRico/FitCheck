-- FitCheck closet insights: the data-app queries for the demo screen.
-- Run in a Snowsight worksheet after `fitcheck seed`. Change the owner on the next line.
USE ROLE FITCHECK;
USE WAREHOUSE FITCHECK_WH;
USE SCHEMA FITCHECK.PUBLIC;
SET OWNER = 'ricky';

-- Cost per wear, cheapest first; never-worn garments show NULL
SELECT ID, DESCRIPTION, PRICE, WEARS, ROUND(PRICE / NULLIF(WEARS, 0), 2) AS COST_PER_WEAR
FROM GARMENTS
WHERE OWNER = $OWNER AND PRICE IS NOT NULL
ORDER BY COST_PER_WEAR ASC NULLS LAST;

-- Most worn five
SELECT ID, DESCRIPTION, WEARS FROM GARMENTS
WHERE OWNER = $OWNER ORDER BY WEARS DESC, ID LIMIT 5;

-- Least worn five
SELECT ID, DESCRIPTION, WEARS FROM GARMENTS
WHERE OWNER = $OWNER ORDER BY WEARS ASC, ID LIMIT 5;

-- Garments per category, with what they cost and how often they get worn
SELECT CATEGORY, COUNT(*) AS GARMENTS, SUM(PRICE) AS SPENT, SUM(WEARS) AS WEARS
FROM GARMENTS
WHERE OWNER = $OWNER
GROUP BY CATEGORY
ORDER BY GARMENTS DESC;

-- AI summary of the closet with Cortex AI_AGG (summarization over many rows)
SELECT AI_AGG(
  CONCAT_WS(' ', COLOR_FAMILY, PATTERN, CATEGORY, DESCRIPTION, 'worn', WEARS, 'times'),
  'Summarize this closet in three sentences: what it has plenty of, what it lacks, and which pieces go unworn.'
) AS CLOSET_SUMMARY
FROM GARMENTS
WHERE OWNER = $OWNER;
