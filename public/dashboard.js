const API_BASE = window.location.origin;
let autoRefreshInterval;

// Format helpers
function formatCost(cost) {
  return `$${(cost || 0).toFixed(4)}`;
}

function formatLatency(ms) {
  return ms ? `${ms}ms` : "-";
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

// Fetch data from API
async function fetchStats() {
  const response = await fetch(`${API_BASE}/api/stats`);
  if (!response.ok) throw new Error(`Stats API error: ${response.status}`);
  return response.json();
}

async function fetchDecisions(limit = 50) {
  const response = await fetch(`${API_BASE}/api/decisions?limit=${limit}`);
  if (!response.ok) throw new Error(`Decisions API error: ${response.status}`);
  return response.json();
}

async function fetchRules() {
  const response = await fetch(`${API_BASE}/api/rules`);
  if (!response.ok) throw new Error(`Rules API error: ${response.status}`);
  return response.json();
}

async function fetchCurrentModel() {
  const response = await fetch(`${API_BASE}/api/current-model`);
  if (!response.ok) throw new Error(`Current model API error: ${response.status}`);
  return response.json();
}

// Render functions
function renderStats(stats) {
  document.getElementById("total-requests").textContent = stats.totalRequests;
  document.getElementById("total-cost").textContent = formatCost(stats.totalCost);
  document.getElementById("escalation-rate").textContent = formatPercent(stats.escalationRate);
  document.getElementById("avg-latency").textContent = formatLatency(Math.round(stats.avgLatency || 0));
}

function renderCurrentModel(modelData) {
  const el = document.getElementById("current-model");
  if (!el) return;
  const name = (modelData.modelName || "unknown").toUpperCase();
  el.textContent = name;
  el.className = "current-model-value model-active-" + (modelData.modelName || "unknown");
}

function renderModelBreakdown(stats, currentModelName) {
  const container = document.getElementById("model-breakdown");
  container.innerHTML = "";

  if (!stats.byModel || Object.keys(stats.byModel).length === 0) {
    container.innerHTML = '<div class="loading">No model data yet</div>';
    return;
  }

  for (const [model, data] of Object.entries(stats.byModel)) {
    const div = document.createElement("div");
    div.className = "model-item";
    if (model === currentModelName) {
      div.classList.add("model-item-active");
    }
    div.innerHTML = `
      <div class="model-header">
        <span class="model-name">${model.toUpperCase()}${model === currentModelName ? ' <span class="active-badge">ACTIVE</span>' : ''}</span>
        <span>${data.count} requests</span>
      </div>
      <div class="model-stats">
        <div>Cost: ${formatCost(data.totalCost)}</div>
        <div>Avg Latency: ${formatLatency(Math.round(data.avgLatency))}</div>
        <div>Requests: ${data.count}</div>
      </div>
    `;
    container.appendChild(div);
  }
}

function renderDecisions(decisions) {
  const tbody = document.getElementById("decisions-body");
  tbody.innerHTML = "";

  if (!Array.isArray(decisions) || decisions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading">No decisions yet</td></tr>';
    return;
  }

  decisions.forEach(d => {
    try {
      const tr = document.createElement("tr");

      const statusBadge = d.status
        ? `<span class="badge badge-${d.status === 'success' ? 'success' : 'error'}">${d.status}</span>`
        : '<span class="badge badge-pending">pending</span>';

      const modelDisplay = d.escalated_from
        ? `<span class="badge-model">${d.model}</span> <span class="escalated">${d.escalated_from}</span>`
        : `<span class="badge-model">${d.model}</span>`;

      const tokens = d.tokens != null ? d.tokens.toLocaleString() : "-";

      tr.innerHTML = `
        <td>${formatTime(d.timestamp)}</td>
        <td>${modelDisplay}</td>
        <td>${d.rule || "-"}</td>
        <td>${tokens}</td>
        <td>${statusBadge}</td>
        <td>${formatLatency(d.latency_ms)}</td>
        <td>${formatCost(d.cost_usd)}</td>
      `;
      tbody.appendChild(tr);
    } catch (rowErr) {
      console.error("Failed to render decision row:", rowErr, d);
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="7" class="loading">Error rendering row</td>`;
      tbody.appendChild(tr);
    }
  });
}

function renderRules(rules) {
  const container = document.getElementById("rules-container");
  container.innerHTML = "";

  if (!Array.isArray(rules) || rules.length === 0) {
    container.innerHTML = '<div class="loading">No rules configured</div>';
    return;
  }

  rules.forEach(rule => {
    const div = document.createElement("div");
    div.className = "rule-item";

    const conditionsHtml = rule.conditions
      ? `<div class="rule-conditions">Conditions: ${JSON.stringify(rule.conditions)}</div>`
      : "";

    div.innerHTML = `
      <div class="rule-header">
        <span class="rule-name">${rule.name}</span>
        <span class="rule-hits">${rule.hits} hits</span>
      </div>
      <div>Routes to: <span class="rule-model">${rule.model}</span></div>
      ${conditionsHtml}
    `;
    container.appendChild(div);
  });
}

// Update dashboard
async function updateDashboard() {
  try {
    const [stats, decisions, rules, currentModel] = await Promise.all([
      fetchStats().catch(err => { console.error("Stats fetch failed:", err); return null; }),
      fetchDecisions().catch(err => { console.error("Decisions fetch failed:", err); return null; }),
      fetchRules().catch(err => { console.error("Rules fetch failed:", err); return null; }),
      fetchCurrentModel().catch(err => { console.error("Current model fetch failed:", err); return null; })
    ]);

    if (currentModel) {
      renderCurrentModel(currentModel);
    }

    if (stats) {
      renderStats(stats);
      renderModelBreakdown(stats, currentModel ? currentModel.modelName : null);
    }

    if (decisions) {
      renderDecisions(decisions);
    } else {
      document.getElementById("decisions-body").innerHTML =
        '<tr><td colspan="7" class="loading">Failed to load decisions</td></tr>';
    }

    if (rules) {
      renderRules(rules);
    } else {
      document.getElementById("rules-container").innerHTML =
        '<div class="loading">Failed to load rules</div>';
    }

    document.getElementById("last-updated").textContent = new Date().toLocaleTimeString();
  } catch (error) {
    console.error("Failed to update dashboard:", error);
  }
}

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  updateDashboard();

  // Auto-refresh every 10 seconds
  autoRefreshInterval = setInterval(updateDashboard, 10000);

  // Manual refresh button
  document.getElementById("refresh-btn").addEventListener("click", updateDashboard);
});
