const sql = require("mssql");

const sqlServer = "helix-database-server.database.windows.net";
const sqlUser = "helix-database-server";
const sqlDatabase = "helix-project-data";
const secretName = "helix-database-password";

let reportingPool = null;

async function getReportingPool(secretClient) {
  if (reportingPool) {
    return reportingPool;
  }

  if (!secretClient) {
    throw new Error("SecretClient instance is required to fetch SQL credentials.");
  }

  let sqlPassword;

  try {
    const secret = await secretClient.getSecret(secretName);
    sqlPassword = secret && secret.value;
  } catch (error) {
    throw new Error(
      `Failed to connect to SQL Server for helix-project-data DB: ${error.message || error}`
    );
  }

  if (!sqlPassword) {
    throw new Error(`SQL password secret "${secretName}" does not contain a value.`);
  }

  try {
    const pool = new sql.ConnectionPool({
      server: sqlServer,
      user: sqlUser,
      password: sqlPassword,
      database: sqlDatabase,
      options: { encrypt: true },
    });

    await pool.connect();
    reportingPool = pool;
    return reportingPool;
  } catch (error) {
    throw new Error(
      `Failed to connect to SQL Server for helix-project-data DB: ${error.message || error}`
    );
  }
}

module.exports = {
  getReportingPool,
  sqlDatabase,
  sqlServer
};