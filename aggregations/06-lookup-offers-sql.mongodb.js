

 
 /*
This script demonstrates how to perform a lookup and aggregation between two collections in MongoDB using the $sql aggregarion stage in the MongoDB API for Oracle Database.
The goal is to enrich the offerSummary documents with aggregated data from the ifaOfferDaily100 collection based on matching criteria and time ranges.


This script creates two collections:
- offerSummary (serves as the parent/source collection for aggregation)
- ifaOfferDaily100 (serves as the lookup collection)

offerSummary contains two documents (OFF1001, OFF2002), representing offers in different countries and widget types, each with a date range.

ifaOfferDaily100 contains documents corresponding to impressions or actions for different offers and IFAs (device IDs) with various timestamps and attributes.

The aggregation pipeline looks up records from ifaOfferDaily100 that:
  - Match offerId, widgetType, and targetCountry with each offerSummary doc
  - Have "time" within the specific offer's [rangeFromTime, rangeToTime)
Matched records are grouped and aggregated in the output's "replacement" array.

*/


const database = 'json_aggregations';
const collection1 = 'offerSummary';
const collection2 = 'ifaOfferDaily100';

use (database);


// The current database to use.
use(database);

// Create a new collection.
db[collection1].drop();
db.createCollection(collection1);

db[collection2].drop();
db.createCollection(collection2);


db[collection1].insertMany(
  [
  {
    "_id": {
      "offerId": "OFF1001",
      "widgetType": "banner",
      "targetCountry": "US"
    },
    "rangeFromTime": ISODate("2024-06-01T00:00:00Z"),
    "rangeToTime": ISODate("2024-06-06T00:00:00Z")
  },
  {
    "_id": {
      "offerId": "OFF2002",
      "widgetType": "video",
      "targetCountry": "IN"
    },
    "rangeFromTime": ISODate("2024-06-02T00:00:00Z"),
    "rangeToTime": ISODate("2024-06-07T00:00:00Z")
  }
]
); 

db[collection2].insertMany([
  // Matching offerId/widgetType/targetCountry and time for the first source doc
  {
    "_id": {
      "offerId": "OFF1001",
      "widgetType": "banner",
      "targetCountry": "US",
      "ifa": "ifaX"
    },
    "weight": 1.2,
    "offerGroupId": "G100",
    "agencyId": "A1",
    "advertiserId": "ADV1",
    "demandDealId": "D1",
    "time": ISODate("2024-06-01T10:00:00Z")
  },
  {
    "_id": {
      "offerId": "OFF1001",
      "widgetType": "banner",
      "targetCountry": "US",
      "ifa": "ifaY"
    },
    "weight": 2.0,
    "offerGroupId": "G100",
    "agencyId": "A1",
    "advertiserId": "ADV1",
    "demandDealId": "D1",
    "time": ISODate("2024-06-02T15:10:00Z")
  },
  {
    "_id": {
      "offerId": "OFF1001",
      "widgetType": "banner",
      "targetCountry": "US",
      "ifa": "ifaZ"
    },
    "weight": 1.0,
    "offerGroupId": "G100",
    "agencyId": "A2",
    "advertiserId": "ADV2",
    "demandDealId": "D2",
    "time": ISODate("2024-06-02T18:00:00Z")
  },
  {
    "_id": {
      "offerId": "OFF1001",
      "widgetType": "banner",
      "targetCountry": "US",
      "ifa": "ifaX1"
    },
    "weight": 0.8,
    "offerGroupId": "G101",
    "agencyId": "A1",
    "advertiserId": "ADV1",
    "demandDealId": "D1",
    "time": ISODate("2024-06-05T08:30:00Z")
  },
  // OUTSIDE time range for first source doc
  {
    "_id": {
      "offerId": "OFF1001",
      "widgetType": "banner",
      "targetCountry": "US",
      "ifa": "ifaY1"
    },
    "weight": 1.5,
    "offerGroupId": "G103",
    "agencyId": "A1",
    "advertiserId": "ADV1",
    "demandDealId": "D1",
    "time": ISODate("2024-05-31T22:59:00Z")
  },
  // Matching different offerId/widgetType/targetCountry for the second source doc
  {
    "_id": {
      "offerId": "OFF2002",
      "widgetType": "video",
      "targetCountry": "IN",
      "ifa": "ifaA"
    },
    "weight": 2.2,
    "offerGroupId": "G200",
    "agencyId": "A2",
    "advertiserId": "ADV2",
    "demandDealId": "D2",
    "time": ISODate("2024-06-03T09:00:00Z")
  },
  {
    "_id": {
      "offerId": "OFF2002",
      "widgetType": "video",
      "targetCountry": "IN",
      "ifa": "ifaB"
    },
    "weight": 3.3,
    "offerGroupId": "G200",
    "agencyId": "A2",
    "advertiserId": "ADV2",
    "demandDealId": "D2",
    "time": ISODate("2024-06-05T22:10:00Z")
  },
  {
    "_id": {
      "offerId": "OFF2002",
      "widgetType": "video",
      "targetCountry": "IN",
      "ifa": "ifaC"
    },
    "weight": 1.7,
    "offerGroupId": "G201",
    "agencyId": "A3",
    "advertiserId": "ADV3",
    "demandDealId": "D3",
    "time": ISODate("2024-06-06T03:45:00Z")
  },
  // OUTSIDE range for second source doc
  {
    "_id": {
      "offerId": "OFF2002",
      "widgetType": "video",
      "targetCountry": "IN",
      "ifa": "ifaA1"
    },
    "weight": 2.8,
    "offerGroupId": "G202",
    "agencyId": "A2",
    "advertiserId": "ADV2",
    "demandDealId": "D2",
    "time": ISODate("2024-06-07T01:00:00Z")
  },
  // Non-matching offerId/widgetType/targetCountry
  {
    "_id": {
      "offerId": "OFF9999",
      "widgetType": "native",
      "targetCountry": "CA",
      "ifa": "ifaD"
    },
    "weight": 0.7,
    "offerGroupId": "G999",
    "agencyId": "A9",
    "advertiserId": "ADV9",
    "demandDealId": "D9",
    "time": ISODate("2024-06-04T11:11:00Z")
  }
])

