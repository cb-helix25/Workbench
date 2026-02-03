const express = require("express");
const sql = require("mssql");
const { getReportingPool } = require("./db");

const DEFAULT_WORKSPACE = "helix-core-data";
const CONTACT_TABLE = "dbo.enquiries";
const POID_TABLE = "dbo.poid";
const CONTACT_SELECT_FIELDS = [
  "ID",
  "touchpoint_date",
  "Contact_referrer",
  "Method_of_Contact",
  "Referral_URL",
  "Point_of_Contact",
  "Ultimate_Source",
  "Call_Taker",
  "Area_of_Work",
  "Initial_first_call_notes",
  "Value"
];
const POID_SELECT_FIELDS = [
  "acid",
  "country_code",
  "drivers_license_number",
  "gender",
  "submission_url",
  "house_building_number",
  "nationality",
  "company_country",
  "company_county",
  "company_city",
  "company_post_code",
  "company_street",
  "company_house_building_number",
  "street",
  "county",
  "post_code",
  "city",
  "country"
];

const ADDITIONAL_FIELD_MAPPINGS = [
  { key: "sql_contact_referrer", column: "Contact_referrer", perstag: "%CONTACT_REFERRER%" },
  { key: "sql_method_of_contact", column: "Method_of_Contact", perstag: "%METHOD_OF_CONTACT%" },
  { key: "sql_referral_url", column: "Referral_URL", perstag: "%REFERRAL_URL%" },
  { key: "sql_point_of_contact", column: "Point_of_Contact", perstag: "%POINT_OF_CONTACT%" },
  { key: "sql_ultimate_source", column: "Ultimate_Source", perstag: "%ULTIMATE_SOURCE%" },
  { key: "sql_call_taker", column: "Call_Taker", perstag: "%CALL_TAKER%" },
  { key: "sql_area_of_work", column: "Area_of_Work", perstag: "%AREA_OF_WORK%" },
  { key: "sql_initial_first_call_notes", column: "Initial_first_call_notes", perstag: "%INITIAL_FIRST_CALL_NOTES%" },
  { key: "sql_value", column: "Value", perstag: "%VALUE%" }
];
const POID_FIELD_MAPPINGS = [
  { key: "sql_country_code", column: "country_code", perstag: "%COUNTRY_CODE%" },
  { key: "sql_drivers_license_number", column: "drivers_license_number", perstag: "%DRIVERS_LICENSE_NUMBER%" },
  { key: "sql_gender", column: "gender", perstag: "%GENDER%" },
  { key: "sql_submission_url", column: "submission_url", perstag: "%IDSUBMISSION%" },
  { key: "sql_house_building_number", column: "house_building_number", perstag: "%UNITBUILDING_NAME%" },
  { key: "sql_nationality", column: "nationality", perstag: "%NATIONALITY%" },
  { key: "sql_company_country", column: "company_country", perstag: "%COMPANY_COUNTRY%" },
  { key: "sql_company_county", column: "company_county", perstag: "%COMPANY_MAILING_COUNTY%" },
  { key: "sql_company_city", column: "company_city", perstag: "%COMPANY_CITY%" },
  { key: "sql_company_post_code", column: "company_post_code", perstag: "%COMPANY_POSTAL_CODE%" },
  { key: "sql_company_street", column: "company_street", perstag: "%COMPANY_MAILING_STREET%" },
  {
    key: "sql_company_house_building_number",
    column: "company_house_building_number",
    perstag: "%COMPANY_UNITBUILDING_NAME_OR_NUMBER%"
  },
  { key: "sql_street", column: "street", perstag: "%MAILING_STREET_1%" },
  { key: "sql_county", column: "county", perstag: "%MAILING_COUNTY%" },
  { key: "sql_post_code", column: "post_code", perstag: "%MAILING_POSTAL_CODE%" },
  { key: "sql_city", column: "city", perstag: "%MAILING_CITY%" },
  { key: "sql_country", column: "country", perstag: "%MAILING_COUNTRY%" }
];

const normalizeHeader = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const splitCsvLine = (line) => {
  return line
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((cell) => cell.trim().replace(/^"|"$/g, ""));
};

