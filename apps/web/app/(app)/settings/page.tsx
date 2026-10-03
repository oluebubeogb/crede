export default function SettingsPage() {
  const tabs = ["Account", "Notifications", "Privacy", "Security", "Billing", "Connected Apps"];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <span key={t} className="rounded-btn border border-border px-3 py-1.5 text-sm text-muted">
            {t}
          </span>
        ))}
      </div>
      <div className="card">
        <p className="text-sm text-muted">
          Account identity is managed by Collab Accounts. Password, email, and security settings live at{" "}
          <a className="text-accent hover:underline" href={process.env.NEXT_PUBLIC_ACCOUNTS_URL || "http://localhost:1997"}>
            accounts.collab.name.ng
          </a>
          .
        </p>
      </div>
    </div>
  );
}
