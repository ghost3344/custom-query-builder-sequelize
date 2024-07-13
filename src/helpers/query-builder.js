const { DataTypes, Op } = require("sequelize");
const { models, sequelize } = require("../models/index");
const { v4: uuidv4, v5: uuidv5 } = require("uuid");
// Dynamic query builder functions
const modelMap = models;
const operatorMap = {
  __eq: Op.eq,
  __ne: Op.ne,
  __gt: Op.gt,
  __lt: Op.lt,
  __gte: Op.gte,
  __lte: Op.lte,
  __like: Op.like,
  __notLike: Op.notLike,
  __iLike: Op.iLike,
  __notILike: Op.notILike,
  __startsWith: Op.startsWith,
  __endsWith: Op.endsWith,
  __substring: Op.substring,
  __regexp: Op.regexp,
  __notRegexp: Op.notRegexp,
  __iRegexp: Op.iRegexp,
  __notIRegexp: Op.notIRegexp,
  __between: Op.between,
  __notBetween: Op.notBetween,
  __in: Op.in,
  __notIn: Op.notIn,
  __overlap: Op.overlap,
  __contains: Op.contains,
  __contained: Op.contained,
  __any: Op.any,
  __all: Op.all,
  __and: Op.and,
  __or: Op.or,
  __not: Op.not,
  __col: Op.col,
};

async function buildQuery(options) {
  const {
    modelName,
    filters,
    pagination,
    sorting,
    groupBy,
    aggregates,
    having,
    joinOptions,
    select,
    globalSearch,
    transaction,
  } = options;

  try {
    const model = modelMap[modelName];
    if (!model) {
      throw new Error(`Model ${modelName} not found`);
    }

    // Modify filters if needed, e.g., date ranges
    //   const modifiedFilters = modifyFilters(filters);

    // Build WHERE and INCLUDE clauses
    const { where, include, subqueries } = buildWhereAndIncludes(
      model,
      filters,
      joinOptions,
      globalSearch
    );

    // Build attributes to select
    const attributes = buildAttributes(model, select, include);

    // Build GROUP BY clause
    const group = buildGroupBy(model, groupBy, attributes);

    // Build HAVING conditions
    const havingConditions = buildHavingConditions(having, model, aggregates); // Updated to pass aggregates to having condition builder

    const queryOptions = {
      attributes,
      where,
      include,
      order: sorting ? [[sorting.field, sorting.direction]] : [],
      group,
      having: havingConditions,
      transaction,
    };

    // Add LIMIT and OFFSET for pagination
    if (pagination.limit !== undefined && pagination.offset !== undefined) {
      queryOptions.limit = pagination.limit;
      queryOptions.offset = pagination.offset;
    }

    // Add aggregates if specified
    if (aggregates) {
      queryOptions.attributes.push(...buildAggregates(aggregates));
    }

    // Add subqueries if present
    if (subqueries.length > 0) {
      queryOptions.subqueries = subqueries;
    }

    return queryOptions;
  } catch (error) {
    console.error(`Error in buildQuery: ${error.message}`);
    throw new Error(`Failed to build query: ${error.message}`);
  }
}

function buildGroupBy(model, groupByFields, selectFields) {
  const groupBy = new Set();

  // Add groupByFields if provided
  if (groupByFields && groupByFields.length > 0) {
    groupByFields.forEach((col) => {
      if (model.rawAttributes[col]) {
        groupBy.add(model.rawAttributes[col].field || col);
      } else if (col.includes(".")) {
        const [assocAlias, nestedField] = col.split(".");
        const association = Object.values(model.associations).find(
          (assoc) => assoc.as === assocAlias
        );
        if (association) {
          const nestedModel = association.target;
          groupBy.add(
            `${association.as}.${
              nestedModel?.rawAttributes?.[nestedField]?.field || nestedField
            }`
          );
        } else {
          throw new Error(
            `Association ${assocAlias} not found for model ${model.name}`
          );
        }
      } else {
        throw new Error(`Field ${col} not found in model ${model.name}`);
      }
    });
  }

  // Add selectFields if provided
  if (selectFields && selectFields.length > 0) {
    selectFields.forEach((field) => {
      if (model.rawAttributes[field]) {
        groupBy.add(model.rawAttributes[field].field || field);
      } else if (field.includes(".")) {
        const [assocAlias, nestedField] = field.split(".");
        const association = Object.values(model.associations).find(
          (assoc) => assoc.as === assocAlias
        );
        if (association) {
          const nestedModel = association.target;
          groupBy.add(
            `${association.as}.${
              nestedModel?.rawAttributes?.[nestedField]?.field || nestedField
            }`
          );
        } else {
          throw new Error(
            `Association ${assocAlias} not found for model ${model.name}`
          );
        }
      } else {
        throw new Error(`Field ${field} not found in model ${model.name}`);
      }
    });
  }

  return Array.from(groupBy);
}

