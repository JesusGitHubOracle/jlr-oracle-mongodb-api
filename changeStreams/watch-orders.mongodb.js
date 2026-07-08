// watch-orders.mongodb.js

use("json_aggregations");
//enable 

db.runCommand({collMod:"xs_orders", 
               preview: true, 
               enableChangeStream:{preAndPost:true}});
 

const changeStream = db.xs_orders.watch(
  [
    {
      $match: {
        operationType: {
          $in: ["insert", "update", "delete"]
        }
      }
    }
  ]
);

while (changeStream.hasNext()) {
  const change = changeStream.next()};