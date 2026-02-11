export type PreflightCheck = {
  id: string;
  label: string;
  detail: string;
  status: "pass" | "warn" | "fail";
  blocking: boolean;
};

type PreflightChecklistProps = {
  checks: PreflightCheck[];
};

const statusLabel: Record<PreflightCheck["status"], string> = {
  pass: "Pass",
  warn: "Warning",
  fail: "Fail"
};

export const PreflightChecklist = ({ checks }: PreflightChecklistProps): JSX.Element => {
  return (
    <section className="flow-section preflight-block" aria-labelledby="preflight-checks-title">
      <h2 id="preflight-checks-title">Preflight Checklist</h2>
      <ul className="preflight-list">
        {checks.map((check) => (
          <li key={check.id} className={`preflight-item preflight-${check.status}`}>
            <p className="preflight-label">
              <strong>{check.label}</strong>
              <span>
                {statusLabel[check.status]}
                {check.blocking ? " | Blocking" : " | Advisory"}
              </span>
            </p>
            <p className="muted">{check.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
};
