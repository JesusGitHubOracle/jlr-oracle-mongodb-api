use("json_aggregations");
//use ("admin");
db.xs_orders.drop();
db.xs_orders.insertOne({
  customerId: 123,
  status: "created",
  total: 42.5
});
use("json_aggregations");
db.xs_orders.updateOne(
  { customerId: 123 },
  { $set: { status: "paid" } }
);


// grant create notification directive to json_aggregations;