const findHeaderIndex = (headers, identifierType) => {
  const normalized = headers.map((header) => normalizeHeader(header));
  if (identifierType === "email") {
    return normalized.findIndex((header) => header.includes("email"));
  }
  return normalized.findIndex((header) => header.includes("accontactid") || header.includes("contactid"));
};

const parseRawInput = (rawInput, identifierType) => {
  if (typeof rawInput !== "string") {
    return [];
  }

  const trimmed = rawInput.trim();
  if (!trimmed) {
    return [];
  }

  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return [];
  }

  const hasComma = lines[0].includes(",");

  let values = [];

  if (hasComma) {
    const headers = splitCsvLine(lines[0]);
    const headerIndex = findHeaderIndex(headers, identifierType);

    if (headerIndex === -1) {
      throw new Error("CSV header is missing the selected identifier column.");
    }

    values = lines
      .slice(1)
      .map((line) => splitCsvLine(line)[headerIndex])
      .filter(Boolean);
  } else {
    values = lines;
  }

  const deduped = new Set();
  values.forEach((value) => {
    const trimmedValue = String(value).trim();
    if (trimmedValue) {
      deduped.add(trimmedValue);
    }
  });

  return Array.from(deduped);
};

const normalizeTouchpointDate = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid touchpoint date value.");
  }

  return parsed.toISOString();
};

