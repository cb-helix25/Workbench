const sql = require("mssql");

const reportingConfigs = {
  "helix-project-data": {
    sqlServer: "helix-database-server.database.windows.net",
    sqlUser: "helix-database-server",
    sqlDatabase: "helix-project-data",
    secretName: "helix-database-password"
  },
  instructions: {
    sqlServer: "instructions.database.windows.net",
    sqlUser: "instructionsadmin",
    sqlDatabase: "instructions",
    secretName: "helix-instructions-password"
  },
  "helix-core-data": {
    sqlServer: "helix-database-server.database.windows.net",
    sqlUser: "helix-database-server",
    sqlDatabase: "helix-core-data",
    secretName: "helix-database-password"
  }
};

const reportingPools = new Map();

async function getReportingPool(workspaceKey, secretClient) {
  const config = reportingConfigs[workspaceKey];

  if (!config) {
    throw new Error(`Unknown reporting workspace "${workspaceKey}".`);
  }

  if (reportingPools.has(workspaceKey)) {
    return reportingPools.get(workspaceKey);
  }

  if (!secretClient) {
    throw new Error("SecretClient instance is required to fetch SQL credentials.");
  }

  let sqlPassword;

  try {
    const secret = await secretClient.getSecret(config.secretName);
    sqlPassword = secret && secret.value;
  } catch (error) {
    throw new Error(
      `Failed to connect to SQL Server for ${config.sqlDatabase} DB: ${error.message || error}`
    );
  }

  if (!sqlPassword) {
    throw new Error(`SQL password secret "${config.secretName}" does not contain a value.`);
  }

  try {
    const pool = new sql.ConnectionPool({
      server: config.sqlServer,
      user: config.sqlUser,
      password: sqlPassword,
      database: config.sqlDatabase,
      options: { encrypt: true },
    });

    await pool.connect();
    reportingPools.set(workspaceKey, pool);
    return pool;
  } catch (error) {
    throw new Error(
      `Failed to connect to SQL Server for ${config.sqlDatabase} DB: ${error.message || error}`
    );
  }
}

module.exports = {
  getReportingPool,
};