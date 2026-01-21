import { useEffect } from "react";
import { Link } from "react-router-dom";

interface TableSelection {
  schema: string;
  table: string;
}

interface TableEntry {
  TABLE_SCHEMA: string;
  TABLE_NAME: string;
}

interface ColumnEntry {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  IS_NULLABLE: string;
}

type JsonRecord = Record<string, string | number | boolean | null>;

const parseJsonField = (value: FormDataEntryValue | null, fallbackMessage: string) => {
  if (typeof value !== "string") {
    throw new Error(fallbackMessage);
  }
  return JSON.parse(value);
};

const initReportingHub = (apiBase: string) => {
  const tableSelect = document.getElementById("tableSelect") as HTMLSelectElement | null;
  const schemaList = document.getElementById("schemaList") as HTMLUListElement | null;
  const dataTable = document.getElementById("dataTable") as HTMLTableElement | null;
  const statusMessage = document.getElementById("statusMessage") as HTMLDivElement | null;
  const rowCount = document.getElementById("rowCount") as HTMLSpanElement | null;
  const refreshButton = document.getElementById("refreshButton") as HTMLButtonElement | null;

  const insertForm = document.getElementById("insertForm") as HTMLFormElement | null;
  const updateForm = document.getElementById("updateForm") as HTMLFormElement | null;
  const deleteForm = document.getElementById("deleteForm") as HTMLFormElement | null;

  if (
    !tableSelect ||
    !schemaList ||
    !dataTable ||
    !statusMessage ||
    !rowCount ||
    !refreshButton ||
    !insertForm ||
    !updateForm ||
    !deleteForm
  ) {
    return () => undefined;
  }

  let currentSelection: TableSelection = { schema: "dbo", table: "TeamIssues" };

  const setStatus = (text: string, tone: "info" | "error" = "info") => {
    statusMessage.textContent = text;
    statusMessage.style.background = tone === "error" ? "#fee2e2" : "#eef1f7";
    statusMessage.style.color = tone === "error" ? "#991b1b" : "#1f2430";
  };

  const setFormStatus = (formName: string, text: string, isError: boolean) => {
    const target = document.querySelector(`[data-form-status='${formName}']`) as HTMLParagraphElement | null;
    if (!target) return;
    target.textContent = text;
    target.style.color = isError ? "#991b1b" : "#2563eb";
  };

  const fetchJson = async <T,>(url: string, options?: RequestInit): Promise<T> => {
    const response = await fetch(url, options);
    const payload = (await response.json()) as { error?: string } & T;
    if (!response.ok) {
      const message = payload && payload.error ? payload.error : "Request failed";
      throw new Error(message);
    }
    return payload;
  };

  const buildOptionLabel = (entry: TableEntry) => `${entry.TABLE_SCHEMA}.${entry.TABLE_NAME}`;

  const renderSchema = (columns: ColumnEntry[]) => {
    schemaList.innerHTML = "";
    columns.forEach((column) => {
      const li = document.createElement("li");
      li.textContent = `${column.COLUMN_NAME} · ${column.DATA_TYPE} · ${
        column.IS_NULLABLE === "YES" ? "nullable" : "required"
      }`;
      schemaList.appendChild(li);
    });
  };

  const renderRows = (rows: JsonRecord[]) => {
    const head = dataTable.querySelector("thead");
    const body = dataTable.querySelector("tbody");

    if (!head || !body) {
      return;
    }

    head.innerHTML = "";
    body.innerHTML = "";

    if (!rows.length) {
      rowCount.textContent = "No rows returned.";
      return;
    }

    const columns = Object.keys(rows[0]);
    const headerRow = document.createElement("tr");
    columns.forEach((column) => {
      const th = document.createElement("th");
      th.textContent = column;
      headerRow.appendChild(th);
    });
    head.appendChild(headerRow);

    rows.forEach((row) => {
      const tr = document.createElement("tr");
      columns.forEach((column) => {
        const td = document.createElement("td");
        const value = row[column];
        td.textContent = value === null || value === undefined ? "" : String(value);
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });

    rowCount.textContent = `${rows.length} row(s) loaded.`;
  };

  const loadTables = async () => {
    setStatus("Loading tables…");
    const data = await fetchJson<{ tables: TableEntry[] }>(`${apiBase}/tables`);
    tableSelect.innerHTML = "";

    data.tables.forEach((entry) => {
      const option = document.createElement("option");
      option.value = buildOptionLabel(entry);
      option.textContent = option.value;
      tableSelect.appendChild(option);
    });

    const defaultLabel = `${currentSelection.schema}.${currentSelection.table}`;
    const fallbackOption = Array.from(tableSelect.options).find(
      (option) => option.value === defaultLabel
    );

    if (fallbackOption) {
      tableSelect.value = defaultLabel;
    } else if (tableSelect.options.length) {
      tableSelect.selectedIndex = 0;
      const [schema, table] = tableSelect.value.split(".");
      currentSelection = { schema, table };
    }

    setStatus("Ready");
  };

  const loadSchemaAndRows = async () => {
    const [schema, table] = tableSelect.value.split(".");
    currentSelection = { schema, table };

    setStatus(`Loading ${schema}.${table}…`);

    const [schemaResponse, rowResponse] = await Promise.all([
      fetchJson<{ columns: ColumnEntry[] }>(`${apiBase}/tables/${schema}/${table}/columns`),
      fetchJson<{ rows: JsonRecord[] }>(`${apiBase}/tables/${schema}/${table}/rows`)
    ]);

    renderSchema(schemaResponse.columns);
    renderRows(rowResponse.rows);

    setStatus(`Loaded ${schema}.${table}`);
  };

  const handleRefresh = () => {
    loadSchemaAndRows().catch((error: Error) => {
      setStatus(error.message, "error");
    });
  };

  const handleTableChange = () => {
    loadSchemaAndRows().catch((error: Error) => {
      setStatus(error.message, "error");
    });
  };

  const handleInsert = async (event: SubmitEvent) => {
    event.preventDefault();
    setFormStatus("insert", "", false);

    try {
      const values = parseJsonField(
        new FormData(insertForm).get("values"),
        "Insert values missing."
      );
      await fetchJson(
        `${apiBase}/tables/${currentSelection.schema}/${currentSelection.table}/insert`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ values })
        }
      );
      setFormStatus("insert", "Insert successful.", false);
      await loadSchemaAndRows();
    } catch (error) {
      setFormStatus("insert", error instanceof Error ? error.message : "Insert failed.", true);
    }
  };

  const handleUpdate = async (event: SubmitEvent) => {
    event.preventDefault();
    setFormStatus("update", "", false);

    try {
      const formData = new FormData(updateForm);
      const keyColumn = formData.get("keyColumn");
      const keyValue = formData.get("keyValue");
      const updates = parseJsonField(formData.get("updates"), "Update values missing.");

      await fetchJson(
        `${apiBase}/tables/${currentSelection.schema}/${currentSelection.table}/update`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyColumn, keyValue, updates })
        }
      );
      setFormStatus("update", "Update successful.", false);
      await loadSchemaAndRows();
    } catch (error) {
      setFormStatus("update", error instanceof Error ? error.message : "Update failed.", true);
    }
  };

  const handleDelete = async (event: SubmitEvent) => {
    event.preventDefault();
    setFormStatus("delete", "", false);

    try {
      const formData = new FormData(deleteForm);
      const keyColumn = formData.get("keyColumn");
      const keyValue = formData.get("keyValue");

      await fetchJson(
        `${apiBase}/tables/${currentSelection.schema}/${currentSelection.table}/delete`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyColumn, keyValue })
        }
      );
      setFormStatus("delete", "Delete successful.", false);
      await loadSchemaAndRows();
    } catch (error) {
      setFormStatus("delete", error instanceof Error ? error.message : "Delete failed.", true);
    }
  };

  refreshButton.addEventListener("click", handleRefresh);
  tableSelect.addEventListener("change", handleTableChange);
  insertForm.addEventListener("submit", handleInsert);
  updateForm.addEventListener("submit", handleUpdate);
  deleteForm.addEventListener("submit", handleDelete);

  void (async () => {
    try {
      await loadTables();
      await loadSchemaAndRows();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to connect.", "error");
    }
  })();

  return () => {
    refreshButton.removeEventListener("click", handleRefresh);
    tableSelect.removeEventListener("change", handleTableChange);
    insertForm.removeEventListener("submit", handleInsert);
    updateForm.removeEventListener("submit", handleUpdate);
    deleteForm.removeEventListener("submit", handleDelete);
  };
};

