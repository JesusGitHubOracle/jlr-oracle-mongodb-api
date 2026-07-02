
const database = "json_aggregations";
use(database);

db.loc_facilities.drop();
db.loc_plants.drop();
db.v_map_atlas_facility_sap_plant.drop();
 


const plantAId = ObjectId("64b64c6a2f7d3a3d0a000001");
const plantBId = ObjectId("64b64c6a2f7d3a3d0a000002");
const plantCId = ObjectId("64b64c6a2f7d3a3d0a000003");

db.loc_plants.insertMany([
  {
    _id: plantAId,
    plant_name: "Plant A",
    meta: { mapping: { atlas: "PLANT_A_ATLAS", sap: "SAP_A" } }
  },
  {
    _id: plantBId,
    plant_name: "Plant B",
    meta: { mapping: { atlas: "PLANT_B_ATLAS", sap: "SAP_B" } }
  },
  {
    _id: plantCId,
    plant_name: "Plant C",
    meta: { mapping: { atlas: "PLANT_C_ATLAS", sap: "SAP_C" } }
  }
]);

db.loc_facilities.insertMany([
  {
    facility_name: "Facility 1",
    meta: {
      mapping: { atlas: "FAC1_ATLAS" },
      hierarchy: {
        parents: {
          loc_plants: "64b64c6a2f7d3a3d0a000001,64b64c6a2f7d3a3d0a000002"
        }
      }
    }
  },
  {
    facility_name: "Facility 2",
    meta: {
      mapping: { atlas: "FAC2_ATLAS" },
      hierarchy: {
        parents: {
          loc_plants: "64b64c6a2f7d3a3d0a000003"
        }
      }
    }
  },
  {
    facility_name: "Facility 3 (no matching plant)",
    meta: {
      mapping: { atlas: "FAC3_ATLAS" },
      hierarchy: {
        parents: {
          loc_plants: "64b64c6a2f7d3a3d0a0000ff"
        }
      }
    }
  }
]);
 




db.createView(
  "v_map_atlas_facility_sap_plant",
  "loc_facilities",
  [
    // Stage 1: Create an array of plant ID strings. If the source field is null, default to an empty array.
    {
      "$addFields": {
        "plantIdStrings": {
          "$ifNull": [
            { "$split": ["$meta.hierarchy.parents.loc_plants", ","] },
            [] // Default to empty array
          ]
        } 
      }
    },
    // Stage 2: Unwind the array of ID strings.
    {
      "$unwind": {
        "path": "$plantIdStrings",
        "preserveNullAndEmptyArrays": true // Keeps documents even if the array is empty
      }
    },
    // Stage 3: Convert the string to an ObjectId.
    {
      "$addFields": {
        // Only attempt conversion if the field is not null
        "plantObjectId": {
          "$cond": {
            "if": "$plantIdStrings",
            "then": { "$toObjectId": "$plantIdStrings" },
            "else": null
          }
        }
      }
    },
    // Stage 4: Perform the simple one-to-one lookup.
    {
      "$lookup": {
        "from": "loc_plants",
        "localField": "plantObjectId",
        "foreignField": "_id",
        "as": "plant_doc"
      }
    },
    // Stage 5: Unwind the lookup result, keeping documents that have no match.
    {
      "$unwind": {
        "path": "$plant_doc",
        "preserveNullAndEmptyArrays": true // CRITICAL: Prevents dropping docs with no plant match
      }
    },
    // Stage 6: Group the documents back together by the original facility ID.
    {
      "$group": {
        "_id": "$_id",
        // Only add the plant_doc to the array if the lookup was successful
        "plants": { "$addToSet": "$plant_doc" },
        // Restore the original fields from the facility document
        "facility_name": { "$first": "$facility_name" },
        "meta": { "$first": "$meta" }
      }
    },
    // Stage 7: Remove null lookup results while preserving all matching plants.
    {
      "$addFields": {
        "plants": {
          "$filter": {
            "input": "$plants",
            "as": "plant",
            "cond": { "$not": [{ "$in": ["$$plant", [null, {}]] }] }
          }
        }
      }
    },
    // Stage 8: Preserve one output row for each facility-to-plant mapping.
    {
      "$unwind": {
        "path": "$plants",
        "preserveNullAndEmptyArrays": true
      }
    },
    // Stage 9 & 10: final projection stages.
    {
      "$project": {
        "plant": "$plants",
        "facility": "$facility_name",
        "facility_atlas": "$meta.mapping.atlas"
      }
    },
    {
      "$project": {
        "plant": "$plant.plant_name",
        "plant_atlas": "$plant.meta.mapping.atlas",
        "plant_sap": "$plant.meta.mapping.sap",
        "facility": "$facility",
        "facility_atlas": "$facility_atlas"
      }
    }
  ]
);
db.v_map_atlas_facility_sap_plant.find();

/*[
  {
    _id: ObjectId('698c57ce47893319fd58cf0f'),
    plant: 'Plant A',
    facility: 'Facility 1',
    facility_atlas: 'FAC1_ATLAS',
    plant_atlas: 'PLANT_A_ATLAS',
    plant_sap: 'SAP_A'
  },
  {
    _id: ObjectId('698c57ce47893319fd58cf0f'),
    plant: 'Plant B',
    facility: 'Facility 1',
    facility_atlas: 'FAC1_ATLAS',
    plant_atlas: 'PLANT_B_ATLAS',
    plant_sap: 'SAP_B'
  },
  {
    _id: ObjectId('698c57ce47893319fd58cf10'),
    plant: 'Plant C',
    facility: 'Facility 2',
    facility_atlas: 'FAC2_ATLAS',
    plant_atlas: 'PLANT_C_ATLAS',
    plant_sap: 'SAP_C'
  },
  {
    _id: ObjectId('698c57ce47893319fd58cf11'),
    facility: 'Facility 3 (no matching plant)',
    facility_atlas: 'FAC3_ATLAS'
  }
]

*/ 
