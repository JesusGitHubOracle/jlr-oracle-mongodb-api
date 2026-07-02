
//   
/* Performs a join between rx_orders and rx_products based on category.
Filters rx_products whose name starts with "widget" (case-insensitive) using $regexMatch within the $lookup sub-pipeline.
Populates each order with a matchingrx_products array.
*/

const database = "json_aggregations";
use(database);

db.rx_orders.drop();
db.rx_products.drop();

// Insert sample data for rx_orders
db.rx_orders.insertMany([
  {
    "_id": 1,
    "category": "electronics",
    "orderNumber": "ORD001"
  },
  {
    "_id": 2,
    "category": "toys",
    "orderNumber": "ORD002"
  }
]);

// Insert sample data for rx_products
db.rx_products.insertMany([
  {
    "_id": 10,
    "name": "WidgetMaster 3000",
    "category": "electronics"
  },
  {
    "_id": 11,
    "name": "widget Lite",
    "category": "electronics"
  },
  {
    "_id": 12,
    "name": "Gadget Pro",
    "category": "electronics"
  },
  {
    "_id": 13,
    "name": "WidgetToy",
    "category": "toys"
  },
  {
    "_id": 14,
    "name": "GameConsole",
    "category": "toys"
  }
]);

// Aggregation pipeline to join matching rx_products to each order
const pipeline = [
  {
    $lookup: {
      from: "rx_products", // The foreign collection to join with (rx_products)
      let: {
        order_category: "$category" // Pass the 'category' from the order as a variable
      },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                {
                  // Ensure the categories match between order and product
                  $eq: ["$category", "$$order_category"]
                },
                {
                  // Match product names that start with "widget" (case-insensitive)
                  $regexMatch: {
                    input: "$name",     // Source field to test the regex against
                    regex: "^widget",   // Regex pattern: starts with 'widget'
                    options: "i"        // 'i' for case-insensitive matching
                  }
                }
              ]
            }
          }
        }
      ],
      as: "matchingrx_products" // Output array field in the order documents
    }
  }
];

// Execute the aggregation pipeline
db.rx_orders.aggregate(pipeline).pretty();

 

/* Expected Result  
[
  {
    "_id": 1,
    "category": "electronics",
    "orderNumber": "ORD001",
    "matchingrx_products": [
      {
        "_id": 10,
        "name": "WidgetMaster 3000",
        "category": "electronics"
      },
      {
        "_id": 11,
        "name": "widget Lite",
        "category": "electronics"
      }
    ]
  },
  {
    "_id": 2,
    "category": "toys",
    "orderNumber": "ORD002",
    "matchingrx_products": [
      {
        "_id": 13,
        "name": "WidgetToy",
        "category": "toys"
      }
    ]
  }
]

*/