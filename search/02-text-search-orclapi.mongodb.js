/* global use, db */

/*
 * Oracle Database API for MongoDB: MFLIX text search demo.
 *
 * Assumptions before running:
 *   - The json_search user/database exists.
 *   - The mflix_movies collection has already been loaded.
 *   - A MongoDB API search index named title_idx exists on mflix_movies.
 *
 * The script demonstrates common $search patterns:
 *   1. Listing search indexes.
 *   2. Searching a single title term.
 *   3. Searching multiple title terms.
 *   4. Requiring all terms with matchCriteria: "all".
 *   5. Matching any term with matchCriteria: "any".
 *   6. Handling typos with fuzzy matching.
 */

// -----------------------------------------------------------------------------
// 1. Demo database and collection
// -----------------------------------------------------------------------------

const database = "json_search";
use(database);

// Load mflix_movies.json before running this demo. You can use MongoDB Compass,
// mongoimport, or your preferred MongoDB tooling.
// https://objectstorage.eu-frankfurt-1.oraclecloud.com/p/E_Hz1fFFFfbbIGstyg3beN0_WP6QQwwzATe_BsPXhCiGUeaSoH0WjLU7tBZnzglZ/n/fro8fl9kuqli/b/bucket-for-ajd-data/o/search/mflix_movies.json

// -----------------------------------------------------------------------------
// 2. Search index setup
// -----------------------------------------------------------------------------

// Create the search index if it does not already exist.
// Dynamic mappings index all searchable JSON fields. The preview flag is used by
// Oracle Database API for MongoDB preview search features.
//
// db.mflix_movies.createSearchIndex(
//   "title_idx",
//   { mappings: { dynamic: true }, preview: true }
// );

//db.mflix_movies_embeddings.createSearchIndex("plot_vec_idx", "vectorSearch", 
//    { fields: [ { type: "vector", path: "plot_embedding", numDimensions: 384, similarity: "cosine" }]
//   , preview: true }); 


// List search indexes and confirm that title_idx is READY/queryable.
db.mflix_movies.aggregate([{$listSearchIndexes:{"hint": { "$preview": 1 }} }]);

// -----------------------------------------------------------------------------
// 3. Text search examples with $search
// -----------------------------------------------------------------------------

// Basic title search: find movies whose title matches "Robbery".
db.mflix_movies.aggregate([
  {
    $search: {
      text: {
        path: "title",
        query: "Robbery"
      },
      hint: {"$preview": 1}
    }
  },
  {
    $project: {
      _id: 0,
      title: 1,
      year: 1,
      plot:1
    }
  }
]);

// Multi-term search: a user remembers multiple title words, but not necessarily
// the exact title or exact word order.
db.mflix_movies.aggregate([
  {
    $search: {
      text: {
        path: "title",
        query: "Horsemen Apocalypse"
      },
      hint: { "$preview": 1 }
    }
  },
  {
    $project: {
      _id: 0,
      title: 1,
      year: 1,
      plot:1
    }
  }
]); 

// Match all terms: both "Robin" and "Hood" must match in the title.
db.mflix_movies.aggregate([
  {
    $search: {
      text: {
        path: "title",
        query: "Robin Hood",
        matchCriteria: "all"
      },
      hint: { "$preview": 1 }
    }
  },
  {
    $project: {
      _id: 0,
      title: 1,
      year: 1,
      plot:1
    }
  }
]);


// Match any term: either "Prince" or "Thieves" can match in the title.
db.mflix_movies.aggregate([
  {
    $search: {
      text: {
        path: "title",
        query: "Prince Thieves",
        matchCriteria: "any"
      },
      hint: { "$preview": 1 }
    }
  },
  {
    $project: {
      _id: 0,
      title: 1,
      year: 1,
      plot:1
    }
  }
]);

// Fuzzy matching: tolerate a typo in "gladiator".
db.mflix_movies.aggregate([
  {
    $search: {
      text: {
        path: "title",
        query: "gladiatr",
        fuzzy: {}
      },
      hint: { "$preview": 1 }
    }
  },
  {
    $project: {
      _id: 0,
      title: 1,
      year: 1,
      plot:1
    }
  }
]);


// Fuzzy matching with matchCriteria: require all supplied terms while still
// allowing typo tolerance.
db.mflix_movies.aggregate([
  {
    $search: {
      text: {
        path: "title",
        query: "Briget jons",
        matchCriteria: "all",
        fuzzy: {}
      },
      hint: { "$preview": 1 }
    }
  },
  {
    $project: {
      _id: 0,
      title: 1,
      year: 1,
      plot:1
    }
  }
]);
