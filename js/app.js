const API = ""; // same-origin: Flask serves this page too

// ---------------------------------------------------------------- tabs ----
const railLinks = document.querySelectorAll(".rail-link");
railLinks.forEach(btn => {
  btn.addEventListener("click", () => {
    railLinks.forEach(b => b.classList.remove("is-active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("is-active"));
    btn.classList.add("is-active");
    document.getElementById("panel-" + btn.dataset.tab).classList.add("is-active");

    if (btn.dataset.tab === "lexical") loadFrequency();
    if (btn.dataset.tab === "syntax") loadGrammar();
  });
});

// ------------------------------------------------------------ helpers ----
function esc(s){
  return String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
}

function renderTokens(tokens){
  return tokens.map(t =>
    `<span class="tok tok-${t.category}">${esc(t.token)}<span class="cat">${t.category}</span></span>`
  ).join("");
}

// --------------------------------------------------------- collection ----
async function loadStatements(){
  const res = await fetch(`${API}/api/statements`);
  const data = await res.json();
  const tbody = document.querySelector("#statements-table tbody");
  tbody.innerHTML = data.statements.map(s => `
    <tr><td>${s.id}</td><td>${esc(s.topic)}</td><td class="wrap">${esc(s.text)}</td></tr>
  `).join("");
  document.getElementById("stat-statements").textContent = data.statements.length;
  return data;
}

document.getElementById("add-statement-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = document.getElementById("new-statement-text").value.trim();
  const topic = document.getElementById("new-statement-topic").value;
  if (!text) return;
  await fetch(`${API}/api/statements`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({text, topic})
  });
  document.getElementById("new-statement-text").value = "";
  loadStatements();
});

// ------------------------------------------------------------- lexical ---
document.getElementById("lexer-run-btn").addEventListener("click", runLexer);
document.getElementById("lexer-input").addEventListener("keydown", e => { if (e.key === "Enter") runLexer(); });

async function runLexer(){
  const text = document.getElementById("lexer-input").value.trim();
  if (!text) return;
  const res = await fetch(`${API}/api/lexer/tokenize`, {
    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({text})
  });
  const data = await res.json();
  document.getElementById("lexer-output").innerHTML = renderTokens(data.tokens);
}

async function loadFrequency(){
  const res = await fetch(`${API}/api/lexer/frequency`);
  const data = await res.json();
  document.querySelector("#freq-table tbody").innerHTML = data.token_frequency
    .slice(0, 25)
    .map(r => `<tr><td>${esc(r.token)}</td><td>${r.count}</td></tr>`).join("");
  document.querySelector("#cat-table tbody").innerHTML = Object.entries(data.category_counts)
    .sort((a,b) => b[1]-a[1])
    .map(([cat,count]) => `<tr><td>${cat}</td><td>${count}</td></tr>`).join("");
  document.getElementById("stat-tokens").textContent = data.token_frequency.length;
}

// -------------------------------------------------------------- syntax ---
async function loadGrammar(){
  const [stagesRes, analysisRes] = await Promise.all([
    fetch(`${API}/api/grammar`), fetch(`${API}/api/grammar/analysis`)
  ]);
  const stages = await stagesRes.json();
  const analysis = await analysisRes.json();

  const order = [
    ["original", "1 · Original grammar (left-recursive)"],
    ["after_left_recursion_removal", "2 · After removing left recursion"],
    ["after_left_factoring", "3 · After left factoring (final — used below)"]
  ];
  document.getElementById("grammar-stages").innerHTML = order.map(([key, label]) => {
    const g = stages[key];
    const lines = Object.entries(g.productions).map(([nt, alts]) =>
      `${nt.padEnd(4)} -> ${alts.map(a => a.join(" ")).join(" | ")}`
    ).join("\n");
    return `<div class="stage-card">
      <h4>${label}</h4>
      <p class="note">${esc(g.note || "")}</p>
      <pre>${esc(lines)}</pre>
    </div>`;
  }).join("");

  document.querySelector("#first-table tbody").innerHTML = Object.entries(analysis.first)
    .map(([nt, set]) => `<tr><td>${nt}</td><td class="mono">{ ${set.join(", ")} }</td></tr>`).join("");
  document.querySelector("#follow-table tbody").innerHTML = Object.entries(analysis.follow)
    .map(([nt, set]) => `<tr><td>${nt}</td><td class="mono">{ ${set.join(", ")} }</td></tr>`).join("");

  const nts = Object.keys(analysis.table);
  const terms = new Set();
  nts.forEach(nt => Object.keys(analysis.table[nt]).forEach(t => terms.add(t)));
  const termList = Array.from(terms).sort();

  const table = document.getElementById("ll1-table");
  table.innerHTML = `
    <thead><tr><th></th>${termList.map(t => `<th>${t}</th>`).join("")}</tr></thead>
    <tbody>${nts.map(nt => `
      <tr><th>${nt}</th>${termList.map(t => {
        const prod = analysis.table[nt][t];
        return `<td class="mono">${prod ? esc(prod.join(" ")) : ""}</td>`;
      }).join("")}</tr>
    `).join("")}</tbody>`;

  const verdict = document.getElementById("ll1-verdict");
  if (analysis.is_ll1){
    verdict.textContent = "No conflicts — this grammar is LL(1).";
    verdict.className = "ll1-verdict ok";
  } else {
    verdict.textContent = `${analysis.conflicts.length} conflict(s) found — see table.`;
    verdict.className = "ll1-verdict bad";
  }
}

// -------------------------------------------------------------- parser ---
document.getElementById("parser-run-btn").addEventListener("click", runParser);
document.getElementById("parser-input").addEventListener("keydown", e => { if (e.key === "Enter") runParser(); });

