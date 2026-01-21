import { ReactNode } from "react";
import { BrowserRouter, Link, NavLink, Route, Routes } from "react-router-dom";
import ReportingPage from "./pages/Reporting";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
}

const PageHeader = ({ eyebrow, title, description, children }: PageHeaderProps) => (
  <header className="page-header">
    <div>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </div>
  </header>
);

const Home = () => (
  <main className="home-grid">
    <PageHeader
      eyebrow="Welcome"
      title="Helix Reporting Hub"
      description="Choose a destination below to access helix data and reporting tools. The helix-project-data workspace is available now, with more sections coming soon."
    />
    <section className="panel home-panel">
      <h2>Jump to a workspace</h2>
      <div className="nav-grid">
        <Link className="nav-button" to="/helix-project-data">
          helix-project-data
        </Link>
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
);

interface PlaceholderPageProps {
  title: string;
  description: string;
}

const PlaceholderPage = ({ title, description }: PlaceholderPageProps) => (
  <div>
    <PageHeader eyebrow="Coming soon" title={title} description={description}>
      <Link className="back-link" to="/">
        Back to home
      </Link>
    </PageHeader>
    <main className="home-grid">
      <section className="panel">
        <p className="hint">Check back soon for updates to this section.</p>
      </section>
    </main>
  </div>
);

const App = () => (
  <BrowserRouter>
    <nav className="sr-only">
      <NavLink to="/">Home</NavLink>
      <NavLink to="/helix-project-data">Helix Project Data</NavLink>
    </nav>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/helix-project-data" element={<ReportingPage />} />
      <Route
        path="/helix-core-data"
        element={
          <PlaceholderPage
            title="Helix Core Data"
            description="This section is reserved for future core datasets and reporting tools."
          />
        }
      />
      <Route
        path="/instructions"
        element={
          <PlaceholderPage
            title="Instructions"
            description="Guides and onboarding steps will be added here soon."
          />
        }
      />
      <Route path="*" element={<Home />} />
    </Routes>
  </BrowserRouter>
);

export default App;