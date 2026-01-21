import { ReactNode } from "react";
import { BrowserRouter, Link, NavLink, Route, Routes } from "react-router-dom";
import {
  HelixCoreDataPage,
  HelixProjectDataPage,
  InstructionsPage
} from "./pages/Reporting";

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
      description="Choose a destination below."
    />
    <section className="panel home-panel">
      <div className="nav-grid">
        <Link className="nav-button" to="/helix-project-data">
          helix-project-data
        </Link>
        <Link className="nav-button" to="/helix-core-data">
          helix-core-data
        </Link>
        <Link className="nav-button" to="/instructions">
          instructions
        </Link>
      </div>
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
      <NavLink to="/helix-core-data">Helix Core Data</NavLink>
      <NavLink to="/instructions">Instructions</NavLink>
    </nav>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/helix-project-data" element={<HelixProjectDataPage />} />
      <Route path="/helix-core-data" element={<HelixCoreDataPage />} />
      <Route path="/instructions" element={<InstructionsPage />} />
      <Route path="*" element={<Home />} />
    </Routes>
  </BrowserRouter>
);

export default App;