// The aggregation pipeline to perform the lookup and transformation. 
const pipeline = [
    { 
      $sql : {
        statement: 
          `
          WITH source_rows AS (
            SELECT
              i.data AS offer_summary_data,

              (:toTime - INTERVAL '1' DAY) AS aggDate,
              o.data.time.dateTimeOnly() AS time,
              o.data.weight.numberOnly() AS weight,

              o.data.offerGroupId AS offerGroupId,
              o.data.agencyId AS agencyId,
              o.data.advertiserId AS advertiserId,
              o.data.demandDealId AS demandDealId,

              o.data."_id".offerId AS offerId,
              o.data."_id".widgetType AS widgetType,
              o.data."_id".targetCountry AS targetCountry,
              o.data."_id".ifa AS ifa
            FROM offerSummary i
            JOIN ifaOfferDaily100 o
              ON json_exists(
                  o.data,
                  '$?(@._id.offerId == $offerId
                      && @._id.widgetType == $widgetType
                      && @._id.targetCountry == $targetCountry
                      && @.time >= $rangeFromTime
                      && @.time < $rangeToTime)'
                  PASSING
                    i.data."_id"."offerId".stringOnly() AS "offerId",
                    i.data."_id"."widgetType".stringOnly() AS "widgetType",
                    i.data."_id"."targetCountry".stringOnly() AS "targetCountry",
                    i.data."rangeFromTime".dateTimeOnly() AS "rangeFromTime",
                    :toTime AS "rangeToTime"
                )
          ),
          ifa_rollup AS (
            SELECT
              offer_summary_data,
              aggDate,
              offerId,
              widgetType,
              targetCountry,
              ifa,

              MIN(time) AS minTime,
              MAX(time) AS maxTime,
              AVG(weight) AS weight,

              ANY_VALUE(offerGroupId) AS offerGroupId,
              ANY_VALUE(agencyId) AS agencyId,
              ANY_VALUE(advertiserId) AS advertiserId,
              ANY_VALUE(demandDealId) AS demandDealId
            FROM source_rows
            GROUP BY
              offer_summary_data,
              aggDate,
              offerId,
              widgetType,
              targetCountry,
              ifa
          ),
          offer_rollup AS (
            SELECT
              offer_summary_data,
              aggDate,
              offerId,
              widgetType,
              targetCountry,

              MIN(minTime) AS minTime,
              MAX(maxTime) AS maxTime,
              SUM(weight) AS reach,
              AVG(weight) AS avgEventWeight,
              MAX(weight) AS maxEventWeight,

              ANY_VALUE(offerGroupId) AS offerGroupId,
              ANY_VALUE(agencyId) AS agencyId,
              ANY_VALUE(advertiserId) AS advertiserId,
              ANY_VALUE(demandDealId) AS demandDealId
            FROM ifa_rollup
            GROUP BY
              offer_summary_data,
              aggDate,
              offerId,
              widgetType,
              targetCountry
          ),
          replacement_json AS (
            SELECT
              offer_summary_data,
              JSON_ARRAYAGG(
                JSON {
                  '_id' : {
                    aggDate,
                    offerId,
                    widgetType,
                    targetCountry
                  },
                  'minTime' : minTime,
                  'maxTime' : maxTime,
                  'reach' : reach,
                  'avgEventWeight' : avgEventWeight,
                  'maxEventWeight' : maxEventWeight,
                  'offerGroupId' : offerGroupId,
                  'agencyId' : agencyId,
                  'advertiserId' : advertiserId,
                  'demandDealId' : demandDealId
                }
                RETURNING JSON
              ) AS replacement
            FROM offer_rollup
            GROUP BY offer_summary_data
          )
          SELECT json_mergepatch(
                  offer_summary_data,
                  JSON {
                    'replacement' : replacement
                  }
                ) AS patched_document
          FROM replacement_json
        ` ,
        binds: {"toTime" : ISODate("2024-06-06T00:00:00Z") }
      }
    }
  ]


db.offerSummary.aggregate(pipeline);
 

// db.createView("v_offersummary", "offersummary", pipeline, {toTime: ISODate("2024-06-06T00:00:00Z")});
// db.v_offersummary.find();
