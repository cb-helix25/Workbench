const express = require("express");
const sql = require("mssql");
const { getReportingPool } = require("./db");

const safeIdentifier = /^[A-Za-z0-9_]+$/;

function assertSafeIdentifier(value, label) {
  if (!safeIdentifier.test(value)) {
    throw new Error(`Unsafe ${label} identifier provided.`);
  }
}

function assertQueryPasscode(req, res) {
  const configuredPasscode = process.env.REPORTING_QUERY_PASSCODE;
  if (!configuredPasscode) {
    res.status(503).json({ error: "Query passcode is not configured." });
    return false;
  }

  const provided = req.body?.passcode || req.headers["x-reporting-passcode"];
  if (!provided || provided !== configuredPasscode) {
    res.status(401).json({ error: "Invalid passcode." });
    return false;
  }

  return true;
}

async function runInTransaction(pool, action, commit = false) {
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const result = await action(transaction);
    if (commit) {
      await transaction.commit();
    } else {
      await transaction.rollback();
    }
    return result;
  } catch (error) {
    try {
      if (!transaction._aborted) {
        await transaction.rollback();
      }
    } catch (rollbackError) {
      console.error("[REPORTING-HUB] Failed to rollback transaction:", rollbackError);
    }
    throw error;
  }
}

async function fetchColumns(schema, table, secretClient, workspaceKey) {
  const pool = await getReportingPool(workspaceKey, secretClient);
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

function createReportingRouter(workspaceKey) {
  const router = express.Router();

  router.get("/tables", async (req, res) => {
    try {
      const secretClient = req.app.locals.secretClient;
      const pool = await getReportingPool(workspaceKey, secretClient);
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
      const columns = await fetchColumns(schema, table, secretClient, workspaceKey);
      res.json({ schema, table, columns });
    } catch (error) {
      console.error("[REPORTING-HUB] Failed to load columns:", error);
      res.status(500).json({ error: "Failed to load columns." });
    }
  });

  router.get("/tables/:schema/:table/rows", async (req, res) => {
    const { schema, table } = req.params;
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(Number(req.query.pageSize || 50), 200);
    const offset = (page - 1) * pageSize;

    try {
      assertSafeIdentifier(schema, "schema");
      assertSafeIdentifier(table, "table");

      const secretClient = req.app.locals.secretClient;
      const pool = await getReportingPool(workspaceKey, secretClient);
      
      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM [${schema}].[${table}]`;
      const countResult = await pool.request().query(countQuery);
      const total = countResult.recordset[0].total;
      
      // Get first column name for ordering
      const columnsResult = await pool.request()
        .input("schema", sql.NVarChar, schema)
        .input("table", sql.NVarChar, table)
        .query(
          `SELECT TOP 1 COLUMN_NAME
           FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table
           ORDER BY ORDINAL_POSITION`
        );
      const orderColumn = columnsResult.recordset[0]?.COLUMN_NAME || "1";
      
      // Get paginated rows
      const query = `
        SELECT * FROM [${schema}].[${table}]
        ORDER BY [${orderColumn}]
        OFFSET ${offset} ROWS
        FETCH NEXT ${pageSize} ROWS ONLY
      `;
      const result = await pool.request().query(query);
      
      res.json({ 
        schema, 
        table, 
        rows: result.recordset,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      });
    } catch (error) {
      console.error("[REPORTING-HUB] Failed to load rows:", error);
      res.status(500).json({ error: "Failed to load rows." });
    }
  });

  router.post("/tables/:schema/:table/query", async (req, res) => {
    const { schema, table } = req.params;
    const { query } = req.body || {};

    try {
      assertSafeIdentifier(schema, "schema");
      assertSafeIdentifier(table, "table");

      if (!assertQueryPasscode(req, res)) {
        return;
      }

      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Query string is required." });
      }

      // Only allow SELECT statements
      const trimmedQuery = query.trim().toLowerCase();
      if (!trimmedQuery.startsWith("select")) {
        return res.status(400).json({ error: "Only SELECT queries are allowed." });
      }

      // Prevent potentially dangerous keywords
      const dangerousKeywords = ["drop", "delete", "insert", "update", "alter", "create", "truncate", "exec", "execute"];
      if (dangerousKeywords.some(keyword => trimmedQuery.includes(keyword))) {
        return res.status(400).json({ error: "Query contains forbidden keywords." });
      }

      const secretClient = req.app.locals.secretClient;
      const pool = await getReportingPool(workspaceKey, secretClient);
      
      // Execute the query with a reasonable limit
      const result = await pool.request().query(query);
      
      res.json({ 
        schema, 
        table, 
        rows: result.recordset,
        rowCount: result.recordset.length
      });
    } catch (error) {
      console.error("[REPORTING-HUB] Query execution failed:", error);
      res.status(500).json({ error: error.message || "Query execution failed." });
    }
  });

  router.post("/tables/:schema/:table/insert/preview", async (req, res) => {
    const { schema, table } = req.params;
    const { values } = req.body || {};

    try {
      assertSafeIdentifier(schema, "schema");
      assertSafeIdentifier(table, "table");

      if (!values || typeof values !== "object" || Array.isArray(values)) {
        return res.status(400).json({ error: "values must be an object." });
      }

      const secretClient = req.app.locals.secretClient;
      const columns = await fetchColumns(schema, table, secretClient, workspaceKey);
      const allowed = new Set(columns.map((col) => col.COLUMN_NAME));
      const entries = Object.entries(values).filter(([key]) => allowed.has(key));

      if (!entries.length) {
        return res.status(400).json({ error: "No valid column values provided." });
      }

      const columnNames = entries.map(([key]) => `[${key}]`).join(", ");
      const paramNames = entries.map(([key]) => `@${key}`).join(", ");

      const pool = await getReportingPool(workspaceKey, secretClient);
      const result = await runInTransaction(pool, async (transaction) => {
        const request = transaction.request();
        entries.forEach(([key, value]) => {
          request.input(key, value);
        });
        const query = `INSERT INTO [${schema}].[${table}] (${columnNames}) VALUES (${paramNames})`;
        const response = await request.query(query);
        return response.rowsAffected?.[0] || 0;
      });

      res.json({ status: "preview", rowsAffected: result });
    } catch (error) {
      console.error("[REPORTING-HUB] Failed to preview insert:", error);
      res.status(500).json({ error: "Failed to preview insert." });
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
      const columns = await fetchColumns(schema, table, secretClient, workspaceKey);
      const allowed = new Set(columns.map((col) => col.COLUMN_NAME));
      const entries = Object.entries(values).filter(([key]) => allowed.has(key));

      if (!entries.length) {
        return res.status(400).json({ error: "No valid column values provided." });
      }

      const columnNames = entries.map(([key]) => `[${key}]`).join(", ");
      const paramNames = entries.map(([key]) => `@${key}`).join(", ");

      const pool = await getReportingPool(workspaceKey, secretClient);
      const rowsAffected = await runInTransaction(
        pool,
        async (transaction) => {
          const request = transaction.request();
          entries.forEach(([key, value]) => {
            request.input(key, value);
          });
          const query = `INSERT INTO [${schema}].[${table}] (${columnNames}) VALUES (${paramNames})`;
          const result = await request.query(query);
          return result.rowsAffected?.[0] || 0;
        },
        true
      );

      res.json({
        status: "inserted",
        insertedColumns: entries.map(([key]) => key),
        rowsAffected
      });
    } catch (error) {
      console.error("[REPORTING-HUB] Failed to insert row:", error);
      res.status(500).json({ error: "Failed to insert row." });
    }
  });

  router.patch("/tables/:schema/:table/update/preview", async (req, res) => {
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
      const columns = await fetchColumns(schema, table, secretClient, workspaceKey);
      const allowed = new Set(columns.map((col) => col.COLUMN_NAME));

      if (!allowed.has(keyColumn)) {
        return res.status(400).json({ error: "keyColumn is not a valid column." });
      }

      const entries = Object.entries(updates).filter(([key]) => allowed.has(key));

      if (!entries.length) {
        return res.status(400).json({ error: "No valid updates provided." });
      }

      const setClause = entries.map(([key]) => `[${key}] = @${key}`).join(", ");

      const pool = await getReportingPool(workspaceKey, secretClient);
      const rowsAffected = await runInTransaction(pool, async (transaction) => {
        const request = transaction.request();
        entries.forEach(([key, value]) => {
          request.input(key, value);
        });
        request.input("keyValue", keyValue);

        const query = `UPDATE [${schema}].[${table}] SET ${setClause} WHERE [${keyColumn}] = @keyValue`;
        const result = await request.query(query);
        return result.rowsAffected?.[0] || 0;
      });

      res.json({ status: "preview", rowsAffected });
    } catch (error) {
      console.error("[REPORTING-HUB] Failed to preview update:", error);
      res.status(500).json({ error: "Failed to preview update." });
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
      const columns = await fetchColumns(schema, table, secretClient, workspaceKey);
      const allowed = new Set(columns.map((col) => col.COLUMN_NAME));

      if (!allowed.has(keyColumn)) {
        return res.status(400).json({ error: "keyColumn is not a valid column." });
      }

      const entries = Object.entries(updates).filter(([key]) => allowed.has(key));

      if (!entries.length) {
        return res.status(400).json({ error: "No valid updates provided." });
      }

      const setClause = entries.map(([key]) => `[${key}] = @${key}`).join(", ");

      const pool = await getReportingPool(workspaceKey, secretClient);
      const rowsAffected = await runInTransaction(
        pool,
        async (transaction) => {
          const request = transaction.request();
          entries.forEach(([key, value]) => {
            request.input(key, value);
          });
          request.input("keyValue", keyValue);

          const query = `UPDATE [${schema}].[${table}] SET ${setClause} WHERE [${keyColumn}] = @keyValue`;
          const result = await request.query(query);
          return result.rowsAffected?.[0] || 0;
        },
        true
      );

      res.json({ status: "updated", rowsAffected });
    } catch (error) {
      console.error("[REPORTING-HUB] Failed to update row:", error);
      res.status(500).json({ error: "Failed to update row." });
    }
  });

  router.delete("/tables/:schema/:table/delete/preview", async (req, res) => {
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
      const columns = await fetchColumns(schema, table, secretClient, workspaceKey);
      const allowed = new Set(columns.map((col) => col.COLUMN_NAME));

      if (!allowed.has(keyColumn)) {
        return res.status(400).json({ error: "keyColumn is not a valid column." });
      }

      const pool = await getReportingPool(workspaceKey, secretClient);
      const rowsAffected = await runInTransaction(pool, async (transaction) => {
        const request = transaction.request();
        request.input("keyValue", keyValue);

        const query = `DELETE FROM [${schema}].[${table}] WHERE [${keyColumn}] = @keyValue`;
        const result = await request.query(query);
        return result.rowsAffected?.[0] || 0;
      });

      res.json({ status: "preview", rowsAffected });
    } catch (error) {
      console.error("[REPORTING-HUB] Failed to preview delete:", error);
      res.status(500).json({ error: "Failed to preview delete." });
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
      const columns = await fetchColumns(schema, table, secretClient, workspaceKey);
      const allowed = new Set(columns.map((col) => col.COLUMN_NAME));

      if (!allowed.has(keyColumn)) {
        return res.status(400).json({ error: "keyColumn is not a valid column." });
      }

      const pool = await getReportingPool(workspaceKey, secretClient);
      const rowsAffected = await runInTransaction(
        pool,
        async (transaction) => {
          const request = transaction.request();
          request.input("keyValue", keyValue);

          const query = `DELETE FROM [${schema}].[${table}] WHERE [${keyColumn}] = @keyValue`;
          const result = await request.query(query);
          return result.rowsAffected?.[0] || 0;
        },
        true
      );

      res.json({ status: "deleted", rowsAffected });
    } catch (error) {
      console.error("[REPORTING-HUB] Failed to delete row:", error);
      res.status(500).json({ error: "Failed to delete row." });
    }
  });

  return router;
}

module.exports = { createReportingRouter };