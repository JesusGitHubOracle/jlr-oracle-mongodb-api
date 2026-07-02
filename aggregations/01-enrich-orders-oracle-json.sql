-- -----------------------------------------------------------------------------
-- Oracle JSON enriched orders script
-- -----------------------------------------------------------------------------
-- Run with SQLcl,  SQL*Plus, SQLDeveloper extension for VS Code .
--
-- Connect as json_aggregations, then run this script to:

--   1. Create Oracle JSON collection tables.
--   2. Load sample orders, products, and warehouses documents.
--   3. Run simple Oracle JSON validation queries.
-- -----------------------------------------------------------------------------

SET DEFINE ON
SET ECHO ON
SET FEEDBACK ON
SET LONG 1000000
SET LONGCHUNKSIZE 1000000
SET LINESIZE 200
SET SERVEROUTPUT ON
SET VERIFY OFF


PROMPT
PROMPT === 1. Drop and recreate JSON collection tables ===

DROP TABLE IF EXISTS orders PURGE;
DROP TABLE IF EXISTS products_v1 PURGE;
DROP TABLE IF EXISTS warehouses_v1 PURGE; 

CREATE JSON COLLECTION TABLE products_v1;
CREATE JSON COLLECTION TABLE warehouses_v1;
CREATE JSON COLLECTION TABLE orders;

PROMPT
PROMPT === 2. Load sample JSON documents ===

INSERT INTO orders VALUES
  (JSON('{"_id":"66aaee001122334455667788","__pk":12345,"value":{"product_id":"P42","region":"WEST"}}'));

INSERT INTO orders VALUES
  (JSON('{"_id":"66aaee001122334455667789","__pk":12346,"value":{"product_id":"P01","region":"NORTH"}}'));

INSERT INTO orders VALUES
  (JSON('{"_id":"66aaee001122334455667790","__pk":12347,"value":{"product_id":"P13","region":"EAST"}}'));

INSERT INTO orders VALUES
  (JSON('{"_id":"66aaee001122334455667791","__pk":12348,"value":{"product_id":"P25","region":"SOUTH"}}'));

INSERT INTO orders VALUES
  (JSON('{"_id":"66aaee001122334455667792","__pk":12349,"value":{"product_id":"P30","region":"WEST"}}'));

INSERT INTO products_v1 VALUES
  (JSON('{"_id":"66aaee001122334455667793","value":{"product_id":"P42","description":"Test Product"}}'));

INSERT INTO products_v1 VALUES
  (JSON('{"_id":"66aaee001122334455667794","value":{"product_id":"P01","description":"Stapler"}}'));

INSERT INTO products_v1 VALUES
  (JSON('{"_id":"66aaee001122334455667795","value":{"product_id":"P13","description":"Notebook"}}'));

INSERT INTO products_v1 VALUES
  (JSON('{"_id":"66aaee001122334455667796","value":{"product_id":"P25","description":"Laptop Case"}}'));

INSERT INTO products_v1 VALUES
  (JSON('{"_id":"66aaee001122334455667797","value":{"product_id":"P30","description":"Wireless Mouse"}}'));

INSERT INTO warehouses_v1 VALUES
  (JSON('{"_id":"66aaee001122334455667798","value":{"region":"WEST","warehouse":"Main West Warehouse"}}'));

INSERT INTO warehouses_v1 VALUES
  (JSON('{"_id":"66aaee001122334455667799","value":{"region":"NORTH","warehouse":"North Distribution Center"}}'));

INSERT INTO warehouses_v1 VALUES
  (JSON('{"_id":"66aaee001122334455667800","value":{"region":"EAST","warehouse":"East Hub"}}'));

INSERT INTO warehouses_v1 VALUES
  (JSON('{"_id":"66aaee001122334455667801","value":{"region":"SOUTH","warehouse":"South Warehouse"}}'));

COMMIT;

PROMPT
PROMPT === 6. Validate JSON collection contents ===

SELECT COUNT(*) AS order_count
FROM orders;

SELECT COUNT(*) AS product_count
FROM products_v1;

SELECT COUNT(*) AS warehouse_count
FROM warehouses_v1;

PROMPT
PROMPT ===3. Preview product dependencies as JSON ===

WITH dependencies_products AS (
  SELECT JSON_OBJECT(
           'products_v1' VALUE (
             SELECT JSON_ARRAYAGG(
                      JSON_OBJECT(
                        'value' VALUE JSON_OBJECT(
                          'product_id'  VALUE p.data.value.product_id,
                          'description' VALUE p.data.value.description
                        )
                      )
                      RETURNING JSON
                    )
             FROM products_v1 p
           )
           RETURNING JSON
         ) AS dependencies_p
)
SELECT dependencies_p
FROM dependencies_products;

