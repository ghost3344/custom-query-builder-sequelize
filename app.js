import express from 'express';
import dotenv from 'dotenv';

import bodyParser from 'body-parser';
import cors from 'cors';

// import publicRoutes from './src/routes/public';
// import apiRoutes from './src/routes/api';
// import adminRoutes from './src/routes/admin';
// import apiMiddleware from './src/middleware/apiAuth';
// import adminMiddleware from './src/middleware/adminAuth';
import errorHandler from './src/middleware/errorHandler';
import { getRecords } from './src/helpers/query-builder';

dotenv.config();
require('./src/config/sequelize');

const app = express();
app.use(
  bodyParser.urlencoded({
    extended: true,
  }),
);

app.use(cors());
app.use(bodyParser.json());
// app.use('/pub', publicRoutes);
// app.use('/api', apiMiddleware, apiRoutes);
// app.use('/api/admin', apiMiddleware, adminMiddleware, adminRoutes);
app.use(errorHandler);

// Route to handle search request
app.get("/search", async (req, res) => {
  try {
    const {
      options = ''
    } = req.query;

   let parsedOptions = JSON.parse(options)
   
   parsedOptions = {
      modelName: "film",
      filters: parsedOptions.filters || {},
      select: [...parsedOptions.select,'language_id','actor_id_actors.first_name','category_id_categories.name'] || [],
      pagination: parsedOptions.pagination || {},
      sorting: parsedOptions.sorting || {},
      groupBy: parsedOptions.groupBy || undefined,
      aggregates: parsedOptions.aggregates || undefined,
      having: parsedOptions.having || {},
      globalSearch: parsedOptions.globalSearch === "true",
    };

    // const options = {
    //   modelName: 'film', // Replace with your model name
    //   filters: {
    //     title: { __like: 'ACE%' },  // Example filter on title
    //     rental_rate: { __gte: 2.99 },  // Example filter on rental rate
    //     release_year: { __gte: 2000 },  // Example filter on release year
    //     'actor_id_actors.first_name': { __like: 'John%' },  // Filter on actor's first name
    //     // Add more association.attribute filters as needed
    //   },
    //   pagination: { limit: 10, offset: 0 },  // Pagination options
    //   sorting: { field: 'title', direction: 'ASC' },  // Sorting options
    //   groupBy: ['rental_rate'],  // Group by rental_rate
    //   aggregates: { count: 'title' },  // Aggregate function (count)
    //   having: { count_title: { __gte: 1 } },  // Having condition
    //   // joinOptions: {
    //   //   actors: 'INNER',  // Join type for actors association
    //   //   directors: 'LEFT OUTER'  // Join type for directors association
    //   //   // Add more associations and join types as needed
    //   // },
    //   select: ['title', 'rental_rate', 'release_year'],  // Attributes to select
    //   globalSearch: null,  // Global search (not used in this example)
    //   transaction: null  // Transaction (not used in this example)
    // };
    
    

    const results = await getRecords(
      {
        "modelName": "film",
        "filters": {
          // "rental_duration": {
          //   "__gte": 5
          // },
          // "length": {
          //   "__between": [90, 180]
          // },
          // "replacement_cost": {
          //   "__lte": 20.0
          // },
          // "rating": {
          //   "__or": [
          //     {
          //       "__eq": "PG"
          //     },
          //     {
          //       "__eq": "R"
          //     }
          //   ]
          // },
          // "title": {
          //   "__or": [
          //     {
          //       "__like": "ACE%"
          //     },
          //     {
          //       "__notLike": "%XYZ"
          //     }
          //   ]
          // },
          // "rental_rate": {
          //   "__and": [
          //     {
          //       "__gte": 2.99
          //     },
          //     {
          //       "__lt": 5.99
          //     }
          //   ]
          // },
          // "release_year": {
          //   "__and": [
          //     {
          //       "__gte": 2000
          //     },
          //     {
          //       "__lte": 2020
          //     }
          //   ]
          // },
          // "actor_id_actors.first_name": {
          //   "__or": [
          //     {
          //       "__like": "John%"
          //     },
          //     {
          //       "__like": "Jane%"
          //     }
          //   ]
          // },
          // "actor_id_actors.last_name": {
          //   "__notILike": "%Smith"
          // },
          // "category_id_categories.name": {
          //   "__in": ["Action", "Comedy", "Drama"]
          // },
          // "language.name": {
          //   "__notIn": ["French", "German"]
          // },
          // "last_update": {
          //   "__between": ["2021-01-01", "2023-01-01"]
          // }
        },
        "select": [
          "title",
          "description",
          "rental_rate",
          "release_year",
          "language.name",
          "language_id",
          "actor_id_actors.first_name",
          "actor_id_actors.last_name",
          "category_id_categories.name",
          "special_features",
          "last_update"
        ],
        "pagination": {
          "limit": 5,
          "offset": 0
        },
        "sorting": {
          "field": "release_year",
          "direction": "DESC"
        },
        "groupBy": [
          "rental_rate",
          "release_year",
          "language_id"
        ],
        "aggregates": {
          "count": "title",
          "max": "rental_rate",
          "min": "release_year",
          "avg": "rental_rate",
          "sum": "rental_rate"
        },
        "having": {
          "count_title": {
            "__gte": 1
          },
          // "max_rental_rate": {
          //   "__lte": 6.99
          // },
          // "min_release_year": {
          //   "__gte": 2000
          // },
          "avg_rental_rate": {
            "__gt": 3.5
          },
          // "sum_rental_rate": {
          //   "__between": [100, 500]
          // }
        },
        "globalSearch": false,
      }
      
      
    );
    res.json(results);
  } catch (error) {
    res
      .status(500)
      .json({ error: "An error occurred", details: error.message });
  }
});

module.exports = app;