function buildWhereAndIncludes(model, filters, joinOptions, globalSearch) {
  const where = buildConditions(filters, model, globalSearch);
  const include = extractIncludes(filters, model, joinOptions);
  const subqueries = buildSubqueries(filters, model, joinOptions);

  return { where, include, subqueries };
}

function buildConditions(filters, model, globalSearch) {
  if (typeof filters !== "object" || Array.isArray(filters)) {
    throw new Error("Filters should be an object");
  }

  const where = {};

  if (globalSearch) {
    where[Op.or] = buildGlobalSearchConditions(filters);
  } else {
    for (const [field, conditions] of Object.entries(filters)) {
      if (field === "__and" || field === "__or") {
        where[operatorMap[field]] = conditions.map((cond) =>
          buildConditions(cond, model, globalSearch)
        );
      } else if (typeof conditions === "object" && conditions.subquery) {
        where[field] = sequelize.literal(`(${conditions.subquery})`);
      } else if (model.rawAttributes[field]) {
        where[field] = buildConditionObject(conditions, globalSearch);
      } else {
        const association = Object.values(model.associations).find(
          (assoc) => assoc.target.rawAttributes[field]
        );
        if (association) {
          const includeCondition = buildConditionObject(
            conditions,
            globalSearch
          );
          where[Op.and] = where[Op.and] || [];
          where[Op.and].push({
            [`$${association.as}.${field}$`]: includeCondition,
          });
        }
      }
    }
  }

  return where;
}

function buildGlobalSearchConditions(filters) {
  const conditions = [];

  for (const [field, value] of Object.entries(filters)) {
    conditions.push({ [Op.like]: `%${value}%` });
  }

  return conditions;
}

function extractIncludes(filters, model, joinOptions) {
  const include = [];

  if (filters) {
    for (const field of Object.keys(filters)) {
      if (field === "and" || field === "or") {
        filters[field].forEach((subFilter) => {
          include.push(...extractIncludes(subFilter, model, joinOptions));
        });
      } else {
        const fieldParts = field.split(".");
        if (fieldParts.length > 1) {
          const associationName = fieldParts[0];
          const remainingField = fieldParts.slice(1).join(".");

          const association = Object.values(model.associations).find(
            (assoc) => assoc.as === associationName
          );

          if (association) {
            const nestedFilters = { [remainingField]: filters[field] };
            const nestedIncludes = extractIncludes(
              nestedFilters,
              association.target,
              joinOptions
            );

            include.push({
              model: association.target,
              as: association.as,
              required:
                (joinOptions && joinOptions[associationName]) === "INNER",
              attributes: [],
              include: nestedIncludes,
            });
          }
        } else {
          const association = Object.values(model.associations).find(
            (assoc) => assoc.as === field
          );
          if (association) {
            const joinType =
              joinOptions && joinOptions[field] ? joinOptions[field] : "LEFT";
            switch (association.associationType) {
              case "BelongsTo":
              case "HasOne":
              case "HasMany":
              case "BelongsToMany":
                const nestedFilters = filters[field];
                const nestedIncludes = extractIncludes(
                  nestedFilters,
                  association.target,
                  joinOptions
                );
                include.push({
                  model: association.target,
                  as: association.as,
                  required: joinType === "INNER",
                  attributes: buildAttributes(
                    association.target,
                    Object.keys(nestedFilters)
                  ),
                  include: nestedIncludes,
                });
                break;
              default:
                throw new Error(
                  `Unsupported association type: ${association.associationType}`
                );
            }
          }
        }
      }
    }
  }

  return include;
}

