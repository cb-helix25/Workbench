const sql = require("mssql");
const { DefaultAzureCredential } = require("@azure/identity");
const { SecretClient } = require("@azure/keyvault-secrets");

const sqlServer = "helix-database-server.database.windows.net";
const sqlUser = "helix-database-server";
const sqlDatabase = "helix-project-data";
const secretName = "helix-database-password";
const keyVaultUrl = "https://helix-keys.vault.azure.net/";

let reportingPool = null;

async function getReportingPool() {
  if (reportingPool) {
    return reportingPool;
  }

  const credential = new DefaultAzureCredential();
  const secretClient = new SecretClient(keyVaultUrl, credential);
  
  let sqlPassword;
  
  try {
    const secret = await secretClient.getSecret(secretName);
    sqlPassword = secret && secret.value;
  } catch (error) {
    throw new Error(
      `Failed to fetch SQL password from Key Vault: ${error.message || error}`
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
      options: { encrypt: true }
    });

    await pool.connect();
    reportingPool = pool;
    return reportingPool;
  } catch (error) {
    throw new Error(
      `Failed to connect to SQL Server: ${error.message || error}`
    );
  }
}

module.exports = {
  getReportingPool,
  sqlDatabase,
  sqlServer
};