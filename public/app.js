const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const money = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export async function loadInvestigation(fetcher) {
  try {
    const response = await fetcher('/api/investigation', { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error('Request failed');
    const data = await response.json();
    if (data.classification !== 'SYNTHETIC_ONLY' || data.access !== 'PUBLIC_SYNTHETIC_READ_ONLY') throw new Error('Unsafe data boundary');
    if (!Array.isArray(data.coverage) || !Array.isArray(data.findings) || data.coverage.length === 0 || data.findings.length === 0) {
      return { status: 'empty' };
    }
    return { status: 'ready', data };
  } catch {
    return { status: 'error' };
  }
}

export function renderView(state) {
  if (state.status === 'loading') return '<p class="note" role="status">Loading synthetic evidence…</p>';
  if (state.status === 'error') return '<section role="alert"><h2>Investigation unavailable</h2><p>The local synthetic data could not be loaded. Check the server and try again.</p></section>';
  if (state.status === 'empty') return '<section><h2>No synthetic evidence yet</h2><p>Run the local seed command, then refresh this page.</p></section>';

  const { artifacts, coverage, findings, receipts } = state.data;
  const receiptsByKey = new Map(receipts.map((receipt) => [receipt.objectKey, receipt]));
  const coverageMarkup = coverage.map((month) => `<article class="card"><strong>${escapeHtml(month.month)} — ${escapeHtml(month.status)}</strong><br>Bank: ${escapeHtml(month.bankRows)} normalized rows · Clover: ${escapeHtml(month.cloverRows)} normalized rows</article>`).join('');
  const findingMarkup = findings.map((finding) => {
    const matched = finding.status === 'MATCHED';
    const difference = Math.abs(finding.expectedCents - finding.observedCents);
    const title = matched ? 'Matched deposit' : 'Deliberate anomaly';
    const summary = matched
      ? `Bank deposit ${money(finding.expectedCents)} equals Clover settlement ${money(finding.observedCents)}.`
      : `Bank deposit ${money(finding.expectedCents)} differs from Clover settlement ${money(finding.observedCents)} by ${money(difference)}.`;
    const trace = finding.trace.map((record) => `<li><code>${escapeHtml(record.artifactKey)}#${escapeHtml(record.sourceRow)}</code></li>`).join('');
    return `<article class="card ${matched ? 'match' : 'anomaly'}"><h3>${title}</h3><p>${escapeHtml(summary)}</p><p>${escapeHtml(finding.explanation)}</p><h4>Exact evidence trace</h4><ul>${trace}</ul></article>`;
  }).join('');
  const receiptMarkup = artifacts.map((artifact) => {
    const receipt = receiptsByKey.get(artifact.objectKey);
    return `<tr><td><code>${escapeHtml(artifact.objectKey)}</code></td><td><code>${escapeHtml(receipt?.sha256 ?? 'missing')}</code></td><td>${escapeHtml(artifact.rowCount)}</td><td>${escapeHtml(receipt?.importedAt ?? 'missing')}</td></tr>`;
  }).join('');

  return `<p class="note" role="status">Loaded synthetic-only, public read-only investigation data.</p>
    <section aria-labelledby="coverage"><h2 id="coverage">Monthly coverage</h2><div class="grid">${coverageMarkup}</div></section>
    <section aria-labelledby="findings"><h2 id="findings">Deterministic reconciliation</h2><div class="grid">${findingMarkup}</div></section>
    <section aria-labelledby="evidence"><h2 id="evidence">Preserved evidence receipts</h2><div class="table-scroll"><table><thead><tr><th>Object key</th><th>SHA-256 receipt</th><th>Rows</th><th>Imported</th></tr></thead><tbody>${receiptMarkup}</tbody></table></div></section>`;
}

export async function boot(root, fetcher = globalThis.fetch.bind(globalThis)) {
  root.innerHTML = renderView({ status: 'loading' });
  root.innerHTML = renderView(await loadInvestigation(fetcher));
}