function renderParseResult(data){
  const banner = data.accepted
    ? `<span class="result-banner accept">✓ Accepted by the grammar</span>`
    : `<span class="result-banner reject">✗ Rejected</span>`;

  const skipped = data.skipped_tokens.length
    ? `<p><strong>Skipped tokens</strong> (no terminal mapping — SLANG/CODEMIX/PUNCT/etc.): ${
        data.skipped_tokens.map(t => `<code>${esc(t.token)} [${t.category}]</code>`).join(", ")
      }</p>` : "";

  const traceRows = data.trace.map(row => `
    <tr><td class="mono">${esc(row.stack)}</td><td class="mono">${esc(row.remaining_input)}</td><td>${esc(row.action)}</td></tr>
  `).join("");

  return `
    ${banner}
    <div class="token-output">${renderTokens(data.tokens)}</div>
    <p><strong>Terminals fed to parser:</strong> <span class="mono">${data.terminals.join(" ")}</span></p>
    ${skipped}
    ${data.error ? `<p style="color:var(--brick)"><strong>${esc(data.error)}</strong></p>` : ""}
    <div class="table-wrap">
      <table><thead><tr><th>Stack</th><th>Remaining input</th><th>Action</th></tr></thead>
      <tbody>${traceRows}</tbody></table>
    </div>
  `;
}

async function runParser(){
  const text = document.getElementById("parser-input").value.trim();
  if (!text) return;
  const res = await fetch(`${API}/api/parser/parse`, {
    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({text})
  });
  const data = await res.json();
  document.getElementById("parser-single-result").innerHTML = renderParseResult(data);
}

document.getElementById("run-suite-btn").addEventListener("click", async () => {
  const res = await fetch(`${API}/api/parser/test-suite`);
  const data = await res.json();
  document.querySelector("#suite-table tbody").innerHTML = data.results.map(r => `
    <tr>
      <td class="wrap">${esc(r.text)}</td>
      <td class="mono">${r.terminals.join(" ")}</td>
      <td><span class="badge ${r.accepted ? "accept" : "reject"}">${r.accepted ? "Accepted" : "Rejected"}</span></td>
    </tr>
  `).join("");
  document.getElementById("stat-accept").textContent = `${data.accepted}/${data.total}`;
});

// ---------------------------------------------------------- translator ---
document.getElementById("translate-run-btn").addEventListener("click", runTranslate);
document.getElementById("translate-input").addEventListener("keydown", e => { if (e.key === "Enter") runTranslate(); });

function renderTranslateResult(data){
  const directionLabels = {
    to_french: "Français", to_english: "English",
    from_french: "Pidgin / Franc-anglais", from_english: "Pidgin / Franc-anglais",
  };

  const words = data.words.map(w => {
    const statusClass = "status-" + w.status;
    const showMeaning = w.meaning && w.meaning !== w.translation;
    return `
      <div class="translate-word ${statusClass}">
        <span class="src">${esc(w.source)}</span>
        <span class="arrow">&#8595;</span>
        <span class="tgt">${esc(w.translation)}</span>
        ${showMeaning ? `<span class="meaning">${esc(w.meaning)}</span>` : ""}
        <span class="translate-word-status ${w.status}">${
          w.status === "dictionary" ? "dictionnaire" : w.status === "online" ? "recherche en ligne" : "non trouvé"
        }</span>
      </div>`;
  }).join("");

  const onlineNote = data.used_online_fallback
    ? `<p class="translate-note info">Au moins un mot a été traduit via une recherche en ligne d'appoint — à prendre avec prudence (moins fiable que le dictionnaire vérifié).</p>`
    : "";

  const unresolvedNote = data.unresolved_words.length
    ? `<p class="translate-note warn">Non couverts par le dictionnaire : ${data.unresolved_words.map(esc).join(", ")}</p>`
    : "";

  return `
    <div class="translate-sentence">
      <span class="label">${directionLabels[data.direction]}</span>
      ${esc(data.translated_text)}
    </div>
    ${onlineNote}
    ${unresolvedNote}
    <div class="translate-words">${words}</div>
  `;
}

async function runTranslate(){
  const text = document.getElementById("translate-input").value.trim();
  const direction = document.getElementById("translate-direction").value;
  if (!text) return;

  const loading = document.getElementById("translate-loading");
  const resultBox = document.getElementById("translate-result");
  loading.hidden = false;
  resultBox.innerHTML = "";

  try {
    const res = await fetch(`${API}/api/translate`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({text, direction}),
    });
    const data = await res.json();
    if (!res.ok) {
      resultBox.innerHTML = `<p class="translate-note warn">${esc(data.error || "La traduction a échoué.")}</p>`;
      return;
    }
    resultBox.innerHTML = renderTranslateResult(data);
  } catch (e) {
    resultBox.innerHTML = `<p class="translate-note warn">Impossible de contacter le serveur de traduction.</p>`;
  } finally {
    loading.hidden = true;
  }
}

// ------------------------------------------------------------- boot up ---
(async function init(){
  const bootLoader = document.getElementById("boot-loader");
  try {
    await loadStatements();
    // Pre-warm the accept/reject stat on the overview tab.
    const res = await fetch(`${API}/api/parser/test-suite`);
    const data = await res.json();
    document.getElementById("stat-accept").textContent = `${data.accepted}/${data.total}`;
  } catch(e) {
    // Even if the backend isn't reachable yet, don't leave the loading screen up forever.
  } finally {
    bootLoader.classList.add("is-hidden");
    setTimeout(() => bootLoader.remove(), 400);
  }
})();
