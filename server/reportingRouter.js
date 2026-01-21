const express = require("express");
const sql = require("mssql");
const { getReportingPool } = require("./db");

const router = express.Router();

const safeIdentifier = /^[A-Za-z0-9_]+$/;

function assertSafeIdentifier(value, label) {
  if (!safeIdentifier.test(value)) {
    throw new Error(`Unsafe ${label} identifier provided.`);
  }
}

async function fetchColumns(schema, table, secretClient) {
  const pool = await getReportingPool(secretClient);
  const result = await pool
    .request()
    .input("schema", sql.NVarChar, schema)
    .input("table", sql.NVarChar, table)
    .query(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table
       ORDER BY ORDINAL_POSITION`
    );
  return result.recordset;
}

router.get("/tables", async (req, res) => {
  try {
    const secretClient = req.app.locals.secretClient;
    const pool = await getReportingPool(secretClient);
    const result = await pool.request().query(
      `SELECT TABLE_SCHEMA, TABLE_NAME
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_SCHEMA, TABLE_NAME`
    );

    res.json({ tables: result.recordset });
  } catch (error) {
    console.error("[REPORTING-HUB] Failed to load tables:", error);
    res.status(500).json({ error: "Failed to load tables." });
  }
});

router.get("/tables/:schema/:table/columns", async (req, res) => {
  const { schema, table } = req.params;

  try {
    assertSafeIdentifier(schema, "schema");
    assertSafeIdentifier(table, "table");

    const secretClient = req.app.locals.secretClient;
    const columns = await fetchColumns(schema, table, secretClient);
    res.json({ schema, table, columns });
  } catch (error) {
    console.error("[REPORTING-HUB] Failed to load columns:", error);
    res.status(500).json({ error: "Failed to load columns." });
  }
});

router.get("/tables/:schema/:table/rows", async (req, res) => {
  const { schema, table } = req.params;
  const limit = Math.min(Number(req.query.limit || 50), 200);

  try {
    assertSafeIdentifier(schema, "schema");
    assertSafeIdentifier(table, "table");

    const secretClient = req.app.locals.secretClient;
    const pool = await getReportingPool(secretClient);
    const query = `SELECT TOP (${limit}) * FROM [${schema}].[${table}]`;
    const result = await pool.request().query(query);
    res.json({ schema, table, rows: result.recordset });
  } catch (error) {
    console.error("[REPORTING-HUB] Failed to load rows:", error);
    res.status(500).json({ error: "Failed to load rows." });
  }
});

router.post("/tables/:schema/:table/insert", async (req, res) => {
  const { schema, table } = req.params;
  const { values } = req.body || {};

  try {
    assertSafeIdentifier(schema, "schema");
    assertSafeIdentifier(table, "table");

    if (!values || typeof values !== "object" || Array.isArray(values)) {
      return res.status(400).json({ error: "values must be an object." });
    }

    const secretClient = req.app.locals.secretClient;
    const columns = await fetchColumns(schema, table, secretClient);
    const allowed = new Set(columns.map((col) => col.COLUMN_NAME));
    const entries = Object.entries(values).filter(([key]) => allowed.has(key));

    if (!entries.length) {
      return res.status(400).json({ error: "No valid column values provided." });
    }

    const columnNames = entries.map(([key]) => `[${key}]`).join(", ");
    const paramNames = entries.map(([key]) => `@${key}`).join(", ");

    const pool = await getReportingPool(secretClient);
    const request = pool.request();
    entries.forEach(([key, value]) => {
      request.input(key, value);
    });

    const query = `INSERT INTO [${schema}].[${table}] (${columnNames}) VALUES (${paramNames})`;
    await request.query(query);

    res.json({ status: "inserted", insertedColumns: entries.map(([key]) => key) });
  } catch (error) {
    console.error("[REPORTING-HUB] Failed to insert row:", error);
    res.status(500).json({ error: "Failed to insert row." });
  }
});

router.patch("/tables/:schema/:table/update", async (req, res) => {
  const { schema, table } = req.params;
  const { keyColumn, keyValue, updates } = req.body || {};

  try {
    assertSafeIdentifier(schema, "schema");
    assertSafeIdentifier(table, "table");

    if (!keyColumn || typeof keyColumn !== "string") {
      return res.status(400).json({ error: "keyColumn is required." });
    }

    if (keyValue === undefined || keyValue === null) {
      return res.status(400).json({ error: "keyValue is required." });
    }

    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
      return res.status(400).json({ error: "updates must be an object." });
    }

    const secretClient = req.app.locals.secretClient;
    const columns = await fetchColumns(schema, table, secretClient);
    const allowed = new Set(columns.map((col) => col.COLUMN_NAME));

    if (!allowed.has(keyColumn)) {
      return res.status(400).json({ error: "keyColumn is not a valid column." });
    }

    const entries = Object.entries(updates).filter(([key]) => allowed.has(key));

    if (!entries.length) {
      return res.status(400).json({ error: "No valid updates provided." });
    }

    const setClause = entries.map(([key]) => `[${key}] = @${key}`).join(", ");

    const pool = await getReportingPool(secretClient);
    const request = pool.request();
    entries.forEach(([key, value]) => {
      request.input(key, value);
    });
    request.input("keyValue", keyValue);

    const query = `UPDATE [${schema}].[${table}] SET ${setClause} WHERE [${keyColumn}] = @keyValue`;
    const result = await request.query(query);

    res.json({ status: "updated", rowsAffected: result.rowsAffected?.[0] || 0 });
  } catch (error) {
    console.error("[REPORTING-HUB] Failed to update row:", error);
    res.status(500).json({ error: "Failed to update row." });
  }
});

router.delete("/tables/:schema/:table/delete", async (req, res) => {
  const { schema, table } = req.params;
  const { keyColumn, keyValue } = req.body || {};

  try {
    assertSafeIdentifier(schema, "schema");
    assertSafeIdentifier(table, "table");

    if (!keyColumn || typeof keyColumn !== "string") {
      return res.status(400).json({ error: "keyColumn is required." });
    }

    if (keyValue === undefined || keyValue === null) {
      return res.status(400).json({ error: "keyValue is required." });
    }

    const secretClient = req.app.locals.secretClient;
    const columns = await fetchColumns(schema, table, secretClient);
    const allowed = new Set(columns.map((col) => col.COLUMN_NAME));

    if (!allowed.has(keyColumn)) {
      return res.status(400).json({ error: "keyColumn is not a valid column." });
    }

    const pool = await getReportingPool(secretClient);
    const request = pool.request();
    request.input("keyValue", keyValue);

    const query = `DELETE FROM [${schema}].[${table}] WHERE [${keyColumn}] = @keyValue`;
    const result = await request.query(query);

    res.json({ status: "deleted", rowsAffected: result.rowsAffected?.[0] || 0 });
  } catch (error) {
    console.error("[REPORTING-HUB] Failed to delete row:", error);
    res.status(500).json({ error: "Failed to delete row." });
  }
});

module.exports = router;