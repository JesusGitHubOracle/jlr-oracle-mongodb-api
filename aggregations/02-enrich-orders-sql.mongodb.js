const database = "json_aggregations";
use(database);

db.sink_proj_orders.drop();
db.sink_proj_products_v1.drop();
db.sink_proj_warehouses_v1.drop();

db.sink_proj_orders.insertOne({
  "_id": ObjectId("66aaee001122334455667788"),
  "__pk": 12345,
  "value": { "product_id": "P42", "region": "WEST" }
});

db.sink_proj_products_v1.insertOne({
  "_id": ObjectId("66aaee001122334455667789"),
  "value": { "product_id": "P42", "description": "Test Product" }
});

db.sink_proj_warehouses_v1.insertOne({
  "_id": ObjectId("66aaee001122334455667790"),
  "value": { "region": "WEST", "warehouse": "Main West Warehouse" }
});

const pipeline = 
[
  {
    $match: {
      __pk: 12345
    }
  },
  {
    $sql: {
      input: "orders",
      statement: `
        select json_mergepatch(
          data, 
          json {
            'd-products_v1' : [
               select data
               from sink_proj_products_v1 p
               where p.data.value.product_id = o.data.value.product_id 
            ]
          }
        )
        from "orders" o
      `
    }
  },
  {
    $project: {
      "d-products_v1._id": 0
    }
  },
  {
    $sql : {
      input: "order_prod",
      statement: `
          select json_mergepatch(
          data, 
          json {
            'd-warehouses_v1' : [
               select data
               from sink_proj_warehouses_v1 p
               where p.data.value.region = o.data.value.region
            ]
          }
        )
        from "order_prod" o
      `
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
      "dependencies.products_v1":
        "$d-products_v1",
      "dependencies.warehouses_v1":
        "$d-warehouses_v1"
    }
  },
  {
    $unset: ["d-products_v1", "d-warehouses_v1"]
  },
  {
    $merge: {
      into: "sink_proj_orders",
     on: "_id",
      whenMatched: "merge",
      whenNotMatched: "fail"
    }
  }
]

db.sink_proj_orders.aggregate(pipeline);

db.sink_proj_orders.find();