interface ReportingPageProps {
  title: string;
  description: string;
  apiBase: string;
}

const ReportingPage = ({ title, description, apiBase }: ReportingPageProps) => {
  useEffect(() => initReportingHub(apiBase), [apiBase]);

  return (
    <div>
      <header className="page-header">
        <div>
          <p className="eyebrow">Helix Reporting Hub</p>
          <h1>{title}</h1>
          <p>{description}</p>
          <Link className="back-link" to="/">
            Back to home
          </Link>
        </div>
        <div className="status" id="statusMessage">
          Connecting…
        </div>
      </header>

      <main className="layout">
        <section className="panel">
          <h2>Database Explorer</h2>
          <label className="field">
            <span>Table</span>
            <select id="tableSelect"></select>
          </label>
          <div className="schema">
            <h3>Schema</h3>
            <ul id="schemaList"></ul>
          </div>
        </section>

        <section className="panel">
          <h2>Data Preview</h2>
          <div className="toolbar">
            <button id="refreshButton">Refresh</button>
            <span id="rowCount"></span>
          </div>
          <div className="table-wrap">
            <table id="dataTable">
              <thead></thead>
              <tbody></tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <h2>Quick Edit</h2>
          <p className="hint">
            Use the forms below to insert, update, or delete rows. Keep payloads small and test
            carefully.
          </p>

          <form id="insertForm" className="form">
            <h3>Insert</h3>
            <label>
              <span>Values (JSON)</span>
              <textarea name="values" rows={4} placeholder='{"title":"New item","priority":"Medium"}'></textarea>
            </label>
            <button type="submit">Insert Row</button>
            <p className="form-status" data-form-status="insert"></p>
          </form>

          <form id="updateForm" className="form">
            <h3>Update</h3>
            <label>
              <span>Key column</span>
              <input name="keyColumn" placeholder="IssueId" />
            </label>
            <label>
              <span>Key value</span>
              <input name="keyValue" placeholder="123" />
            </label>
            <label>
              <span>Updates (JSON)</span>
              <textarea name="updates" rows={4} placeholder='{"priority":"Low"}'></textarea>
            </label>
            <button type="submit">Update Row</button>
            <p className="form-status" data-form-status="update"></p>
          </form>

          <form id="deleteForm" className="form">
            <h3>Delete</h3>
            <label>
              <span>Key column</span>
              <input name="keyColumn" placeholder="IssueId" />
            </label>
            <label>
              <span>Key value</span>
              <input name="keyValue" placeholder="123" />
            </label>
            <button type="submit">Delete Row</button>
            <p className="form-status" data-form-status="delete"></p>
          </form>
        </section>
      </main>
    </div>
  );
};

const reportingDescription =
  "A clean, standalone reporting hub that surfaces schema metadata and lets you view or edit live database rows in one place.";

export const HelixProjectDataPage = () => (
  <ReportingPage
    title="Helix Project Data"
    description={reportingDescription}
    apiBase="/api/reporting/helix-project-data"
  />
);

export const HelixCoreDataPage = () => (
  <ReportingPage
    title="Helix Core Data"
    description={reportingDescription}
    apiBase="/api/reporting/helix-core-data"
  />
);

export const InstructionsPage = () => (
  <ReportingPage
    title="Instructions"
    description={reportingDescription}
    apiBase="/api/reporting/instructions"
  />
);

export default ReportingPage;