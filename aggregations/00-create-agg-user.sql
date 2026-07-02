-- -----------------------------------------------------------------------------
-- Oracle JSON user and sample data creation script 
-- -----------------------------------------------------------------------------
-- As Admin user, this script will:
--   1. Drop and recreate the JSON_AGGREGATIONS user.  
--   2. Enables ORDS for the user.
-- -----------------------------------------------------------------------------

SET DEFINE ON
SET ECHO OFF
SET FEEDBACK ON
SET LONG 1000000
SET LONGCHUNKSIZE 1000000
SET LINESIZE 200
SET SERVEROUTPUT ON
SET VERIFY OFF

DEFINE admin_user = admin
DEFINE demo_user = json_aggregations
DEFINE demo_schema = JSON_AGGREGATIONS
DEFINE ords_url_mapping = json_aggregations
 

ACCEPT admin_password CHAR DEFAULT 'DB23ee###12345' PROMPT 'ADMIN password [default: DB23ee###12345]: ' HIDE
ACCEPT demo_password CHAR DEFAULT 'DB23ee###12345' PROMPT 'JSON_AGGREGATIONS password [default: DB23ee###12345]: ' HIDE



DROP USER IF EXISTS &&demo_user CASCADE;

CREATE USER &&demo_user IDENTIFIED BY "&&demo_password";

GRANT CONNECT, RESOURCE, SODA_APP, DB_DEVELOPER_ROLE TO &&demo_user;

ALTER USER &&demo_user QUOTA UNLIMITED ON DATA;


PROMPT
PROMPT === 2. Enable ORDS for the demo user ===

BEGIN
  ords_admin.enable_schema(
    p_enabled             => TRUE,
    p_schema              => '&&demo_schema',
    p_url_mapping_pattern => '&&ords_url_mapping'
  );

  COMMIT;
END;
/

 