const buildApiUrl = (baseUrl, path) => {
  const trimmed = baseUrl.replace(/\/$/, "");
  return `${trimmed}${path}`;
};

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.message || payload?.error || `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return payload;
};

const fetchAcContactIdByEmail = async (baseUrl, apiKey, email) => {
  const url = buildApiUrl(baseUrl, `/contacts?email=${encodeURIComponent(email)}`);
  const payload = await fetchJson(url, {
    method: "GET",
    headers: {
      "Api-Token": apiKey,
      Accept: "application/json"
    }
  });

  const contact = payload?.contacts?.[0];
  return contact?.id || null;
};

const updateFieldValue = async (baseUrl, apiKey, fieldId, contactId, value) => {
  const url = buildApiUrl(baseUrl, "/fieldValues");
  await fetchJson(url, {
    method: "POST",
    headers: {
      "Api-Token": apiKey,
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      fieldValue: {
        contact: contactId,
        field: fieldId,
        value
      }
    })
  });
};

const normalizePerstag = (value) => String(value || "").replace(/^%|%$/g, "").toUpperCase();

// Resolve ActiveCampaign custom field IDs using personalization tags (e.g. "%TOUCHPOINT_DATE%").
// Falls back to matching by title if perstag/tag isn't present.
const resolveFieldIdsByPerstags = async (baseUrl, apiKey, perstags) => {
  const url = buildApiUrl(baseUrl, "/fields?limit=100");
  const payload = await fetchJson(url, {
    method: "GET",
    headers: {
      "Api-Token": apiKey,
      Accept: "application/json"
    }
  });
  
  console.log("[FIELD-RESOLUTION] API Response Meta:", JSON.stringify(payload?.meta || {}, null, 2));

  const fields = payload?.fields || [];
  const map = {};
  const uniquePerstags = Array.from(new Set(perstags.map((tag) => normalizePerstag(tag)).filter(Boolean)));

  console.log("[FIELD-RESOLUTION] Looking for", uniquePerstags.length, "unique perstags");
  console.log("[FIELD-RESOLUTION] AC returned", fields.length, "fields");
  
  // Dump ALL available fields for debugging
  console.log("\n[FIELD-RESOLUTION] ALL AVAILABLE ACTIVECAMPAIGN FIELDS:");
  fields.forEach((field, index) => {
    console.log(`  [${index + 1}] ID: ${field.id}, Title: "${field.title}", Perstag/Tag: "${field.perstag || field.tag || 'NONE'}", Type: ${field.type}`);
  });
  console.log("");

  uniquePerstags.forEach((tag) => {
    const matchByPerstag = fields.find((field) => {
      const fieldTag = normalizePerstag(field?.perstag || field?.tag);
      return fieldTag && fieldTag === tag;
    });

    if (matchByPerstag?.id) {
      map[tag] = matchByPerstag.id;
      console.log(`[FIELD-RESOLUTION] ✓ Found ${tag} (perstag match) -> ID: ${matchByPerstag.id}`);
      return;
    }

    const matchByTitle = fields.find(
      (field) => normalizePerstag(field?.title) === tag
    );
    
    if (matchByTitle?.id) {
      map[tag] = matchByTitle.id;
      console.log(`[FIELD-RESOLUTION] ✓ Found ${tag} (title match) -> ID: ${matchByTitle.id}`);
    } else {
      map[tag] = null;
      console.warn(`[FIELD-RESOLUTION] ✗ NOT FOUND: ${tag}`);
      
      // Log similar fields for debugging
      const similar = fields.filter(f => {
        const title = normalizePerstag(f?.title || "");
        const perstag = normalizePerstag(f?.perstag || f?.tag || "");
        return title.includes(tag.split('_')[0]) || tag.includes(title.split('_')[0]) ||
               perstag.includes(tag.split('_')[0]) || tag.includes(perstag.split('_')[0]);
      });
      
      if (similar.length > 0) {
        console.warn(`[FIELD-RESOLUTION] Similar fields found:`, similar.map(f => ({
          id: f.id,
          title: f.title,
          perstag: f.perstag || f.tag,
          normalized_perstag: normalizePerstag(f?.perstag || f?.tag || ""),
          normalized_title: normalizePerstag(f?.title || "")
        })));
      }
    }
  });

  return map;
};

const fetchContactData = async (pool, identifierType, identifier, resolvedContactId) => {
  const selectFields = CONTACT_SELECT_FIELDS.join(", ");
  if (identifierType === "email") {
    const result = await pool
      .request()
      .input("email", sql.NVarChar, identifier)
      .query(`SELECT TOP 1 ${selectFields} FROM ${CONTACT_TABLE} WHERE email = @email`);

    if (result.recordset[0]) {
      return result.recordset[0];
    }

    if (resolvedContactId) {
      const fallback = await pool
        .request()
        .input("ac_contact_id", sql.NVarChar, resolvedContactId)
        .query(`SELECT TOP 1 ${selectFields} FROM ${CONTACT_TABLE} WHERE ID = @ac_contact_id`);
      return fallback.recordset[0] || null;
    }

    return null;
  }

  const result = await pool
    .request()
    .input("ac_contact_id", sql.NVarChar, identifier)
    .query(`SELECT TOP 1 ${selectFields} FROM ${CONTACT_TABLE} WHERE ID = @ac_contact_id`);
  return result.recordset[0] || null;
};

const fetchPoidData = async (pool, identifierType, identifier, resolvedContactId) => {
  const selectFields = POID_SELECT_FIELDS.join(", ");
  if (identifierType === "email") {
    const result = await pool
      .request()
      .input("email", sql.NVarChar, identifier)
      .query(`SELECT TOP 1 ${selectFields} FROM ${POID_TABLE} WHERE email = @email`);

    if (result.recordset[0]) {
      return result.recordset[0];
    }

    if (resolvedContactId) {
      const fallback = await pool
        .request()
        .input("ac_contact_id", sql.NVarChar, resolvedContactId)
        .query(`SELECT TOP 1 ${selectFields} FROM ${POID_TABLE} WHERE acid = @ac_contact_id`);
      return fallback.recordset[0] || null;
    }

    return null;
  }

  const result = await pool
    .request()
    .input("ac_contact_id", sql.NVarChar, identifier)
    .query(`SELECT TOP 1 ${selectFields} FROM ${POID_TABLE} WHERE acid = @ac_contact_id`);
  return result.recordset[0] || null;
};

function createAcRemediationRouter() {
  const router = express.Router();

  router.post("/test", async (req, res) => {
    const { identifierType, rawInput } = req.body || {};

    if (identifierType !== "email" && identifierType !== "ac_contact_id") {
      return res.status(400).json({ error: "identifierType must be 'email' or 'ac_contact_id'." });
    }

    let identifiers;
    try {
      identifiers = parseRawInput(rawInput, identifierType);
    } catch (error) {
      return res.status(400).json({ error: error.message || "Failed to parse input." });
    }

    const secretClient = req.app.locals.secretClient;
    
    if (!secretClient) {
      return res.status(500).json({ error: "SecretClient is not available." });
    }

    let baseUrl, apiKey;
    try {
      console.log("[AC-REMEDIATION-TEST] Fetching secrets from Key Vault...");
      const baseUrlSecret = await secretClient.getSecret("ac-base-url");
      const apiKeySecret = await secretClient.getSecret("ac-api-token");
      
      baseUrl = baseUrlSecret?.value;
      apiKey = apiKeySecret?.value;
      
      console.log("[AC-REMEDIATION-TEST] Base URL retrieved:", baseUrl ? "✓" : "✗");
      console.log("[AC-REMEDIATION-TEST] API Key retrieved:", apiKey ? "✓" : "✗");
      
      if (!baseUrl || !apiKey) {
        return res.status(500).json({ 
          error: "Failed to retrieve ActiveCampaign secrets from Key Vault.",
          details: `baseUrl: ${!!baseUrl}, apiKey: ${!!apiKey}`,
          acConnectionTest: "failed"
        });
      }
    } catch (error) {
      console.error("[AC-REMEDIATION-TEST] Key Vault error:", error);
      return res.status(500).json({ 
        error: "Failed to fetch ActiveCampaign secrets from Key Vault.",
        details: error.message,
        acConnectionTest: "failed"
      });
    }

    // Test ActiveCampaign connection by fetching account info
    let acConnectionTest = "failed";
    let acConnectionError = null;
    try {
      const testUrl = buildApiUrl(baseUrl, "/contacts?limit=1");
      console.log("[AC-REMEDIATION-TEST] Testing AC connection to:", testUrl);
      console.log("[AC-REMEDIATION-TEST] Using API key (first 10 chars):", apiKey.substring(0, 10) + "...");
      
      // Check if fetch is available
      if (typeof fetch === 'undefined') {
        throw new Error("fetch is not available - may need to install node-fetch");
      }
      
      await fetchJson(testUrl, {
        method: "GET",
        headers: {
          "Api-Token": apiKey,
          Accept: "application/json"
        }
      });
      acConnectionTest = "success";
      console.log("[AC-REMEDIATION-TEST] AC connection successful!");
    } catch (error) {
      acConnectionError = error.message;
      console.error("[AC-REMEDIATION-TEST] AC connection failed:", error);
      console.error("[AC-REMEDIATION-TEST] Error stack:", error.stack);
    }

    // If we can't connect to AC, return the error but with 200 status
    if (acConnectionTest === "failed") {
      return res.status(200).json({
        acConnectionTest: "failed",
        error: acConnectionError || "Failed to connect to ActiveCampaign API.",
        parsedCount: identifiers.length,
        identifierType,
        sampleResults: [],
        message: `Parsed ${identifiers.length} identifier(s) but could not connect to ActiveCampaign.`
      });
    }

    // Test a sample of identifiers
    const sampleSize = Math.min(5, identifiers.length);
    const sampleIdentifiers = identifiers.slice(0, sampleSize);
    const sampleResults = [];

    for (const identifier of sampleIdentifiers) {
      const result = {
        identifier,
        found_in_ac: false,
        ac_contact_id: null
      };

      try {
        if (identifierType === "email") {
          const contactId = await fetchAcContactIdByEmail(baseUrl, apiKey, identifier);
          result.found_in_ac = !!contactId;
          result.ac_contact_id = contactId;
        } else {
          // For ac_contact_id, verify it exists
          const url = buildApiUrl(baseUrl, `/contacts/${identifier}`);
          const payload = await fetchJson(url, {
            method: "GET",
            headers: {
              "Api-Token": apiKey,
              Accept: "application/json"
            }
          });
          result.found_in_ac = !!payload?.contact;
          result.ac_contact_id = payload?.contact?.id || null;
        }
      } catch (error) {
        result.found_in_ac = false;
      }

      sampleResults.push(result);
    }

    res.json({
      acConnectionTest,
      parsedCount: identifiers.length,
      identifierType,
      sampleResults,
      message: `Successfully parsed ${identifiers.length} identifier(s). Tested ${sampleSize} sample(s).`
    });
  });

  router.post("/run", async (req, res) => {
    const { identifierType, rawInput } = req.body || {};

    if (identifierType !== "email" && identifierType !== "ac_contact_id") {
      return res.status(400).json({ error: "identifierType must be 'email' or 'ac_contact_id'." });
    }

    let identifiers;
    try {
      identifiers = parseRawInput(rawInput, identifierType);
    } catch (error) {
      return res.status(400).json({ error: error.message || "Failed to parse input." });
    }

    let fieldId = process.env.TOUCHPOINT_DATE_FIELD_ID;

    const secretClient = req.app.locals.secretClient;
    
    if (!secretClient) {
      return res.status(500).json({ error: "SecretClient is not available." });
    }

    let baseUrl, apiKey;
    try {
      console.log("[AC-REMEDIATION-RUN] Fetching secrets from Key Vault...");
      const baseUrlSecret = await secretClient.getSecret("ac-base-url");
      const apiKeySecret = await secretClient.getSecret("ac-api-token");
      
      baseUrl = baseUrlSecret?.value;
      apiKey = apiKeySecret?.value;
      
      console.log("[AC-REMEDIATION-RUN] Base URL retrieved:", baseUrl ? "✓" : "✗");
      console.log("[AC-REMEDIATION-RUN] API Key retrieved:", apiKey ? "✓" : "✗");
      
      if (!baseUrl || !apiKey) {
        return res.status(500).json({ error: "Failed to retrieve ActiveCampaign secrets from Key Vault." });
      }
    } catch (error) {
      console.error("[AC-REMEDIATION-RUN] Key Vault error:", error);
      return res.status(500).json({ 
        error: "Failed to fetch ActiveCampaign secrets from Key Vault.",
        details: error.message 
      });
    }

    const touchpointPerstag = process.env.TOUCHPOINT_DATE_TAG || "%TOUCHPOINT_DATE%";
    const perstagsToResolve = [
      touchpointPerstag,
      ...ADDITIONAL_FIELD_MAPPINGS.map((mapping) => mapping.perstag)
    ];

    let fieldIdMap;
    try {
      fieldIdMap = await resolveFieldIdsByPerstags(baseUrl, apiKey, perstagsToResolve);
    } catch (error) {
      console.error("[AC-REMEDIATION-RUN] Failed to resolve field IDs:", error);
      return res.status(500).json({
        error: "Failed to resolve field IDs from ActiveCampaign.",
        details: error.message
      });
    }

    const normalizedTouchpointTag = normalizePerstag(touchpointPerstag);
    const resolvedTouchpointFieldId = fieldIdMap[normalizedTouchpointTag];

    if (!fieldId && resolvedTouchpointFieldId) {
      fieldId = resolvedTouchpointFieldId;
    }
    if (!fieldId) {
      return res.status(500).json({
        error: "Could not resolve touchpoint field ID from ActiveCampaign.",
        details: {
          triedTag: touchpointPerstag
        }
      });
    }

    const additionalFieldIds = ADDITIONAL_FIELD_MAPPINGS.reduce((acc, mapping) => {
      const normalizedTag = normalizePerstag(mapping.perstag);
      acc[mapping.key] = fieldIdMap[normalizedTag] || null;
      return acc;
    }, {});
    // Use the shared SQL helper to fetch the touchpoint date from the reporting database.
    console.log("[AC-REMEDIATION-RUN] Connecting to SQL database...");
    const pool = await getReportingPool(DEFAULT_WORKSPACE, secretClient);
    console.log("[AC-REMEDIATION-RUN] SQL connection established. Processing", identifiers.length, "identifiers...");

    const results = [];

    for (const identifier of identifiers) {
      const result = {
        identifier,
        resolved_ac_contact_id: null,
        sql_touchpoint_date: null,
        sql_contact_referrer: null,
        sql_method_of_contact: null,
        sql_referral_url: null,
        sql_point_of_contact: null,
        sql_ultimate_source: null,
        sql_call_taker: null,
        sql_area_of_work: null,
        sql_initial_first_call_notes: null,
        sql_value: null,
        status: "pending",
        error: null
      };

      try {
        // Resolve the ActiveCampaign contact ID first (or use it directly if supplied).
        const resolvedContactId =
          identifierType === "ac_contact_id"
            ? identifier
            : await fetchAcContactIdByEmail(baseUrl, apiKey, identifier);

        if (!resolvedContactId) {
          result.status = "skipped";
          result.error = "ActiveCampaign contact not found.";
          results.push(result);
          continue;
        }

        result.resolved_ac_contact_id = resolvedContactId;

        // Pull SQL contact data for the contact.
        const sqlRecord = await fetchContactData(
          pool,
          identifierType,
          identifier,
          resolvedContactId
        );

        if (!sqlRecord) {
          result.status = "skipped";
          result.error = "Contact not found in SQL.";
          results.push(result);
          continue;
        }

        let updateCount = 0;
        const updateErrors = [];

        if (sqlRecord.touchpoint_date) {
          try {
            const normalizedDate = normalizeTouchpointDate(sqlRecord.touchpoint_date);
            await updateFieldValue(baseUrl, apiKey, fieldId, resolvedContactId, normalizedDate);
            result.sql_touchpoint_date = normalizedDate;
            updateCount += 1;
          } catch (error) {
            updateErrors.push("Failed to sync touchpoint date.");
          }
        } else {
          result.sql_touchpoint_date = null;
        }

        for (const mapping of ADDITIONAL_FIELD_MAPPINGS) {
          const rawValue = sqlRecord[mapping.column];
          const normalizedValue =
            rawValue === null || rawValue === undefined
              ? null
              : String(rawValue).trim();

          result[mapping.key] = normalizedValue;

          if (!normalizedValue) {
            continue;
          }

          const fieldIdForMapping = additionalFieldIds[mapping.key];
          if (!fieldIdForMapping) {
            updateErrors.push(`Missing ActiveCampaign field for ${mapping.perstag}.`);
            continue;
          }

          try {
            await updateFieldValue(baseUrl, apiKey, fieldIdForMapping, resolvedContactId, normalizedValue);
            updateCount += 1;
          } catch (error) {
            updateErrors.push(`Failed to sync ${mapping.perstag}.`);
          }
        }

        if (updateCount === 0) {
          result.status = "skipped";
          result.error = updateErrors.length > 0 ? updateErrors.join(" ") : "No SQL values to sync.";
        } else {
          result.status = "success";
          result.error = updateErrors.length > 0 ? updateErrors.join(" ") : null;
        }

        results.push(result);
      } catch (error) {
        result.status = "failed";
        result.error = error.message || "Unknown error.";
        results.push(result);
        console.error("[AC-REMEDIATION] Failed to sync contact", {
          identifier,
          identifierType,
          error
        });
      }
    }

    res.json({ results });
  });

  router.post("/poid-run", async (req, res) => {
    const { identifierType, rawInput } = req.body || {};

    if (identifierType !== "email" && identifierType !== "ac_contact_id") {
      return res.status(400).json({ error: "identifierType must be 'email' or 'ac_contact_id'." });
    }

    let identifiers;
    try {
      identifiers = parseRawInput(rawInput, identifierType);
    } catch (error) {
      return res.status(400).json({ error: error.message || "Failed to parse input." });
    }

    const secretClient = req.app.locals.secretClient;

    if (!secretClient) {
      return res.status(500).json({ error: "SecretClient is not available." });
    }

    let baseUrl, apiKey;
    try {
      console.log("[AC-REMEDIATION-POID] Fetching secrets from Key Vault...");
      const baseUrlSecret = await secretClient.getSecret("ac-base-url");
      const apiKeySecret = await secretClient.getSecret("ac-api-token");

      baseUrl = baseUrlSecret?.value;
      apiKey = apiKeySecret?.value;

      console.log("[AC-REMEDIATION-POID] Base URL retrieved:", baseUrl ? "✓" : "✗");
      console.log("[AC-REMEDIATION-POID] API Key retrieved:", apiKey ? "✓" : "✗");

      if (!baseUrl || !apiKey) {
        return res.status(500).json({ error: "Failed to retrieve ActiveCampaign secrets from Key Vault." });
      }
    } catch (error) {
      console.error("[AC-REMEDIATION-POID] Key Vault error:", error);
      return res.status(500).json({
        error: "Failed to fetch ActiveCampaign secrets from Key Vault.",
        details: error.message
      });
    }

    const perstagsToResolve = POID_FIELD_MAPPINGS.map((mapping) => mapping.perstag);

    let fieldIdMap;
    try {
      fieldIdMap = await resolveFieldIdsByPerstags(baseUrl, apiKey, perstagsToResolve);
    } catch (error) {
      console.error("[AC-REMEDIATION-POID] Failed to resolve field IDs:", error);
      return res.status(500).json({
        error: "Failed to resolve field IDs from ActiveCampaign.",
        details: error.message
      });
    }

    const poidFieldIds = POID_FIELD_MAPPINGS.reduce((acc, mapping) => {
      const normalizedTag = normalizePerstag(mapping.perstag);
      acc[mapping.key] = fieldIdMap[normalizedTag] || null;
      return acc;
    }, {});

    console.log("[AC-REMEDIATION-POID] Connecting to SQL database...");
    const pool = await getReportingPool(DEFAULT_WORKSPACE, secretClient);
    console.log("[AC-REMEDIATION-POID] SQL connection established. Processing", identifiers.length, "identifiers...");

    const results = [];

    for (const identifier of identifiers) {
      const result = {
        identifier,
        resolved_ac_contact_id: null,
        sql_country_code: null,
        sql_drivers_license_number: null,
        sql_gender: null,
        sql_submission_url: null,
        sql_house_building_number: null,
        sql_nationality: null,
        sql_company_country: null,
        sql_company_county: null,
        sql_company_city: null,
        sql_company_post_code: null,
        sql_company_street: null,
        sql_company_house_building_number: null,
        sql_street: null,
        sql_county: null,
        sql_post_code: null,
        sql_city: null,
        sql_country: null,
        status: "pending",
        error: null
      };

      try {
        const resolvedContactId =
          identifierType === "ac_contact_id"
            ? identifier
            : await fetchAcContactIdByEmail(baseUrl, apiKey, identifier);

        if (!resolvedContactId) {
          result.status = "skipped";
          result.error = "ActiveCampaign contact not found.";
          results.push(result);
          continue;
        }

        result.resolved_ac_contact_id = resolvedContactId;

        const sqlRecord = await fetchPoidData(pool, identifierType, identifier, resolvedContactId);

        if (!sqlRecord) {
          result.status = "skipped";
          result.error = "Contact not found in SQL.";
          results.push(result);
          continue;
        }

        let updateCount = 0;
        const updateErrors = [];

        for (const mapping of POID_FIELD_MAPPINGS) {
          const rawValue = sqlRecord[mapping.column];
          const normalizedValue =
            rawValue === null || rawValue === undefined
              ? null
              : String(rawValue).trim();

          result[mapping.key] = normalizedValue;

          if (!normalizedValue) {
            continue;
          }

          const fieldIdForMapping = poidFieldIds[mapping.key];
          if (!fieldIdForMapping) {
            updateErrors.push(`Missing ActiveCampaign field for ${mapping.perstag}.`);
            continue;
          }

          try {
            await updateFieldValue(baseUrl, apiKey, fieldIdForMapping, resolvedContactId, normalizedValue);
            updateCount += 1;
          } catch (error) {
            updateErrors.push(`Failed to sync ${mapping.perstag}.`);
          }
        }

        if (updateCount === 0) {
          result.status = "skipped";
          result.error = updateErrors.length > 0 ? updateErrors.join(" ") : "No SQL values to sync.";
        } else {
          result.status = "success";
          result.error = updateErrors.length > 0 ? updateErrors.join(" ") : null;
        }

        results.push(result);
      } catch (error) {
        result.status = "failed";
        result.error = error.message || "Unknown error.";
        results.push(result);
        console.error("[AC-REMEDIATION-POID] Failed to sync contact", {
          identifier,
          identifierType,
          error
        });
      }
    }

    res.json({ results });
  });

  return router;
}

module.exports = {
  createAcRemediationRouter
};