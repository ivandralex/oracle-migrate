const fs = require('fs');
const SimpleOracleDB = require('simple-oracledb');
const oracledb = require('oracledb');

SimpleOracleDB.extend(oracledb);

/**
 * Connection configuration for Oracle DB
 */
const dbConfig = {
  user: process.env.NODE_ORACLEDB_USER,
  password : process.env.NODE_ORACLEDB_PASSWORD,
  connectString : process.env.NODE_ORACLEDB_CONNECTIONSTRING
};

const sqlDelimiter = '-----';

/**
 * Returns connection to Oracle DB
 *
 * @return {Promise} returns connection to Oracle DB
 */
function getConnection() {
  return oracledb.getConnection({
    user: dbConfig.user,
    password: dbConfig.password,
    connectString: dbConfig.connectString
  });
}

/**
 * Reads file content
 *
 * @param {string} path path to SQL file
 * @returns {Promise} returns content of SQL file
 */
function readFile(path) {
  return new Promise((resolve, reject) => {
    fs.readFile(path, 'utf8', (err, sql) => {
      if (err) {
        return reject(err);
      }

      resolve(sql);
    });
  });
}

/**
 * Just splits sql string to several
 * sql statements and trims it
 *
 * @param {string} str a string to split by delimiter
 * @returns {array} returns array trimmed of SQL commands
 */
function splitCommands(str) {
  return str.split(sqlDelimiter).map(e => e.trim());
}

/**
 * Runs transaction on a sequence of sqls
 *
 * @param {array} sqls a list of sql statements
 * @returns {Promise} returns result of executed transaction
 */
function runTransactionSequence(sqls) {
  let _connection;
  const actions = [];

  for (let i = 0; i < sqls.length; i++) {
    actions.push(cb => {
      if (!_connection) {
        throw new Error('Connection is not estabilished');
      }

      _connection.execute(sqls[i], [], { outFormat: oracledb.OBJECT, autoCommit: false })
        .then(data => {
          cb(null, data);
        })
        .catch(cb);
    });
  }

  return new Promise((resolve, reject) => {
    getConnection()
    .then(connection => {
      _connection = connection;

      // run all actions in sequence
      connection.transaction(actions, {
        sequence: true
      }, err => {
        if (err) {
          return reject(err);
        }

        resolve();
      });
    });
  });
}

/**
 * Migrates database up
 *
 * @param {Function} next callback
 * @returns {Promise} returns result of executed `up` migration
 */
exports.up = function (next) {
  return readFile('{up}')
    .then(splitCommands)
    .then(runTransactionSequence)
    .then(() => next(null))
    .catch(err => {
      console.log('"up" migration was failed so rollback changes were applied using "down" migration');

      exports.down(() => {
        next(err);
      });
    });
};

/**
 * Migrates database down
 *
 * @param {Function} next callback
 * @returns {Promise} returns result of executed `down` migration
 */
exports.down = function (next) {
  return readFile('{down}')
    .then(splitCommands)
    .then(runTransactionSequence)
    .then(() => next(null))
    .catch(err => {
      // console.log(`'down' migration was failed`)
      next(err);
    });
};
