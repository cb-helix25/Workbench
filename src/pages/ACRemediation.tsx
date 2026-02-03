import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

type IdentifierType = "email" | "ac_contact_id";

type RemediationResult = {
  identifier: string;
  resolved_ac_contact_id: string | null;
  sql_touchpoint_date: string | null;
  sql_contact_referrer: string | null;
  sql_method_of_contact: string | null;
  sql_referral_url: string | null;
  sql_point_of_contact: string | null;
  sql_ultimate_source: string | null;
  sql_call_taker: string | null;
  sql_area_of_work: string | null;
  sql_initial_first_call_notes: string | null;
  sql_value: string | null;
  status: "pending" | "success" | "skipped" | "failed";
  error: string | null;
};

type PoidRemediationResult = {
  identifier: string;
  resolved_ac_contact_id: string | null;
  sql_country_code: string | null;
  sql_drivers_license_number: string | null;
  sql_gender: string | null;
  sql_submission_url: string | null;
  sql_house_building_number: string | null;
  sql_nationality: string | null;
  sql_company_country: string | null;
  sql_company_county: string | null;
  sql_company_city: string | null;
  sql_company_post_code: string | null;
  sql_company_street: string | null;
  sql_company_house_building_number: string | null;
  sql_street: string | null;
  sql_county: string | null;
  sql_post_code: string | null;
  sql_city: string | null;
  sql_country: string | null;
  status: "pending" | "success" | "skipped" | "failed";
  error: string | null;
};

type ClearRemediationResult = {
  identifier: string;
  resolved_ac_contact_id: string | null;
  cleared_fields: string[];
  status: "pending" | "success" | "skipped" | "failed";
  error: string | null;
};

type TestResult = {
  acConnectionTest: string;
  parsedCount: number;
  identifierType: string;
  sampleResults: Array<{
    identifier: string;
    found_in_ac: boolean;
    ac_contact_id: string | null;
  }>;
  message: string;
};

const identifierOptions: { value: IdentifierType; label: string; helper: string }[] = [
  {
    value: "email",
    label: "Email",
    helper: "Paste emails that match contacts in ActiveCampaign."
  },
  {
    value: "ac_contact_id",
    label: "ActiveCampaign Contact ID",
    helper: "Paste AC contact IDs directly if you already have them."
  }
];

