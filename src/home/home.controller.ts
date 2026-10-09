import { Controller, Get, Header } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      })[character] ?? character,
  );
}

function normalizePath(value: string, fallback: string): string {
  const normalized = value.trim().replace(/^\/+|\/+$/g, '');
  return normalized || fallback;
}

@ApiExcludeController()
@Controller()
export class HomeController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  index(): string {
    const appName =
      this.config.get<string>('app.name') ?? 'NestJS Inventory System';
    const apiPrefix = normalizePath(
      this.config.get<string>('app.apiPrefix') ?? 'api/v1',
      'api/v1',
    );
    const openApiEnabled =
      this.config.get<boolean>('app.openApiEnabled') ?? true;
    const openApiPath = normalizePath(
      this.config.get<string>('app.openApiPath') ?? 'docs',
      'docs',
    );
    const openApiVersion =
      this.config.get<string>('app.openApiVersion') ?? '1.0.0';

    const safeAppName = escapeHtml(appName);
    const safeVersion = escapeHtml(openApiVersion);
    const apiBase = `/${apiPrefix}`;
    const docsBase = `${apiBase}/${openApiPath}`;
    const safeApiBase = escapeHtml(apiBase);
    const safeDocsBase = escapeHtml(docsBase);

    const documentationActions = openApiEnabled
      ? `
          <a class="button primary" href="${safeDocsBase}">Open Swagger UI</a>
          <a class="button" href="${safeDocsBase}/openapi.json">OpenAPI JSON</a>
        `
      : '<span class="notice">Interactive OpenAPI documentation is disabled in this environment.</span>';

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <title>${safeAppName} API</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --bg: #07111f;
      --surface: #0d1b2a;
      --surface-soft: #122438;
      --border: #26384c;
      --text: #f8fafc;
      --muted: #9fb0c3;
      --accent: #60a5fa;
      --accent-strong: #2563eb;
      --success: #5ee0a0;
      --code: #081421;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at top right, rgba(37, 99, 235, .16), transparent 30rem),
        var(--bg);
      color: var(--text);
    }
    a { color: inherit; }
    .shell {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
      padding: 56px 0 44px;
    }
    .eyebrow {
      margin: 0 0 12px;
      color: var(--accent);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: .12em;
      text-transform: uppercase;
    }
    h1 {
      max-width: 820px;
      margin: 0;
      font-size: clamp(38px, 7vw, 72px);
      line-height: .98;
      letter-spacing: -.045em;
    }
    .lead {
      max-width: 760px;
      margin: 24px 0 0;
      color: var(--muted);
      font-size: 18px;
      line-height: 1.7;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 28px;
    }
    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 42px;
      padding: 0 16px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
      text-decoration: none;
      font-size: 14px;
      font-weight: 650;
    }
    .button:hover { border-color: var(--accent); }
    .button.primary {
      border-color: var(--accent-strong);
      background: var(--accent-strong);
    }
    .notice {
      padding: 12px 14px;
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--muted);
      background: var(--surface);
    }
    .meta-grid,
    .module-grid {
      display: grid;
      gap: 12px;
      margin-top: 32px;
    }
    .meta-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .module-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .card {
      border: 1px solid var(--border);
      border-radius: 10px;
      background: rgba(13, 27, 42, .86);
      padding: 18px;
    }
    .card strong {
      display: block;
      margin-bottom: 8px;
      font-size: 13px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: .06em;
    }
    .card code,
    code {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: .92em;
    }
    section { margin-top: 56px; }
    h2 {
      margin: 0 0 18px;
      font-size: 24px;
      letter-spacing: -.025em;
    }
    .steps {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .step-number {
      display: inline-flex;
      width: 28px;
      height: 28px;
      align-items: center;
      justify-content: center;
      border-radius: 7px;
      background: var(--surface-soft);
      color: var(--accent);
      font-weight: 800;
      font-size: 13px;
    }
    .card h3 {
      margin: 16px 0 8px;
      font-size: 16px;
    }
    .card p {
      margin: 0;
      color: var(--muted);
      line-height: 1.6;
      font-size: 14px;
    }
    pre {
      overflow-x: auto;
      margin: 18px 0 0;
      padding: 18px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--code);
      color: #d7e2ef;
      line-height: 1.6;
    }
    .module {
      min-height: 92px;
    }
    .module span {
      display: block;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.45;
    }
    .public-endpoints {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .endpoint {
      display: flex;
      align-items: center;
      gap: 10px;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 14px;
      background: var(--surface);
    }
    .method {
      min-width: 42px;
      color: var(--success);
      font-size: 12px;
      font-weight: 800;
    }
    footer {
      margin-top: 56px;
      padding-top: 22px;
      border-top: 1px solid var(--border);
      color: var(--muted);
      font-size: 13px;
    }
    @media (max-width: 860px) {
      .meta-grid,
      .steps { grid-template-columns: 1fr; }
      .module-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 560px) {
      .shell { width: min(100% - 24px, 1120px); padding-top: 36px; }
      .module-grid,
      .public-endpoints { grid-template-columns: 1fr; }
      .actions { flex-direction: column; }
      .button { width: 100%; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <p class="eyebrow">REST API · OpenAPI ${safeVersion}</p>
    <h1>${safeAppName}</h1>
    <p class="lead">
      Backend API for inventory, purchasing, sales, stock control, reporting,
      administration, and audit workflows. Use this page as the entry point;
      use Swagger for the complete interactive contract.
    </p>

    <div class="actions">
      ${documentationActions}
      <a class="button" href="${safeApiBase}/health/ready">Check readiness</a>
    </div>

    <div class="meta-grid">
      <div class="card">
        <strong>API base</strong>
        <code>${safeApiBase}</code>
      </div>
      <div class="card">
        <strong>Authentication</strong>
        <span>JWT Bearer access token</span>
      </div>
      <div class="card">
        <strong>Response format</strong>
        <span>JSON with standardized errors</span>
      </div>
    </div>

    <section>
      <h2>Getting started</h2>
      <div class="steps">
        <div class="card">
          <span class="step-number">1</span>
          <h3>Check the API</h3>
          <p>Verify liveness or database readiness before sending application traffic.</p>
        </div>
        <div class="card">
          <span class="step-number">2</span>
          <h3>Authenticate</h3>
          <p>Sign in with <code>POST ${safeApiBase}/auth/login</code> to receive access and refresh tokens.</p>
        </div>
        <div class="card">
          <span class="step-number">3</span>
          <h3>Call protected routes</h3>
          <p>Send <code>Authorization: Bearer &lt;access-token&gt;</code> with authenticated requests.</p>
        </div>
      </div>
      <pre><code>curl "${safeApiBase}/health/ready"

curl -X POST "${safeApiBase}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"your-password"}'</code></pre>
    </section>

    <section>
      <h2>Public endpoints</h2>
      <div class="public-endpoints">
        <div class="endpoint"><span class="method">GET</span><code>${safeApiBase}/health</code></div>
        <div class="endpoint"><span class="method">GET</span><code>${safeApiBase}/health/ready</code></div>
        <div class="endpoint"><span class="method">POST</span><code>${safeApiBase}/auth/login</code></div>
        <div class="endpoint"><span class="method">POST</span><code>${safeApiBase}/auth/refresh</code></div>
      </div>
    </section>

    <section>
      <h2>API areas</h2>
      <div class="module-grid">
        <div class="card module"><strong>Authentication</strong><span>Login, refresh, logout, current user</span></div>
        <div class="card module"><strong>Dashboard</strong><span>Operational inventory summaries</span></div>
        <div class="card module"><strong>Products</strong><span>Product master and lookup data</span></div>
        <div class="card module"><strong>Inventory</strong><span>Balances, adjustments, transfers, movements</span></div>
        <div class="card module"><strong>Warehouses</strong><span>Warehouse master data and stock locations</span></div>
        <div class="card module"><strong>Purchasing</strong><span>Suppliers, purchase orders, goods receipts</span></div>
        <div class="card module"><strong>Sales</strong><span>Customers, sales orders, returns</span></div>
        <div class="card module"><strong>Stock counts</strong><span>Physical counts, variance and posting</span></div>
        <div class="card module"><strong>Reports</strong><span>Inventory, purchasing and sales reporting</span></div>
        <div class="card module"><strong>Administration</strong><span>Users, roles, permissions and settings</span></div>
        <div class="card module"><strong>Audit</strong><span>Append-only operational audit trail</span></div>
        <div class="card module"><strong>Master data</strong><span>Categories, units and shared reference data</span></div>
      </div>
    </section>

    <footer>
      ${safeAppName} · API contract version ${safeVersion} · Detailed schemas and request examples are available in Swagger.
    </footer>
  </main>
</body>
</html>`;
  }
}
