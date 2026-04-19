const API_BASE = "http://localhost:3000";
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
  return response.json();
}

async function fetchDecisions(limit = 50) {
  const response = await fetch(`${API_BASE}/api/decisions?limit=${limit}`);
  return response.json();
}

async function fetchRules() {
  const response = await fetch(`${API_BASE}/api/rules`);
  return response.json();
}

// Render functions
function renderStats(stats) {
  document.getElementById("total-requests").textContent = stats.totalRequests;
  document.getElementById("total-cost").textContent = formatCost(stats.totalCost);
  document.getElementById("escalation-rate").textContent = formatPercent(stats.escalationRate);
  document.getElementById("avg-latency").textContent = formatLatency(Math.round(stats.avgLatency));
}

function renderModelBreakdown(stats) {
  const container = document.getElementById("model-breakdown");
  container.innerHTML = "";

  for (const [model, data] of Object.entries(stats.byModel)) {
    const div = document.createElement("div");
    div.className = "model-item";
    div.innerHTML = `
      <div class="model-header">
        <span class="model-name">${model.toUpperCase()}</span>
        <span>${data.count} requests</span>
      </div>
      <div class="model-stats">
        <div>Cost: ${formatCost(data.cost)}</div>
        <div>Avg Latency: ${formatLatency(Math.round(data.avgLatency))}</div>
        <div>Tokens: ${data.tokens.toLocaleString()}</div>
      </div>
    `;
    container.appendChild(div);
  }
}

function renderDecisions(decisions) {
  const tbody = document.getElementById("decisions-body");
  tbody.innerHTML = "";

  if (decisions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading">No decisions yet</td></tr>';
    return;
  }

  decisions.forEach(d => {
    const tr = document.createElement("tr");

    const statusBadge = d.status
      ? `<span class="badge badge-${d.status === 'success' ? 'success' : 'error'}">${d.status}</span>`
      : '<span class="badge badge-pending">pending</span>';

    const modelDisplay = d.escalated_from
      ? `<span class="badge-model">${d.model}</span> <span class="escalated">↑${d.escalated_from}</span>`
      : `<span class="badge-model">${d.model}</span>`;

    tr.innerHTML = `
      <td>${formatTime(d.timestamp)}</td>
      <td>${modelDisplay}</td>
      <td>${d.rule}</td>
      <td>${d.tokens.toLocaleString()}</td>
      <td>${statusBadge}</td>
      <td>${formatLatency(d.latency_ms)}</td>
      <td>${formatCost(d.cost_usd)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderRules(rules) {
  const container = document.getElementById("rules-container");
  container.innerHTML = "";

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
    const [stats, decisions, rules] = await Promise.all([
      fetchStats(),
      fetchDecisions(),
      fetchRules()
    ]);

    renderStats(stats);
    renderModelBreakdown(stats);
    renderDecisions(decisions);
    renderRules(rules);

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