PROMPT
PROMPT === 8. Preview warehouse dependencies as JSON ===

WITH dependencies_warehouses AS (
  SELECT JSON_OBJECT(
           'warehouses_v1' VALUE (
             SELECT JSON_ARRAYAGG(
                      JSON_OBJECT(
                        'value' VALUE JSON_OBJECT(
                          'region'    VALUE w.data.value.region,
                          'warehouse' VALUE w.data.value.warehouse
                        )
                      )
                      RETURNING JSON
                    )
             FROM warehouses_v1 w
           )
           RETURNING JSON
         ) AS dependencies_w
)
SELECT dependencies_w
FROM dependencies_warehouses;

PROMPT
PROMPT ===   enriched order document with Oracle SQL/JSON ===

COLUMN enriched_order FORMAT A120 WORD_WRAPPED
SET HEADING OFF
SET LONG 1000000
SET LONGCHUNKSIZE 1000000
SET LINESIZE 200

WITH enriched_order AS (
  SELECT JSON_OBJECT(
           '__pk' VALUE JSON_VALUE(
             o.data,
             '$.__pk'
             RETURNING NUMBER
           ),
           'value' VALUE JSON_OBJECT(
             'product_id' VALUE JSON_VALUE(
               o.data,
               '$.value.product_id'
             ),
             'region' VALUE JSON_VALUE(
               o.data,
               '$.value.region'
             )
           ),
           'dependencies' VALUE JSON_OBJECT(
             'products_v1' VALUE (
               SELECT JSON_ARRAYAGG(
                        JSON_OBJECT(
                          'value' VALUE JSON_OBJECT(
                            'product_id' VALUE JSON_VALUE(
                              p.data,
                              '$.value.product_id'
                            ),
                            'description' VALUE JSON_VALUE(
                              p.data,
                              '$.value.description'
                            )
                          )
                        )
                        RETURNING JSON
                      )
               FROM products_v1 p
               WHERE JSON_VALUE(p.data, '$.value.product_id') =
                     JSON_VALUE(o.data, '$.value.product_id')
             ),
             'warehouses_v1' VALUE (
               SELECT JSON_ARRAYAGG(
                        JSON_OBJECT(
                          'value' VALUE JSON_OBJECT(
                            'region' VALUE JSON_VALUE(
                              w.data,
                              '$.value.region'
                            ),
                            'warehouse' VALUE JSON_VALUE(
                              w.data,
                              '$.value.warehouse'
                            )
                          )
                        )
                        RETURNING JSON
                      )
               FROM warehouses_v1 w
               WHERE JSON_VALUE(w.data, '$.value.region') =
                     JSON_VALUE(o.data, '$.value.region')
             )
           )
           RETURNING JSON
         ) AS document
  FROM orders o
  WHERE JSON_VALUE(
          o.data,
          '$.__pk'
          RETURNING NUMBER
        ) = 12345
)
SELECT JSON_SERIALIZE(document RETURNING CLOB PRETTY) AS enriched_order
FROM enriched_order;

SET HEADING ON

/* Expected output:

{
  "__pk" : 12345,
  "value" :
  {
    "product_id" : "P42",
    "region" : "WEST"
  },
  "dependencies" :
  {
    "products_v1" :
    [
      {
        "value" :

        {
          "product_id" : "P42",
          "description" : "Test Product"
        }
      },
      {
        "value" :
        {
          "product_id" : "P42",
          "description" : "Test Product"
        }
      }
    ],

    "warehouses_v1" :
    [
      {
        "value" :
        {
          "region" : "WEST",
          "warehouse" : "Main West Warehouse"
        }
      },
      {
        "value" :
        {
          "region" : "WEST",

          "warehouse" : "Main West Warehouse"
        }
      }
    ]
  }
}

{
  "__pk" : 12345,
  "value" :
  {
    "product_id" : "P42",
    "region" : "WEST"

  },
  "dependencies" :
  {
    "products_v1" :
    [
      {
        "value" :
        {
          "product_id" : "P42",
          "description" : "Test Product"
        }
      },
      {

        "value" :
        {
          "product_id" : "P42",
          "description" : "Test Product"
        }
      }
    ],
    "warehouses_v1" :
    [
      {
        "value" :
        {
          "region" : "WEST",

          "warehouse" : "Main West Warehouse"
        }
      },
      {
        "value" :
        {
          "region" : "WEST",
          "warehouse" : "Main West Warehouse"
        }
      }
    ]
  }
}
*/