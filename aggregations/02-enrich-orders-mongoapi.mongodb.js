

/*
 * Enriched orders script for MongoDB API for Oracle Database. 
 * This script runs the MongoDB aggregation pipeline that enriches orders with related product and warehouse metadata.
 * Use mongosh or MongoDB for VS Code Extension connected to the Oracle Database with the MongoDB API.
*/

use("json_aggregations");

// Reset the demo collections.
db.orders.drop();
db.products_v1.drop();
db.warehouses_v1.drop();

// Load orders.
db.orders.insertMany([
  {
    _id: ObjectId("66aaee001122334455667788"),
    __pk: 12345,
    value: { product_id: "P42", region: "WEST" }
  },
  {
    _id: ObjectId("66aaee001122334455667789"),
    __pk: 12346,
    value: { product_id: "P01", region: "NORTH" }
  },
  {
    _id: ObjectId("66aaee001122334455667790"),
    __pk: 12347,
    value: { product_id: "P13", region: "EAST" }
  },
  {
    _id: ObjectId("66aaee001122334455667791"),
    __pk: 12348,
    value: { product_id: "P25", region: "SOUTH" }
  },
  {
    _id: ObjectId("66aaee001122334455667792"),
    __pk: 12349,
    value: { product_id: "P30", region: "WEST" }
  }
]);

// Load product reference data.
db.products_v1.insertMany([
  {
    _id: ObjectId("66aaee001122334455667793"),
    value: { product_id: "P42", description: "Test Product" }
  },
  {
    _id: ObjectId("66aaee001122334455667794"),
    value: { product_id: "P01", description: "Stapler" }
  },
  {
    _id: ObjectId("66aaee001122334455667795"),
    value: { product_id: "P13", description: "Notebook" }
  },
  {
    _id: ObjectId("66aaee001122334455667796"),
    value: { product_id: "P25", description: "Laptop Case" }
  },
  {
    _id: ObjectId("66aaee001122334455667797"),
    value: { product_id: "P30", description: "Wireless Mouse" }
  }
]);

// Load warehouse reference data.
db.warehouses_v1.insertMany([
  {
    _id: ObjectId("66aaee001122334455667798"),
    value: { region: "WEST", warehouse: "Main West Warehouse" }
  },
  {
    _id: ObjectId("66aaee001122334455667799"),
    value: { region: "NORTH", warehouse: "North Distribution Center" }
  },
  {
    _id: ObjectId("66aaee001122334455667800"),
    value: { region: "EAST", warehouse: "East Hub" }
  },
  {
    _id: ObjectId("66aaee001122334455667801"),
    value: { region: "SOUTH", warehouse: "South Warehouse" }
  }
]);

/*
 * Enrich the order with __pk 12345.
 *
 * The pipeline uses $lookup with let/$expr to join by nested JSON attributes:
 *   - orders.value.product_id -> products_v1.value.product_id
 *   - orders.value.region     -> warehouses_v1.value.region
 *
 * The related documents are stored under a dependencies object and merged back
 * into the original order document.
 */
const pipeline = [
  {
    $match: {
      __pk: 12345
    }
  },
  {
    $lookup: {
      from: "products_v1",
      let: { value_product_id: "$value.product_id" },
      pipeline: [
        {
          $match: {
            $expr: {
              $eq: ["$value.product_id", "$$value_product_id"]
            }
          }
        }
      ],
      as: "d-products_v1"
    }
  },
  {
    $project: {
      "d-products_v1._id": 0
    }
  },
  {
    $lookup: {
      from: "warehouses_v1",
      let: { value_region: "$value.region" },
      pipeline: [
        {
          $match: {
            $expr: {
              $eq: ["$value.region", "$$value_region"]
            }
          }
        }
      ],
      as: "d-warehouses_v1"
    }
  },
  {
    $project: {
      "d-warehouses_v1._id": 0
    }
  },
  {
    $unset: "dependencies"
  },
  {
    $set: {
      "dependencies.products_v1": "$d-products_v1",
      "dependencies.warehouses_v1": "$d-warehouses_v1"
    }
  },
  {
    $unset: ["d-products_v1", "d-warehouses_v1"]
  },
  {
    $merge: {
      into: "orders",
      on: "_id",
      whenMatched: "merge",
      whenNotMatched: "fail"
    }
  }
];

db.orders.aggregate(pipeline);

// Show the enriched order as relaxed JSON, so numeric BSON types print plainly.
const enrichedOrder = db.orders.findOne({ __pk: 12345 }, { _id: 0 });
JSON.parse(EJSON.stringify(enrichedOrder, null, 2, { relaxed: true }));


/* 
The output should look like this:
{
  __pk: NumberInt('12345'),
  value: {
    product_id: 'P42',
    region: 'WEST'
  },
  dependencies: {
    products_v1: [
      {
        value: {
          product_id: 'P42',
          description: 'Test Product'
        }
      }
    ],
    warehouses_v1: [
      {
        value: {
          region: 'WEST',
          warehouse: 'Main West Warehouse'
        }
      }
    ]
  }
}

*/
