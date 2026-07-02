-- -----------------------------------------------------------------------------
-- Oracle JSON search demo user setup
-- -----------------------------------------------------------------------------
-- Run with SQLcl or SQL*Plus.
--
-- What this script does:
--   1. Connects as ADMIN.
--   2. Recreates the JSON_SEARCH demo user.
--   3. Grants the roles needed for Oracle Database API for MongoDB.
--   4. Enables ORDS for the demo user.
--   5. Grants access needed for object storage loads and Oracle Text indexes.
--   6. Reconnects as JSON_SEARCH.
--   7. Creates a DBMS_CLOUD credential for loading JSON demo data.
--
-- Password prompts include a demo default to minimize typing during live demos.
--
-- The TLS connection descriptor is defined in this script so it can be run
-- directly from VS Code without extra arguments.
-- -----------------------------------------------------------------------------

SET DEFINE ON
SET ECHO OFF
SET FEEDBACK ON
SET SERVEROUTPUT ON
SET VERIFY OFF

DEFINE admin_user = admin
DEFINE demo_user = json_search
DEFINE demo_schema = JSON_SEARCH
DEFINE ords_url_mapping = json_search
DEFINE credential_name = ajd_cred
DEFINE tls_connection = (description=(retry_count=20)(retry_delay=3)(address=(protocol=tcps)(port=1521)(host=adb.eu-frankfurt-1.oraclecloud.com))(connect_data=(service_name=g5e60ebadf0d95a_ajd_medium.adb.oraclecloud.com))(security=(ssl_server_dn_match=yes)))

ACCEPT admin_password CHAR DEFAULT 'DB23ee###12345' PROMPT 'ADMIN password [default: DB23ee###12345]: ' HIDE
ACCEPT demo_password CHAR DEFAULT 'DB23ee###12345' PROMPT 'JSON_SEARCH password [default: DB23ee###12345]: ' HIDE

PROMPT
PROMPT === 1. Connect as ADMIN and create the search demo user ===

CONNECT &&admin_user/"&&admin_password"@&&tls_connection

DROP USER IF EXISTS &&demo_user CASCADE;

CREATE USER &&demo_user IDENTIFIED BY "&&demo_password";

-- CONNECT, RESOURCE, and SODA_APP are required for Oracle Database API for MongoDB.
-- DB_DEVELOPER_ROLE is convenient for SQL Developer / Database Actions demos.
GRANT CONNECT, RESOURCE, SODA_APP, DB_DEVELOPER_ROLE TO &&demo_user;

ALTER USER &&demo_user QUOTA UNLIMITED ON DATA;

PROMPT
PROMPT === 2. Enable ORDS for the search demo user ===

BEGIN
  ords_admin.enable_schema(
    p_enabled             => TRUE,
    p_schema              => '&&demo_schema',
    p_url_mapping_pattern => '&&ords_url_mapping'
  );

  COMMIT;
END;
/

DEFINE admin_user = admin
DEFINE demo_user = json_search
DEFINE demo_schema = JSON_SEARCH
DEFINE ords_url_mapping = json_search
DEFINE credential_name = ajd_cred

PROMPT
PROMPT === 3. Grant object storage and Oracle Text privileges ===

-- Required when loading JSON files from Object Storage through DBMS_CLOUD.
GRANT EXECUTE ON DBMS_CLOUD TO &&demo_user;
GRANT READ, WRITE ON DIRECTORY data_pump_dir TO &&demo_user;

-- Required for Oracle Text indexes used behind MongoDB API $search.
GRANT CTXAPP TO &&demo_user;

PROMPT
PROMPT === 4. Reconnect as JSON_SEARCH and create DBMS_CLOUD credential ===

CONNECT &&demo_user/"&&demo_password"@&&tls_connection

BEGIN
  DBMS_CLOUD.drop_credential(
    credential_name => '&&credential_name'
  );
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
/

BEGIN
  DBMS_CLOUD.create_credential(
    credential_name => '&&credential_name',
    username        => '&&demo_schema',
    password        => '&&demo_password'
  );
END;
/

PROMPT
PROMPT === Search demo user setup complete ===


GRANT CREATE MINING MODEL TO json_search;
GRANT EXECUTE ON DBMS_VECTOR TO json_search;


