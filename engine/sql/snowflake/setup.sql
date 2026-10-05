-- FitCheck on Snowflake: run top to bottom in a Snowsight SQL worksheet as ACCOUNTADMIN.
-- Safe to run again: every statement is IF NOT EXISTS or a repeatable grant.
-- Holds garment data only. Person photos never reach Snowflake (ADR 0003).

USE ROLE ACCOUNTADMIN;

-- Lets AI_COMPLETE reach models hosted outside this account's region, such as llama3.3-70b.
-- Organizations created after March 9, 2026 already default to ANY_REGION.
ALTER ACCOUNT SET CORTEX_ENABLED_CROSS_REGION = 'ANY_REGION';

-- Role, warehouse, database
CREATE ROLE IF NOT EXISTS FITCHECK;
SET FITCHECK_USER = CURRENT_USER();
GRANT ROLE FITCHECK TO USER IDENTIFIER($FITCHECK_USER);

CREATE WAREHOUSE IF NOT EXISTS FITCHECK_WH
  WAREHOUSE_SIZE = 'XSMALL'
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE
  INITIALLY_SUSPENDED = TRUE;
CREATE DATABASE IF NOT EXISTS FITCHECK;
CREATE SCHEMA IF NOT EXISTS FITCHECK.PUBLIC;

GRANT USAGE ON WAREHOUSE FITCHECK_WH TO ROLE FITCHECK;
GRANT USAGE ON DATABASE FITCHECK TO ROLE FITCHECK;
GRANT USAGE ON SCHEMA FITCHECK.PUBLIC TO ROLE FITCHECK;
GRANT CREATE TABLE, CREATE CORTEX SEARCH SERVICE ON SCHEMA FITCHECK.PUBLIC TO ROLE FITCHECK;
GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER TO ROLE FITCHECK;

-- Everything below is owned by FITCHECK, so the app role needs no further grants
USE ROLE FITCHECK;
USE WAREHOUSE FITCHECK_WH;
USE SCHEMA FITCHECK.PUBLIC;

-- One row per garment, tags flattened into columns; the key is (OWNER, ID)
CREATE TABLE IF NOT EXISTS GARMENTS (
    OWNER         VARCHAR       NOT NULL,
    ID            VARCHAR       NOT NULL,
    SOURCE        VARCHAR       NOT NULL,
    CATEGORY      VARCHAR       NOT NULL,
    COLOR_FAMILY  VARCHAR       NOT NULL,
    PATTERN       VARCHAR       NOT NULL,
    WARMTH        NUMBER(1, 0)  NOT NULL,
    WATERPROOF    BOOLEAN       NOT NULL,
    FORMALITY     NUMBER(1, 0)  NOT NULL,
    DESCRIPTION   VARCHAR       NOT NULL,
    PRICE         NUMBER(10, 2),
    WEARS         NUMBER(9, 0)  NOT NULL DEFAULT 0,
    IMAGE_REF     VARCHAR,
    SOURCE_URL    VARCHAR,
    CREATED_AT    TIMESTAMP_TZ  NOT NULL,
    CONSTRAINT GARMENTS_PK PRIMARY KEY (OWNER, ID)
)
COMMENT = 'FitCheck closet: garment records per owner, never a person photo';

-- Tables made before shop links were stored lack this column; a no-op once it exists
ALTER TABLE GARMENTS ADD COLUMN IF NOT EXISTS SOURCE_URL VARCHAR;

-- Cortex Search needs change tracking on its source table
ALTER TABLE GARMENTS SET CHANGE_TRACKING = TRUE;

-- Hybrid (vector + keyword) search over each owner's closet, filtered by OWNER.
-- SEARCH_TEXT matches the keyword text in engine/src/fitcheck/closet/snowflake.py.
-- One minute lag so a garment added during the demo is searchable almost at once.
CREATE CORTEX SEARCH SERVICE IF NOT EXISTS CLOSET_SEARCH
  ON SEARCH_TEXT
  ATTRIBUTES OWNER
  WAREHOUSE = FITCHECK_WH
  TARGET_LAG = '1 minute'
AS (
  SELECT
    OWNER,
    ID,
    CONCAT_WS(' ', CATEGORY, COLOR_FAMILY, PATTERN, DESCRIPTION) AS SEARCH_TEXT
  FROM GARMENTS
);

-- Smoke checks: both should return a row without error
SELECT AI_COMPLETE('llama3.3-70b', 'Reply with the single word ready.') AS CORTEX_CHECK;
SELECT SNOWFLAKE.CORTEX.SEARCH_PREVIEW(
  'FITCHECK.PUBLIC.CLOSET_SEARCH',
  '{"query": "navy wool", "columns": ["ID"], "limit": 3}'
) AS SEARCH_CHECK;