function buildAttributes(model, select, include = []) {
  if (!select || !Array.isArray(select)) {
    return undefined;
  }

  const attributes = [];
  const includeMap = include.reduce((map, inc) => {
    map[inc.as] = inc;
    return map;
  }, {});

  select.forEach((attr) => {
    if (attr.includes(".")) {
      const parts = attr.split(".");
      let currentModel = model;
      let currentInclude = includeMap;
      let attributeAddModel = null;
      parts.forEach((part, index) => {
        if (index === parts.length - 1) {
          if (attributeAddModel) {
            if (!attributeAddModel.attributes.includes(part)) {
              attributeAddModel.attributes.push(part);
            }
          } else {
            attributes.push(attr);
          }
        } else {
          const association = currentModel.associations[part];
          if (!association) {
            throw new Error(
              `Association ${part} not found for model ${currentModel.name}`
            );
          }

          currentModel = association.target;
          if (!currentInclude[part]) {
            const newInclude = {
              model: association.target,
              as: association.as,
              attributes: [],
              include: [],
            };
            include.push(newInclude);
            currentInclude[part] = newInclude;
          }

          attributeAddModel = currentInclude[part];

          currentInclude = currentInclude[part].include.reduce((map, inc) => {
            map[inc.as] = inc;
            return map;
          }, {});
        }
      });
    } else {
      attributes.push(attr);
    }
  });

  return attributes.filter((att) => !att.includes("."));
}

function getAllFields(model, visited = new Set()) {
  // Check if this model has already been visited to avoid infinite loop
  if (visited.has(model)) {
    return [];
  }

  // Mark this model as visited
  visited.add(model);

  const fields = [];

  // Gather fields from the model itself
  Object.keys(model.rawAttributes).forEach((field) => {
    fields.push(field);
  });

  // Gather fields from associations
  Object.values(model.associations).forEach((association) => {
    const associatedModel = association.target;
    const associatedFields = getAllFields(associatedModel, visited).map(
      (field) => `${association.as}.${field}`
    );
    fields.push(...associatedFields);
  });

  return fields;
}

function buildConditionObject(conditions, globalSearch) {
  if (typeof conditions !== "object" || Array.isArray(conditions)) {
    throw new Error("Conditions should be an object");
  }

  const conditionObject = {};

  for (const [operator, value] of Object.entries(conditions)) {
    const op = operatorMap[operator];
    if (!op) {
      throw new Error(`Unsupported operator: ${operator}`);
    }

    if (op === Op.or || op === Op.and) {
      conditionObject[op] = value.map((cond) =>
        buildConditionObject(cond, globalSearch)
      );
    } else if (op === Op.between || op === Op.notBetween) {
      conditionObject[op] = value;
    } else if (op === Op.in || op === Op.notIn) {
      conditionObject[op] = value;
    } else if (globalSearch && (op === Op.like || op === Op.iLike)) {
      conditionObject[op] = `%${value}%`;
    } else {
      conditionObject[op] = value;
    }
  }

  return conditionObject;
}

function buildSubqueries(filters, model, joinOptions) {
  const subqueries = [];

  for (const [field, conditions] of Object.entries(filters)) {
    if (typeof conditions === "object" && conditions.subquery) {
      const subquery = sequelize.literal(`(${conditions.subquery})`);
      subqueries.push({ alias: field, subquery });
    } else {
      const association = Object.values(model.associations).find(
        (assoc) => assoc.target.rawAttributes[field]
      );
      if (association) {
        const subqueryFilters = conditions[field] || {};
        const subqueryModel = association.target;
        const subqueryIncludes = extractIncludes(
          subqueryFilters,
          subqueryModel,
          joinOptions
        );
        const subqueryWhere = buildConditions(subqueryFilters, subqueryModel);
        const subquery = sequelize.literal(
          `(${subqueryModel.name}.id IN (SELECT DISTINCT ${
            subqueryModel.name
          }.id FROM ${subqueryModel.name}${
            subqueryIncludes.length
              ? ` AS ${subqueryModel.name} WHERE ${subqueryWhere}`
              : ""
          }))`
        );
        subqueries.push({ alias: field, subquery });
      }
    }
  }

  return subqueries;
}

