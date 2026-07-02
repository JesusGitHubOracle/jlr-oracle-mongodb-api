-- Creates a new Oracle JSON collection table with in-database embeddings.
--
-- Assumptions:
--   * The source JSON collection table is "mflix_movies".
--   * The target JSON collection table should be "mflix_movies_embeddings".
--   * The ONNX embedding model has been loaded in Oracle as ALL_MINILM_L12_V2.
--   * The model input column alias is DATA, which is the common alias for ONNX
--     text embedding models imported for VECTOR_EMBEDDING.
--
-- Edit the DEFINE values below if your schema, collection, or model name differs.
--
-- Run with SQLcl or SQL*Plus:
--   sql /nolog
--   SQL> connect <user>/<password>@<adb_service>
--   SQL> @create-mflix-plot-embeddings.sql

SET DEFINE ON
SET SERVEROUTPUT ON
SET TIMING ON

DEFINE source_schema = json_search
DEFINE source_collection = mflix_movies
DEFINE target_collection = mflix_movies_embeddings
DEFINE model_name = ALL_MINILM_L12_V2

DECLARE
  l_source_schema     VARCHAR2(128) := '&source_schema';
  l_source_collection VARCHAR2(128) := '&source_collection';
  l_target_collection VARCHAR2(128) := '&target_collection';
  l_model_name        VARCHAR2(128) := '&model_name';

  FUNCTION quote_ident(p_name VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    RETURN '"' || REPLACE(p_name, '"', '""') || '"';
  END;

  FUNCTION qualified_name(p_schema VARCHAR2, p_object VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    RETURN quote_ident(p_schema) || '.' || quote_ident(p_object);
  END;

  PROCEDURE drop_target_if_exists IS
  BEGIN
    EXECUTE IMMEDIATE 'DROP TABLE ' ||
      qualified_name(l_source_schema, l_target_collection) ||
      ' PURGE';
    DBMS_OUTPUT.PUT_LINE('Dropped existing target collection table.');
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLCODE = -942 THEN
        DBMS_OUTPUT.PUT_LINE('Target collection table does not exist yet.');
      ELSE
        RAISE;
      END IF;
  END;
BEGIN
  drop_target_if_exists;

  EXECUTE IMMEDIATE 'CREATE JSON COLLECTION TABLE ' ||
    qualified_name(l_source_schema, l_target_collection);

  DBMS_OUTPUT.PUT_LINE('Created target JSON collection table.');
  
  -- Insert documents with plot embeddings into the target collection table.
  EXECUTE IMMEDIATE '
    INSERT /*+ APPEND */ INTO ' || qualified_name(l_source_schema, l_target_collection) || ' (DATA)
    SELECT json_transform(
             m.DATA,
             SET ''$.plot_embedding'' =
               CASE
                 WHEN json_value(
                        m.DATA,
                        ''$.plot''
                        RETURNING VARCHAR2(4000)
                        NULL ON EMPTY
                        NULL ON ERROR
                      ) IS NOT NULL
                 THEN JSON(
                        vector_serialize(
                          vector_embedding(' || quote_ident(l_model_name) || ' USING
                            json_value(
                              m.DATA,
                              ''$.plot''
                              RETURNING VARCHAR2(4000)
                              NULL ON EMPTY
                              NULL ON ERROR
                            ) AS DATA
                          )
                          RETURNING CLOB
                        )
                      )
                 ELSE NULL
               END
           )
    FROM ' || qualified_name(l_source_schema, l_source_collection) || ' m';

  DBMS_OUTPUT.PUT_LINE(SQL%ROWCOUNT || ' documents inserted with plot_embedding.');

  COMMIT;
END;
/

PROMPT
PROMPT Validation counts
SELECT
  COUNT(*) AS total_documents,
  COUNT(
    CASE
      WHEN json_exists(DATA, '$.plot_embedding') THEN 1
    END
  ) AS documents_with_plot_embedding
FROM "&&source_schema"."&&target_collection";

PROMPT
PROMPT Full JSON document sample
SELECT
  json_serialize(DATA RETURNING CLOB PRETTY) AS document
FROM "&&source_schema"."&&target_collection"
WHERE json_exists(DATA, '$.plot_embedding')
FETCH FIRST 1 ROW ONLY;
