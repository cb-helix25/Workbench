const path = require("path");
const express = require("express");
const { DefaultAzureCredential } = require("@azure/identity");
const { SecretClient } = require("@azure/keyvault-secrets");
const reportingRouter = require("./reportingRouter");

const app = express();

// Initialize Azure Key Vault client
const keyVaultUrl = process.env.KEY_VAULT_URL || "https://secret-keys-helix.vault.azure.net/";
const credential = new DefaultAzureCredential();
const secretClient = new SecretClient(keyVaultUrl, credential);
app.locals.secretClient = secretClient;
const port = process.env.REPORTING_PORT || 5055;

app.use(express.json({ limit: "1mb" }));
app.use("/api/reporting", reportingRouter);

const uiPath = path.join(__dirname, "../pages");
app.use(express.static(uiPath));

app.get("/", (_req, res) => {
  res.sendFile(path.join(uiPath, "index.html"));
});

app.listen(port, () => {
  console.log(`[REPORTING-HUB] Server listening on http://localhost:${port}`);
  console.log(`[REPORTING-HUB] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[REPORTING-HUB] Logging enabled at: ${new Date().toISOString()}`);
});