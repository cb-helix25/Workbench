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
  const insertButton = document.getElementById("insertButton") as HTMLButtonElement | null;
  const queryForm = document.getElementById("queryForm") as HTMLFormElement | null;
  const pageGuard = document.getElementById("pageGuard") as HTMLDivElement | null;
  const pagePasscodeInput = document.getElementById("pagePasscode") as HTMLInputElement | null;
  const pageUnlockButton = document.getElementById("unlockPage") as HTMLButtonElement | null;
  const pagePasscodeStatus = document.getElementById("pagePasscodeStatus") as HTMLParagraphElement | null;
  const reportingContent = document.getElementById("reportingContent") as HTMLDivElement | null;

  const insertForm = document.getElementById("insertForm") as HTMLFormElement | null;
  const updateForm = document.getElementById("updateForm") as HTMLFormElement | null;
  const deleteForm = document.getElementById("deleteForm") as HTMLFormElement | null;
  const insertDialog = document.getElementById("insertDialog") as HTMLDialogElement | null;
  const updateDialog = document.getElementById("updateDialog") as HTMLDialogElement | null;
  const deleteDialog = document.getElementById("deleteDialog") as HTMLDialogElement | null;
  const insertPreviewButton = document.getElementById("insertPreviewButton") as HTMLButtonElement | null;
  const insertCommitButton = document.getElementById("insertCommitButton") as HTMLButtonElement | null;
  const updatePreviewButton = document.getElementById("updatePreviewButton") as HTMLButtonElement | null;
  const updateCommitButton = document.getElementById("updateCommitButton") as HTMLButtonElement | null;
  const deletePreviewButton = document.getElementById("deletePreviewButton") as HTMLButtonElement | null;
  const deleteCommitButton = document.getElementById("deleteCommitButton") as HTMLButtonElement | null;

  if (
    !tableSelect ||
    !schemaList ||
    !dataTable ||
    !statusMessage ||
    !rowCount ||
    !refreshButton ||
    !insertButton ||
    !queryForm ||
    !refreshButton ||
    !insertButton ||
    !insertForm ||
    !updateForm ||
    !deleteForm ||
    !insertDialog ||
    !updateDialog ||
    !deleteDialog ||
    !insertPreviewButton ||
    !insertCommitButton ||
    !updatePreviewButton ||
    !updateCommitButton ||
    !deletePreviewButton ||
    !deleteCommitButton ||
    !pageGuard ||
    !pagePasscodeInput ||
    !pageUnlockButton ||
    !pagePasscodeStatus ||
    !reportingContent
  ) {
    return () => undefined;
  }

  let currentSelection: TableSelection = { schema: "dbo", table: "TeamIssues" };
  let currentPage = 1;
  let pageSize = 50;
  let totalPages = 1;
  let totalRows = 0;
  let queryPasscode = "";
  let queryUnlocked = false;
  let pendingInsertPayload: { values: JsonRecord } | null = null;
  let pendingUpdatePayload:
    | { keyColumn: string; keyValue: FormDataEntryValue; updates: JsonRecord }
    | null = null;
  let pendingDeletePayload: { keyColumn: string; keyValue: FormDataEntryValue } | null = null;

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

  const setPageStatus = (text: string, isError: boolean) => {
    pagePasscodeStatus.textContent = text;
    pagePasscodeStatus.style.color = isError ? "#991b1b" : "#2563eb";
  };

  const setCommitEnabled = (button: HTMLButtonElement | null, enabled: boolean) => {
    if (!button) return;
    button.disabled = !enabled;
  };

  const resetPendingActions = () => {
    pendingInsertPayload = null;
    pendingUpdatePayload = null;
    pendingDeletePayload = null;
    setCommitEnabled(insertCommitButton, false);
    setCommitEnabled(updateCommitButton, false);
    setCommitEnabled(deleteCommitButton, false);
  };

  const setQueryLockState = (locked: boolean) => {
    queryUnlocked = !locked;
    queryForm.dataset.locked = locked ? "true" : "false";
    const queryTextarea = queryForm.querySelector("textarea[name='query']") as HTMLTextAreaElement | null;
    const queryButton = queryForm.querySelector("button[type='submit']") as HTMLButtonElement | null;
    if (queryTextarea) queryTextarea.disabled = locked;
    if (queryButton) queryButton.disabled = locked;
  };

  const setPageLockState = (locked: boolean) => {
    pageGuard.classList.toggle("page-guard--hidden", !locked);
    reportingContent.classList.toggle("reporting-content--locked", locked);
    setQueryLockState(locked);
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
      rowCount.textContent = "No rows found.";
      updatePaginationControls();
      return;
    }

    const columns = Object.keys(rows[0]);
    const headerRow = document.createElement("tr");
    columns.forEach((column) => {
      const th = document.createElement("th");
      th.textContent = column;
      headerRow.appendChild(th);
    });
    const actionHeader = document.createElement("th");
    actionHeader.textContent = "Actions";
    headerRow.appendChild(actionHeader);
    head.appendChild(headerRow);

    rows.forEach((row) => {
      const tr = document.createElement("tr");
      columns.forEach((column) => {
        const td = document.createElement("td");
        const value = row[column];
        td.textContent = value === null || value === undefined ? "" : String(value);
        tr.appendChild(td);
      });
      const actionCell = document.createElement("td");
      actionCell.className = "row-actions";
      const updateButton = document.createElement("button");
      updateButton.type = "button";
      updateButton.textContent = "U";
      updateButton.className = "row-action-button update";
      updateButton.setAttribute("aria-label", "Update row");
      updateButton.addEventListener("click", () => {
        const keyColumn = columns[0];
        const keyValue = row[keyColumn];
        const keyColumnField = updateForm.querySelector("input[name='keyColumn']") as HTMLInputElement | null;
        const keyValueField = updateForm.querySelector("input[name='keyValue']") as HTMLInputElement | null;
        if (keyColumnField) keyColumnField.value = keyColumn ?? "";
        if (keyValueField) keyValueField.value = keyValue === null || keyValue === undefined ? "" : String(keyValue);
        setFormStatus("update", "", false);
        updateDialog.showModal();
      });
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.textContent = "D";
      deleteButton.className = "row-action-button delete";
      deleteButton.setAttribute("aria-label", "Delete row");
      deleteButton.addEventListener("click", () => {
        const keyColumn = columns[0];
        const keyValue = row[keyColumn];
        const keyColumnField = deleteForm.querySelector("input[name='keyColumn']") as HTMLInputElement | null;
        const keyValueField = deleteForm.querySelector("input[name='keyValue']") as HTMLInputElement | null;
        if (keyColumnField) keyColumnField.value = keyColumn ?? "";
        if (keyValueField) keyValueField.value = keyValue === null || keyValue === undefined ? "" : String(keyValue);
        setFormStatus("delete", "", false);
        deleteDialog.showModal();
      });
      actionCell.append(updateButton, deleteButton);
      tr.appendChild(actionCell);
      body.appendChild(tr);
    });

    updatePaginationControls();
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
    currentPage = 1;

    setStatus(`Loading ${schema}.${table}…`);

    const [schemaResponse, rowResponse] = await Promise.all([
      fetchJson<{ columns: ColumnEntry[] }>(`${apiBase}/tables/${schema}/${table}/columns`),
      fetchJson<{ rows: JsonRecord[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }>(
        `${apiBase}/tables/${schema}/${table}/rows?page=${currentPage}&pageSize=${pageSize}`
      )
    ]);

    if (rowResponse.pagination) {
      currentPage = rowResponse.pagination.page;
      totalPages = rowResponse.pagination.totalPages;
      totalRows = rowResponse.pagination.total;
    }

    renderSchema(schemaResponse.columns);
    renderRows(rowResponse.rows);

    setStatus(`Loaded ${schema}.${table}`);
  };

  const loadRows = async () => {
    const { schema, table } = currentSelection;
    setStatus(`Loading page ${currentPage}…`);

    const rowResponse = await fetchJson<{ rows: JsonRecord[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }>(
      `${apiBase}/tables/${schema}/${table}/rows?page=${currentPage}&pageSize=${pageSize}`
    );

    if (rowResponse.pagination) {
      currentPage = rowResponse.pagination.page;
      totalPages = rowResponse.pagination.totalPages;
      totalRows = rowResponse.pagination.total;
    }

    renderRows(rowResponse.rows);
    setStatus(`Loaded ${schema}.${table}`);
  };

  const updatePaginationControls = () => {
    const prevButton = document.getElementById("prevButton") as HTMLButtonElement | null;
    const nextButton = document.getElementById("nextButton") as HTMLButtonElement | null;
    const pageInfo = document.getElementById("pageInfo") as HTMLSpanElement | null;

    if (prevButton) {
      prevButton.disabled = currentPage <= 1;
    }
    if (nextButton) {
      nextButton.disabled = currentPage >= totalPages;
    }
    if (pageInfo) {
      const start = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
      const end = Math.min(currentPage * pageSize, totalRows);
      pageInfo.textContent = `${start}-${end} of ${totalRows} rows`;
    }
    if (rowCount) {
      rowCount.textContent = `Page ${currentPage} of ${totalPages}`;
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      currentPage--;
      loadRows().catch((error: Error) => setStatus(error.message, "error"));
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      currentPage++;
      loadRows().catch((error: Error) => setStatus(error.message, "error"));
    }
  };

  const handleQuery = async (event: SubmitEvent) => {
    event.preventDefault();
    const queryForm = event.target as HTMLFormElement;
    const queryInput = queryForm.querySelector("textarea[name='query']") as HTMLTextAreaElement;
    const query = queryInput?.value.trim();

    if (!queryUnlocked || !queryPasscode) {
      setStatus("Enter the passcode to unlock queries.", "error");
      return;
    }


    if (!query) {
      setStatus("Please enter a query.", "error");
      return;
    }

    setStatus("Executing query…");

    try {
      const result = await fetchJson<{ rows: JsonRecord[]; rowCount: number }>(
        `${apiBase}/tables/${currentSelection.schema}/${currentSelection.table}/query`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, passcode: queryPasscode })
        }
      );

      renderRows(result.rows);
      setStatus(`Query returned ${result.rowCount} row(s).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Query failed.", "error");
    }
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

  const handleInsertPreview = async () => {
    setFormStatus("insert", "", false);
    setCommitEnabled(insertCommitButton, false);

    try {
      const values = parseJsonField(
        new FormData(insertForm).get("values"),
        "Insert values missing."
      );
      const result = await fetchJson<{ rowsAffected: number }>(
        `${apiBase}/tables/${currentSelection.schema}/${currentSelection.table}/insert/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ values })
        }
      );

      pendingInsertPayload = { values };
      setFormStatus(
        "insert",
        `Preview complete: ${result.rowsAffected} row(s) would be inserted. Confirm to commit.`,
        false
      );
      setCommitEnabled(insertCommitButton, true);
    } catch (error) {
      setFormStatus("insert", error instanceof Error ? error.message : "Insert preview failed.", true);
    }
  };

  const handleInsertCommit = async () => {
    if (!pendingInsertPayload) {
      setFormStatus("insert", "Run a preview first to enable commit.", true);
      return;
    }

    setFormStatus("insert", "Committing insert…", false);

    try {
      await fetchJson(
        `${apiBase}/tables/${currentSelection.schema}/${currentSelection.table}/insert`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pendingInsertPayload })
        }
      );
      setFormStatus("insert", "Insert committed.", false);
      pendingInsertPayload = null;
      setCommitEnabled(insertCommitButton, false);
      await loadSchemaAndRows();
    } catch (error) {
      setFormStatus("insert", error instanceof Error ? error.message : "Insert failed.", true);
    }
  };

  const handleUpdatePreview = async () => {
    setFormStatus("update", "", false);
    setCommitEnabled(updateCommitButton, false);

    try {
      const formData = new FormData(updateForm);
      const keyColumn = formData.get("keyColumn");
      const keyValue = formData.get("keyValue");
      const updates = parseJsonField(formData.get("updates"), "Update values missing.");

      if (!keyColumn || typeof keyColumn !== "string") {
        throw new Error("Key column is required.");
      }
      if (keyValue === null) {
        throw new Error("Key value is required.");
      }

      const result = await fetchJson<{ rowsAffected: number }>(
        `${apiBase}/tables/${currentSelection.schema}/${currentSelection.table}/update/preview`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyColumn, keyValue, updates })
        }
      );

      pendingUpdatePayload = { keyColumn, keyValue, updates };
      setFormStatus(
        "update",
        `Preview complete: ${result.rowsAffected} row(s) would be updated. Confirm to commit.`,
        false
      );
      setCommitEnabled(updateCommitButton, true);
    } catch (error) {
      setFormStatus("update", error instanceof Error ? error.message : "Update preview failed.", true);
    }
  };

  const handleUpdateCommit = async () => {
    if (!pendingUpdatePayload) {
      setFormStatus("update", "Run a preview first to enable commit.", true);
      return;
    }

    setFormStatus("update", "Committing update…", false);

    try {
      await fetchJson(
        `${apiBase}/tables/${currentSelection.schema}/${currentSelection.table}/update`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pendingUpdatePayload)
        }
      );
      setFormStatus("update", "Update committed.", false);
      pendingUpdatePayload = null;
      setCommitEnabled(updateCommitButton, false);
      await loadSchemaAndRows();
    } catch (error) {
      setFormStatus("update", error instanceof Error ? error.message : "Update failed.", true);
    }
  };

  const handleDeletePreview = async () => {
    setFormStatus("delete", "", false);
    setCommitEnabled(deleteCommitButton, false);

    try {
      const formData = new FormData(deleteForm);
      const keyColumn = formData.get("keyColumn");
      const keyValue = formData.get("keyValue");

      if (!keyColumn || typeof keyColumn !== "string") {
        throw new Error("Key column is required.");
      }

      const result = await fetchJson<{ rowsAffected: number }>(
        `${apiBase}/tables/${currentSelection.schema}/${currentSelection.table}/delete/preview`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyColumn, keyValue })
        }
      );

      pendingDeletePayload = { keyColumn, keyValue };
      setFormStatus(
        "delete",
        `Preview complete: ${result.rowsAffected} row(s) would be deleted. Confirm to commit.`,
        false
      );
      setCommitEnabled(deleteCommitButton, true);
    } catch (error) {
      setFormStatus("delete", error instanceof Error ? error.message : "Delete preview failed.", true);
    }
  };

  const handleDeleteCommit = async () => {
    if (!pendingDeletePayload) {
      setFormStatus("delete", "Run a preview first to enable commit.", true);
      return;
    }

    setFormStatus("delete", "Committing delete…", false);

    try {

      await fetchJson(
        `${apiBase}/tables/${currentSelection.schema}/${currentSelection.table}/delete`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pendingDeletePayload)
        }
      );
      setFormStatus("delete", "Delete committed.", false);
      pendingDeletePayload = null;
      setCommitEnabled(deleteCommitButton, false);
      await loadSchemaAndRows();
    } catch (error) {
      setFormStatus("delete", error instanceof Error ? error.message : "Delete failed.", true);
    }
  };

  const handleOpenInsert = () => {
    setFormStatus("insert", "", false);
    insertDialog.showModal();
  };

  const handleInsertDialogClick = (event: MouseEvent) => {
    if (event.target === insertDialog) insertDialog.close();
  };

  const handleUpdateDialogClick = (event: MouseEvent) => {
    if (event.target === updateDialog) updateDialog.close();
  };

  const handleDeleteDialogClick = (event: MouseEvent) => {
    if (event.target === deleteDialog) deleteDialog.close();
  };

  const handleDialogClose = () => {
    resetPendingActions();
  };

  const handlePageUnlock = async () => {
    const passcode = pagePasscodeInput.value.trim();
    if (!passcode) {
      setPageStatus("Enter the passcode provided by your admin.", true);
      return;
    }
    queryPasscode = passcode;
    pagePasscodeInput.value = "";
    setPageLockState(false);
    setPageStatus("Access unlocked for this session.", false);
    setStatus("Loading tables…");
    try {
      await loadTables();
      await loadSchemaAndRows();
      resetPendingActions();
      setStatus("Ready");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to connect.", "error");
    }
  };

  const handlePageUnlockClick = () => {
    handlePageUnlock().catch((error: Error) => setStatus(error.message, "error"));
  };

  const handleFormInput = () => {
    resetPendingActions();
  };

  const prevButton = document.getElementById("prevButton") as HTMLButtonElement | null;
  const nextButton = document.getElementById("nextButton") as HTMLButtonElement | null;

  refreshButton.addEventListener("click", handleRefresh);
  tableSelect.addEventListener("change", handleTableChange);
  queryForm.addEventListener("submit", handleQuery);
  insertButton.addEventListener("click", handleOpenInsert);
  insertDialog.addEventListener("click", handleInsertDialogClick);
  updateDialog.addEventListener("click", handleUpdateDialogClick);
  deleteDialog.addEventListener("click", handleDeleteDialogClick);
  insertDialog.addEventListener("close", handleDialogClose);
  updateDialog.addEventListener("close", handleDialogClose);
  deleteDialog.addEventListener("close", handleDialogClose);
  insertPreviewButton.addEventListener("click", handleInsertPreview);
  insertCommitButton.addEventListener("click", handleInsertCommit);
  updatePreviewButton.addEventListener("click", handleUpdatePreview);
  updateCommitButton.addEventListener("click", handleUpdateCommit);
  deletePreviewButton.addEventListener("click", handleDeletePreview);
  deleteCommitButton.addEventListener("click", handleDeleteCommit);
  insertForm.addEventListener("input", handleFormInput);
  updateForm.addEventListener("input", handleFormInput);
  deleteForm.addEventListener("input", handleFormInput);
  pageUnlockButton.addEventListener("click", handlePageUnlockClick);
  if (prevButton) prevButton.addEventListener("click", handlePrevPage);
  if (nextButton) nextButton.addEventListener("click", handleNextPage);

  void (async () => {
    try {
      setPageLockState(true);
      setStatus("Enter the passcode to access this page.");
      resetPendingActions();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to connect.", "error");
    }
  })();

  return () => {
    refreshButton.removeEventListener("click", handleRefresh);
    tableSelect.removeEventListener("change", handleTableChange);
    queryForm.removeEventListener("submit", handleQuery);
    insertButton.removeEventListener("click", handleOpenInsert);
    insertDialog.removeEventListener("click", handleInsertDialogClick);
    updateDialog.removeEventListener("click", handleUpdateDialogClick);
    deleteDialog.removeEventListener("click", handleDeleteDialogClick);
    insertDialog.removeEventListener("close", handleDialogClose);
    updateDialog.removeEventListener("close", handleDialogClose);
    deleteDialog.removeEventListener("close", handleDialogClose);
    insertPreviewButton.removeEventListener("click", handleInsertPreview);
    insertCommitButton.removeEventListener("click", handleInsertCommit);
    updatePreviewButton.removeEventListener("click", handleUpdatePreview);
    updateCommitButton.removeEventListener("click", handleUpdateCommit);
    deletePreviewButton.removeEventListener("click", handleDeletePreview);
    deleteCommitButton.removeEventListener("click", handleDeleteCommit);
    insertForm.removeEventListener("input", handleFormInput);
    updateForm.removeEventListener("input", handleFormInput);
    deleteForm.removeEventListener("input", handleFormInput);
    pageUnlockButton.removeEventListener("click", handlePageUnlockClick);
    if (prevButton) prevButton.removeEventListener("click", handlePrevPage);
    if (nextButton) nextButton.removeEventListener("click", handleNextPage);
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

      <div className="page-guard" id="pageGuard">
        <div className="page-guard__card">
          <h2>Passcode required</h2>
          <p>Enter the passcode provided by your admin to access this page.</p>
          <label className="field">
            <span>Passcode</span>
            <input id="pagePasscode" type="password" placeholder="Enter passcode" />
          </label>
          <button type="button" id="unlockPage">Unlock Page</button>
          <p className="form-status" id="pagePasscodeStatus"></p>
        </div>
      </div>

      <div className="reporting-content reporting-content--locked" id="reportingContent">
        <main className="layout">
          <section className="panel" database-explorer>
            <h2>Database Explorer</h2>
            <label className="field">
              <span>Table</span>
              <select id="tableSelect"></select>
            </label>
            <div className="schema">
              <h3>Schema</h3>
              <ul id="schemaList"></ul>
            </div>
            <div className="query-section">
              <h3>Custom Query</h3>
              <p className="hint">Page access is protected by a passcode.</p>
              <form id="queryForm" className="form">
                <label>
                  <textarea name="query" rows={3} placeholder="SELECT * FROM [table] WHERE ..."></textarea>
                </label>
                <button type="submit">Execute Query</button>
              </form>
            </div>
          </section>

          <section className="panel" data-preview>
            <h2>Data Preview</h2>
            <div className="toolbar">
              <div className="toolbar-actions">
                <button id="refreshButton">Refresh</button>
                <button id="insertButton" className="icon-button" type="button" aria-label="Insert row">
                  +
                </button>
              </div>
              <div className="pagination-controls">
                <span id="pageInfo"></span>
                <div className="pagination-buttons">
                  <button id="prevButton" type="button">← Prev</button>
                  <span id="rowCount"></span>
                  <button id="nextButton" type="button">Next →</button>
                </div>
              </div>
            </div>

            <div className="table-wrap">
              <table id="dataTable">
                <thead></thead>
                <tbody></tbody>
              </table>
            </div>
            <dialog id="insertDialog" className="modal">
              <div className="modal-body">
                <div className="modal-header">
                  <h3>Insert</h3>
                  <button type="button" className="ghost-button" onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement).close()}>
                    Close
                  </button>
                </div>
                <form id="insertForm" className="form">
                  <label>
                    <span>Values (JSON)</span>
                    <textarea name="values" rows={4} placeholder='{"title":"New item","priority":"Medium"}'></textarea>
                  </label>
                  <div className="form-actions">
                    <button type="button" id="insertPreviewButton">Preview Insert</button>
                    <button type="button" id="insertCommitButton" className="ghost-button">
                      Confirm &amp; Commit
                    </button>
                  </div>
                  <p className="form-status" data-form-status="insert"></p>
                </form>
              </div>
            </dialog>
            <dialog id="updateDialog" className="modal">
              <div className="modal-body">
                <div className="modal-header">
                  <h3>Update</h3>
                  <button type="button" className="ghost-button" onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement).close()}>
                    Close
                  </button>
                </div>
                <form id="updateForm" className="form">
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
                  <div className="form-actions">
                    <button type="button" id="updatePreviewButton">Preview Update</button>
                    <button type="button" id="updateCommitButton" className="ghost-button">
                      Confirm &amp; Commit
                    </button>
                  </div>
                  <p className="form-status" data-form-status="update"></p>
                </form>
              </div>
            </dialog>
            <dialog id="deleteDialog" className="modal">
              <div className="modal-body">
                <div className="modal-header">
                  <h3>Delete</h3>
                  <button type="button" className="ghost-button" onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement).close()}>
                    Close
                  </button>
                </div>
                <form id="deleteForm" className="form">
                  <label>
                    <span>Key column</span>
                    <input name="keyColumn" placeholder="IssueId" />
                  </label>
                  <label>
                    <span>Key value</span>
                    <input name="keyValue" placeholder="123" />
                  </label>
                  <div className="form-actions">
                    <button type="button" id="deletePreviewButton">Preview Delete</button>
                    <button type="button" id="deleteCommitButton" className="danger-button">
                      Confirm &amp; Commit
                    </button>
                  </div>
                  <p className="form-status" data-form-status="delete"></p>
                </form>
              </div>
            </dialog>
          </section>
        </main>
      </div>
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