function buildHavingConditions(having, model, aggregates) {
  if (!having || typeof having !== "object" || Array.isArray(having)) {
    return undefined;
  }

  const conditions = {};

  for (const [field, filters] of Object.entries(having)) {
    // Check if the field is an aggregate alias
    if (
      Object.entries(aggregates).find(([key, value]) => {
        return `${key}_${value}` === field;
      })
    ) {
      const condition = buildConditionObject(filters);
      conditions[field] = condition;
    } else {
      throw new Error(`Unsupported field in HAVING clause: ${field}`);
    }
  }

  return conditions;
}

function buildAggregates(aggregates) {
  if (!aggregates || typeof aggregates !== "object") {
    return [];
  }

  return Object.entries(aggregates).map(([aggregate, field]) => {
    return [
      sequelize.fn(aggregate, sequelize.col(field)),
      `${aggregate}_${field}`, // Ensure this matches what you use in HAVING clause
    ];
  });
}

function getSqlFromFindAll(Model, options) {
  const id = uuidv4();

  return new Promise((resolve, reject) => {
    Model.addHook("beforeFindAfterOptions", id, (options) => {
      Model.removeHook("beforeFindAfterOptions", id);

      resolve(
        Model.sequelize.dialect.QueryGenerator.selectQuery(
          Model.getTableName(),
          options,
          Model
        ).slice(0, -1)
      );

      return new Promise(() => {});
    });

    return Model.findAll(options).catch(reject);
  });
}

function getModelTree(model, depth) {
  if (depth === 0) {
    return { name: model.name, associations: "Depth limit reached" };
  }

  const fields = Object.keys(model.rawAttributes); // Get fields of the model
  const tree = {
    name: model.name,
    fields: fields,
    associations: [],
  };

  // Loop through associations
  for (const association of Object.values(model.associations)) {
    const associatedModel = association.target; // Get the associated model
    tree.associations.push({
      name: associatedModel.name,
      alias: association.as || null, // Include alias if available
      sourceKey: association.sourceKey || null, // Include source key if available
      foreignKey: association.foreignKey || null, // Include foreign key if available
      ...getModelTree(associatedModel, depth - 1),
    });
  }

  return tree;
}

function getAllModelsTree(depth = 2) {
  const fullTree = [];
  for (const model of Object.values(models)) {
    fullTree.push(getModelTree(model, depth));
  }
  return fullTree;
}

async function getTotalCount(model, queryOptions) {
  delete queryOptions.limit;
  delete queryOptions.offset;

  const sqlQuery = await getSqlFromFindAll(model, queryOptions);

  const finalQuery = `
      SELECT COUNT(*)
      FROM (${sqlQuery}) AS subquery;
    `;
  const [results] = await sequelize.query(finalQuery);

  return results[0]["COUNT(*)"] || 0;
}

async function getRecords(options) {
  try {
    const queryOptions = await buildQuery(options);
    const model = modelMap[options.modelName];
    const rows = await model.findAll(queryOptions);
    const count = await getTotalCount(model, queryOptions);

    const modeltree = getAllModelsTree(1);
    return { count, rows, modeltree };
  } catch (error) {
    console.error(`Error in getRecords: ${error.message}`);
    throw new Error(`Failed to retrieve records: ${error.message}`);
  }
}

// Function to add new column dynamically
async function addNewColumnToUserModel(
  columnName,
  columnDataType,
  options = {}
) {
  try {
    // Add the new column to the User model
    await sequelize.getQueryInterface().addColumn("Users", columnName, {
      type: columnDataType,
      ...options,
    });

    console.log(`Added new column '${columnName}' to User model successfully.`);
  } catch (error) {
    console.error(
      `Failed to add new column '${columnName}' to User model:`,
      error
    );
  }
}

// Example usage: Adding a new column 'email' of type STRING to User model
addNewColumnToUserModel("email", DataTypes.STRING, {
  allowNull: true,
  unique: true,
  validate: {
    isEmail: true,
  },
});

module.exports = {
  getRecords,
  addNewColumnToUserModel,
};