const ACRemediation = () => {
  const [identifierType, setIdentifierType] = useState<IdentifierType>("email");
  const [rawInput, setRawInput] = useState("");
  const [results, setResults] = useState<RemediationResult[]>([]);
  const [poidResults, setPoidResults] = useState<PoidRemediationResult[]>([]);
  const [clearResults, setClearResults] = useState<ClearRemediationResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPoidRunning, setIsPoidRunning] = useState(false);
  const [isClearRunning, setIsClearRunning] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const helperText = useMemo(() => {
    return identifierOptions.find((option) => option.value === identifierType)?.helper;
  }, [identifierType]);

  const handleTest = async () => {
    setIsTesting(true);
    setErrorMessage(null);
    setTestResult(null);

    try {
      const response = await fetch("/api/ac-remediation/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifierType, rawInput })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to test connection.");
      }

      setTestResult(payload);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unexpected error.");
    } finally {
      setIsTesting(false);
    }
  };

  const handleRun = async () => {
    setIsRunning(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/ac-remediation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifierType, rawInput })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to run remediation.");
      }

      setResults(payload.results ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unexpected error.");
    } finally {
      setIsRunning(false);
    }
  };

  const handlePoidRun = async () => {
    setIsPoidRunning(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/ac-remediation/poid-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifierType, rawInput })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to run POID remediation.");
      }

      setPoidResults(payload.results ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unexpected error.");
    } finally {
      setIsPoidRunning(false);
    }
  };

  const handleClearRun = async () => {
    setIsClearRunning(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/ac-remediation/clear-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifierType, rawInput })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to clear ActiveCampaign fields.");
      }

      setClearResults(payload.results ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unexpected error.");
    } finally {
      setIsClearRunning(false);
    }
  };

  return (
    <div>
      <header className="page-header">
        <div>
          <p className="eyebrow">Admin tool</p>
          <h1>AC Remediation</h1>
          <p>
            Bulk sync values from SQL into ActiveCampaign contacts using a pasted list
            from your spreadsheet export.
          </p>
          <p>
            Use the same identifier list to clear specific AC fields without touching SQL:
            %PROFESSION_TAG%, %COGNITO_SUBMISSION%, %ADDRESS_KIND%, %FIXED_FEE_QUOTE%.
          </p>
          <Link className="back-link" to="/">
            Back to home
          </Link>
        </div>
      </header>

      <main className="layout">
        <section className="panel">
          <div className="field">
            <span>Identifier type</span>
            <div className="layout">
              {identifierOptions.map((option) => (
                <label key={option.value}>
                  <input
                    type="radio"
                    name="identifierType"
                    value={option.value}
                    checked={identifierType === option.value}
                    onChange={() => setIdentifierType(option.value)}
                  />{" "}
                  {option.label}
                </label>
              ))}
            </div>
            {helperText ? <small>{helperText}</small> : null}
          </div>

          <div className="field">
            <span>Identifiers</span>
            <textarea
              rows={8}
              placeholder="Paste newline-delimited values or CSV rows here."
              value={rawInput}
              onChange={(event) => setRawInput(event.target.value)}
            />
          </div>

          <div className="layout">
            <button
              type="button"
              onClick={handleTest}
              disabled={isTesting || isRunning || isPoidRunning || isClearRunning}
            >
              {isTesting ? "Testing…" : "Test connection & CSV"}
            </button>
            <button
              type="button"
              onClick={handleRun}
              disabled={isRunning || isTesting || isPoidRunning || isClearRunning}
            >
              {isRunning ? "Syncing…" : "Sync enquiry data to AC"}
            </button>
            <button
              type="button"
              onClick={handlePoidRun}
              disabled={isPoidRunning || isTesting || isRunning || isClearRunning}
            >
              {isPoidRunning ? "Syncing…" : "Sync poid data to AC"}
            </button>
            <button
              type="button"
              onClick={handleClearRun}
              disabled={isClearRunning || isTesting || isRunning || isPoidRunning}
            >
              {isClearRunning ? "Clearing…" : "Clear selected AC fields"}
            </button>
          </div>

          {errorMessage ? <p className="hint">{errorMessage}</p> : null}

          {testResult ? (
            <div className="test-results">
              <h3>Test Results</h3>
              <p>✓ {testResult.message}</p>
              <p>AC Connection: <strong>{testResult.acConnectionTest}</strong></p>
              {testResult.sampleResults.length > 0 && (
                <div>
                  <h4>Sample validation:</h4>
                  <ul>
                    {testResult.sampleResults.map((sample, idx) => (
                      <li key={idx}>
                        {sample.identifier} - {sample.found_in_ac ? "✓ Found" : "✗ Not found"} in AC
                        {sample.ac_contact_id && ` (ID: ${sample.ac_contact_id})`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </section>
        <section className="panel">
          <h2>Clear AC Fields</h2>
          <p className="hint">
            Clears the following personalization tags in ActiveCampaign only: %PROFESSION_TAG%,
            %COGNITO_SUBMISSION%, %ADDRESS_KIND%, %FIXED_FEE_QUOTE%.
          </p>
          <div className="table-wrap">
            <table id="clearDataTable">
              <thead>
                <tr>
                  <th>identifier</th>
                  <th>resolved_ac_contact_id</th>
                  <th>cleared_fields</th>
                  <th>status</th>
                  <th>error</th>
                </tr>
              </thead>
              <tbody>
                {clearResults.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No results yet.</td>
                  </tr>
                ) : (
                  clearResults.map((row, index) => (
                    <tr key={`${row.identifier}-${index}`}>
                      <td>{row.identifier}</td>
                      <td>{row.resolved_ac_contact_id ?? ""}</td>
                      <td>{row.cleared_fields.join(", ")}</td>
                      <td>{row.status}</td>
                      <td>{row.error ?? ""}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <h2>Enquiry Sync Results</h2>
          <div className="table-wrap">
            <table id="dataTable">
              <thead>
                <tr>
                  <th>identifier</th>
                  <th>resolved_ac_contact_id</th>
                  <th>sql_touchpoint_date</th>
                  <th>sql_contact_referrer</th>
                  <th>sql_method_of_contact</th>
                  <th>sql_referral_url</th>
                  <th>sql_point_of_contact</th>
                  <th>sql_ultimate_source</th>
                  <th>sql_call_taker</th>
                  <th>sql_area_of_work</th>
                  <th>sql_initial_first_call_notes</th>
                  <th>sql_value</th>
                  <th>status</th>
                  <th>error</th>
                </tr>
              </thead>
              <tbody>
                {results.length === 0 ? (
                  <tr>
                    <td colSpan={14}>No results yet.</td>
                  </tr>
                ) : (
                  results.map((row, index) => (
                    <tr key={`${row.identifier}-${index}`}>
                      <td>{row.identifier}</td>
                      <td>{row.resolved_ac_contact_id ?? ""}</td>
                      <td>{row.sql_touchpoint_date ?? ""}</td>
                      <td>{row.sql_contact_referrer ?? ""}</td>
                      <td>{row.sql_method_of_contact ?? ""}</td>
                      <td>{row.sql_referral_url ?? ""}</td>
                      <td>{row.sql_point_of_contact ?? ""}</td>
                      <td>{row.sql_ultimate_source ?? ""}</td>
                      <td>{row.sql_call_taker ?? ""}</td>
                      <td>{row.sql_area_of_work ?? ""}</td>
                      <td>{row.sql_initial_first_call_notes ?? ""}</td>
                      <td>{row.sql_value ?? ""}</td>
                      <td>{row.status}</td>
                      <td>{row.error ?? ""}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <h2>POID Sync Results</h2>
          <div className="table-wrap">
            <table id="poidDataTable">
              <thead>
                <tr>
                  <th>identifier</th>
                  <th>resolved_ac_contact_id</th>
                  <th>sql_country_code</th>
                  <th>sql_drivers_license_number</th>
                  <th>sql_gender</th>
                  <th>sql_submission_url</th>
                  <th>sql_house_building_number</th>
                  <th>sql_nationality</th>
                  <th>sql_company_country</th>
                  <th>sql_company_county</th>
                  <th>sql_company_city</th>
                  <th>sql_company_post_code</th>
                  <th>sql_company_street</th>
                  <th>sql_company_house_building_number</th>
                  <th>sql_street</th>
                  <th>sql_county</th>
                  <th>sql_post_code</th>
                  <th>sql_city</th>
                  <th>sql_country</th>
                  <th>status</th>
                  <th>error</th>
                </tr>
              </thead>
              <tbody>
                {poidResults.length === 0 ? (
                  <tr>
                    <td colSpan={21}>No results yet.</td>
                  </tr>
                ) : (
                  poidResults.map((row, index) => (
                    <tr key={`${row.identifier}-${index}`}>
                      <td>{row.identifier}</td>
                      <td>{row.resolved_ac_contact_id ?? ""}</td>
                      <td>{row.sql_country_code ?? ""}</td>
                      <td>{row.sql_drivers_license_number ?? ""}</td>
                      <td>{row.sql_gender ?? ""}</td>
                      <td>{row.sql_submission_url ?? ""}</td>
                      <td>{row.sql_house_building_number ?? ""}</td>
                      <td>{row.sql_nationality ?? ""}</td>
                      <td>{row.sql_company_country ?? ""}</td>
                      <td>{row.sql_company_county ?? ""}</td>
                      <td>{row.sql_company_city ?? ""}</td>
                      <td>{row.sql_company_post_code ?? ""}</td>
                      <td>{row.sql_company_street ?? ""}</td>
                      <td>{row.sql_company_house_building_number ?? ""}</td>
                      <td>{row.sql_street ?? ""}</td>
                      <td>{row.sql_county ?? ""}</td>
                      <td>{row.sql_post_code ?? ""}</td>
                      <td>{row.sql_city ?? ""}</td>
                      <td>{row.sql_country ?? ""}</td>
                      <td>{row.status}</td>
                      <td>{row.error ?? ""}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
};

export default ACRemediation;