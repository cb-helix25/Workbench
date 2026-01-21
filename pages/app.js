import React, { useEffect } from "https://esm.sh/react@18";
import { createRoot } from "https://esm.sh/react-dom@18/client";
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes
} from "https://esm.sh/react-router-dom@6";
import htm from "https://esm.sh/htm@3";
import { initReportingHub } from "./reporting.js";

const html = htm.bind(React.createElement);

const PageHeader = ({ eyebrow, title, description, children }) => html`
  <header className="page-header">
    <div>
      ${eyebrow ? html`<p className="eyebrow">${eyebrow}</p>` : null}
      <h1>${title}</h1>
      <p>${description}</p>
      ${children}
    </div>
  </header>
`;

const Home = () => html`
  <main className="home-grid">
    ${html`
      <${PageHeader}
        eyebrow="Welcome"
        title="Helix Reporting Hub"
        description="Choose a destination below to access helix data and reporting tools. The helix-project-data workspace is available now, with more sections coming soon."
      />
    `}
    <section className="panel home-panel">
      <h2>Jump to a workspace</h2>
      <div className="nav-grid">
        <${Link} className="nav-button" to="/helix-project-data">
          helix-project-data
        <//>
        <button className="nav-button" type="button" disabled>
          helix-core-data
        </button>
        <button className="nav-button" type="button" disabled>
          instructions
        </button>
      </div>
      <p className="hint">More destinations will light up soon.</p>
    </section>
  </main>
`;

const PlaceholderPage = ({ title, description }) => html`
  <div>
    ${html`
      <${PageHeader}
        eyebrow="Coming soon"
        title=${title}
        description=${description}
      >
        <${Link} className="back-link" to="/">Back to home<//>
      <//>
    `}
    <main className="home-grid">
      <section className="panel">
        <p className="hint">Check back soon for updates to this section.</p>
      </section>
    </main>
  </div>
`;

const HelixProjectData = () => {
  useEffect(() => {
    initReportingHub();
  }, []);

  return html`
    <div>
      <header className="page-header">
        <div>
          <p className="eyebrow">Helix Reporting Hub</p>
          <h1>Helix Project Data</h1>
          <p>
            A clean, standalone reporting hub that surfaces schema metadata and lets you view or edit
            live database rows in one place.
          </p>
          <${Link} className="back-link" to="/">Back to home<//>
        </div>
        <div className="status" id="statusMessage">Connecting…</div>
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
              <textarea
                name="values"
                rows="4"
                placeholder='{"title":"New issue","priority":"High"}'
              ></textarea>
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
              <textarea name="updates" rows="4" placeholder='{"priority":"Low"}'></textarea>
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
  `;
};

const App = () => html`
  <${BrowserRouter}>
    <nav className="sr-only">
      <${NavLink} to="/">Home<//>
      <${NavLink} to="/helix-project-data">Helix Project Data<//>
    </nav>
    <${Routes}>
      <${Route} path="/" element=${html`<${Home} />`} />
      <${Route} path="/helix-project-data" element=${html`<${HelixProjectData} />`} />
      <${Route}
        path="/helix-core-data"
        element=${html`
          <${PlaceholderPage}
            title="Helix Core Data"
            description="This section is reserved for future core datasets and reporting tools."
          />
        `}
      />
      <${Route}
        path="/instructions"
        element=${html`
          <${PlaceholderPage}
            title="Instructions"
            description="Guides and onboarding steps will be added here soon."
          />
        `}
      />
      <${Route} path="*" element=${html`<${Home} />`} />
    <//>
  <//>
`;

const root = createRoot(document.getElementById("root"));
root.render(html`<${App} />`);