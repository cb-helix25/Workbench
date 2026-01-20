const sql = require("mssql");
const { DefaultAzureCredential } = require("@azure/identity");
const { SecretClient } = require("@azure/keyvault-secrets");

const sqlServer = process.env.REPORTING_DB_SERVER || "helix-database-server.database.windows.net";
const sqlUser = process.env.REPORTING_DB_USER || "helix-database-server";
const sqlDatabase = process.env.REPORTING_DB_NAME || "helix-project-data";
const secretName = process.env.REPORTING_DB_SECRET || "helix-database-password";

let poolPromise;

async function getSqlPassword() {
  const keyVaultUrl = process.env.KEY_VAULT_URL;
  if (!keyVaultUrl) {
    throw new Error("KEY_VAULT_URL environment variable is not set.");
  }

  const credential = new DefaultAzureCredential();
  const secretClient = new SecretClient(keyVaultUrl, credential);
  const secret = await secretClient.getSecret(secretName);
  const sqlPassword = secret && secret.value;

  if (!sqlPassword) {
    throw new Error(`SQL password secret "${secretName}" does not contain a value.`);
  }

  return sqlPassword;
}

async function getReportingPool() {
  if (!poolPromise) {
    poolPromise = (async () => {
      const sqlPassword = await getSqlPassword();
      const pool = new sql.ConnectionPool({
        server: sqlServer,
        user: sqlUser,
        password: sqlPassword,
        database: sqlDatabase,
        options: { encrypt: true }
      });

      await pool.connect();
      return pool;
    })();
  }

  return poolPromise;
}

module.exports = {
  getReportingPool,
  sqlDatabase,
  sqlServer
};