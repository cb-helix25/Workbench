const path = require("path");
const express = require("express");
const { DefaultAzureCredential } = require("@azure/identity");
const { SecretClient } = require("@azure/keyvault-secrets");
const { createReportingRouter } = require("./reportingRouter");

const app = express();

// Initialize Azure Key Vault client
const keyVaultUrl = process.env.KEY_VAULT_URL || "https://secret-keys-helix.vault.azure.net/";
const credential = new DefaultAzureCredential();
const secretClient = new SecretClient(keyVaultUrl, credential);
app.locals.secretClient = secretClient;

app.use(express.json({ limit: "1mb" }));
app.use("/api/reporting/helix-project-data", createReportingRouter("helix-project-data"));
app.use("/api/reporting/helix-core-data", createReportingRouter("helix-core-data"));
app.use("/api/reporting/instructions", createReportingRouter("instructions"));
app.use("/api/reporting", createReportingRouter("helix-project-data"));

const uiPath = path.join(__dirname, "../dist");
app.use(express.static(uiPath));

app.get("*", (_req, res) => {
  res.sendFile(path.join(uiPath, "index.html"));
});

const port = process.env.PORT || process.env.REPORTING_PORT || 5055;

app.listen(port, () => {
  console.log(`[REPORTING-HUB] Server listening on http://localhost:${port}`);
  console.log(`[REPORTING-HUB] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[REPORTING-HUB] Logging enabled at: ${new Date().toISOString()}`);
});