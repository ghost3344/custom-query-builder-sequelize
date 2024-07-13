const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('film_list', {
    FID: {
      type: DataTypes.SMALLINT.UNSIGNED,
      allowNull: true,
      defaultValue: 0
    },
    title: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    category: {
      type: DataTypes.STRING(25),
      allowNull: false
    },
    price: {
      type: DataTypes.DECIMAL(4,2),
      allowNull: true,
      defaultValue: 4.99
    },
    length: {
      type: DataTypes.SMALLINT.UNSIGNED,
      allowNull: true
    },
    rating: {
      type: DataTypes.ENUM('G','PG','PG-13','R','NC-17'),
      allowNull: true,
      defaultValue: "G"
    },
    actors: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'film_list',
    timestamps: false
  });
};
