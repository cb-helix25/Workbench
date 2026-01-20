const tableSelect = document.getElementById("tableSelect");
const schemaList = document.getElementById("schemaList");
const dataTable = document.getElementById("dataTable");
const statusMessage = document.getElementById("statusMessage");
const rowCount = document.getElementById("rowCount");
const refreshButton = document.getElementById("refreshButton");

const insertForm = document.getElementById("insertForm");
const updateForm = document.getElementById("updateForm");
const deleteForm = document.getElementById("deleteForm");

let currentSelection = { schema: "dbo", table: "TeamIssues" };

function setStatus(text, tone = "info") {
  statusMessage.textContent = text;
  statusMessage.style.background = tone === "error" ? "#fee2e2" : "#eef1f7";
  statusMessage.style.color = tone === "error" ? "#991b1b" : "#1f2430";
}

function setFormStatus(formName, text, isError) {
  const target = document.querySelector(`[data-form-status='${formName}']`);
  if (!target) return;
  target.textContent = text;
  target.style.color = isError ? "#991b1b" : "#2563eb";
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    const message = payload && payload.error ? payload.error : "Request failed";
    throw new Error(message);
  }
  return payload;
}

function buildOptionLabel(entry) {
  return `${entry.TABLE_SCHEMA}.${entry.TABLE_NAME}`;
}

function renderSchema(columns) {
  schemaList.innerHTML = "";
  columns.forEach((column) => {
    const li = document.createElement("li");
    li.textContent = `${column.COLUMN_NAME} · ${column.DATA_TYPE} · ${column.IS_NULLABLE === "YES" ? "nullable" : "required"}`;
    schemaList.appendChild(li);
  });
}

function renderRows(rows) {
  dataTable.querySelector("thead").innerHTML = "";
  dataTable.querySelector("tbody").innerHTML = "";

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
  dataTable.querySelector("thead").appendChild(headerRow);

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    columns.forEach((column) => {
      const td = document.createElement("td");
      const value = row[column];
      td.textContent = value === null || value === undefined ? "" : value;
      tr.appendChild(td);
    });
    dataTable.querySelector("tbody").appendChild(tr);
  });

  rowCount.textContent = `${rows.length} row(s) loaded.`;
}

async function loadTables() {
  setStatus("Loading tables…");
  const data = await fetchJson("/api/reporting/tables");
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
}

async function loadSchemaAndRows() {
  const [schema, table] = tableSelect.value.split(".");
  currentSelection = { schema, table };

  setStatus(`Loading ${schema}.${table}…`);

  const [schemaResponse, rowResponse] = await Promise.all([
    fetchJson(`/api/reporting/tables/${schema}/${table}/columns`),
    fetchJson(`/api/reporting/tables/${schema}/${table}/rows`)
  ]);

  renderSchema(schemaResponse.columns);
  renderRows(rowResponse.rows);

  setStatus(`Loaded ${schema}.${table}`);
}

refreshButton.addEventListener("click", () => {
  loadSchemaAndRows().catch((error) => {
    setStatus(error.message, "error");
  });
});

tableSelect.addEventListener("change", () => {
  loadSchemaAndRows().catch((error) => {
    setStatus(error.message, "error");
  });
});

insertForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFormStatus("insert", "", false);

  try {
    const values = JSON.parse(new FormData(insertForm).get("values"));
    await fetchJson(`/api/reporting/tables/${currentSelection.schema}/${currentSelection.table}/insert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values })
    });
    setFormStatus("insert", "Insert successful.", false);
    await loadSchemaAndRows();
  } catch (error) {
    setFormStatus("insert", error.message || "Insert failed.", true);
  }
});

updateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFormStatus("update", "", false);

  try {
    const formData = new FormData(updateForm);
    const keyColumn = formData.get("keyColumn");
    const keyValue = formData.get("keyValue");
    const updates = JSON.parse(formData.get("updates"));

    await fetchJson(`/api/reporting/tables/${currentSelection.schema}/${currentSelection.table}/update`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyColumn, keyValue, updates })
    });
    setFormStatus("update", "Update successful.", false);
    await loadSchemaAndRows();
  } catch (error) {
    setFormStatus("update", error.message || "Update failed.", true);
  }
});

deleteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFormStatus("delete", "", false);

  try {
    const formData = new FormData(deleteForm);
    const keyColumn = formData.get("keyColumn");
    const keyValue = formData.get("keyValue");

    await fetchJson(`/api/reporting/tables/${currentSelection.schema}/${currentSelection.table}/delete`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyColumn, keyValue })
    });
    setFormStatus("delete", "Delete successful.", false);
    await loadSchemaAndRows();
  } catch (error) {
    setFormStatus("delete", error.message || "Delete failed.", true);
  }
});

(async function init() {
  try {
    await loadTables();
    await loadSchemaAndRows();
  } catch (error) {
    setStatus(error.message || "Failed to connect.", "error");
  }
})();