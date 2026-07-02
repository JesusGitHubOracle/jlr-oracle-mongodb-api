
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
 


const pipeline = [
  {
    $set: {
      plantObjectIds : {
        $map: {
          input: {
            "$split": [
              "$meta.hierarchy.parents.loc_plants",
              ","
            ]
          },
          in: { "$toObjectId": "$$this" }
        }
      }
    }
  },
  {
    $sql: `
      select json_mergepatch(
        i.data, 
        json {
          'plants' : [
            select p.data
            from loc_plants p 
            where json_exists(i.data, '$?(@.plantObjectIds == $b1)' passing p.data."_id" as "b1")
          ]
        }
      )
      from input i
    `
  },
  {
    "$project": {
      "plant": {
        "$arrayElemAt": [
          "$plants",
          0
        ]
      },
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

 db.loc_facilities.aggregate(pipeline);



db.createView("v_map_atlas_facility_sap_plant", "loc_facilities", pipeline);
db.v_map_atlas_facility_sap_plant.find();

/*
 {
    _id: ObjectId('698ca92801bc73e61d8034b2'),
    plant: 'Plant A',
    facility: 'Facility 1',
    facility_atlas: 'FAC1_ATLAS',
    plant_atlas: 'PLANT_A_ATLAS',
    plant_sap: 'SAP_A'
  },
  {
    _id: ObjectId('698ca92801bc73e61d8034b3'),
    plant: 'Plant C',
    facility: 'Facility 2',
    facility_atlas: 'FAC2_ATLAS',
    plant_atlas: 'PLANT_C_ATLAS',
    plant_sap: 'SAP_C'
  },
  {
    _id: ObjectId('698ca92801bc73e61d8034b4'),
    facility: 'Facility 3 (no matching plant)',
    facility_atlas: 'FAC3_ATLAS'
  }
]
*/ 

