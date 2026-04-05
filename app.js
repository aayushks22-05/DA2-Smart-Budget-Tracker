/**
 * Smart Budget Tracker
 * Author: [Student Name]
 * Course: BCSE203E - Web Programming
 * Digital Assignment II
 *
 * Features:
 * - Add / delete income & expense transactions
 * - Category-based budget limits with progress bars
 * - LocalStorage persistence
 * - Search & filter history
 * - Pie + Bar chart analytics (canvas-drawn, no libraries)
 * - Toast notifications
 */

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let transactions = JSON.parse(localStorage.getItem('sbt_transactions')) || [];
let budgets      = JSON.parse(localStorage.getItem('sbt_budgets')) || {};
let totalBudget  = parseFloat(localStorage.getItem('sbt_total_budget')) || 0;
let budgetPeriod = localStorage.getItem('sbt_budget_period') || 'monthly';
let currentType  = 'expense';

// Category emoji map
let CATEGORY_ICONS = JSON.parse(localStorage.getItem('sbt_categories')) || {
  Food: '🍔', Transport: '🚗', Shopping: '🛍️',
  Entertainment: '🎬', Health: '🏥', Utilities: '💡',
  Salary: '💼', Freelance: '💻', Other: '📦'
};

// ─────────────────────────────────────────────
// CUSTOM CATEGORIES
// ─────────────────────────────────────────────
function getCleanId(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/gi, '');
}

function renderCategoryUI() {
  const catSelect = document.getElementById('category');
  const filterSelect = document.getElementById('filter-category');
  const budgetGrid = document.getElementById('budget-grid');

  if (catSelect) {
    catSelect.innerHTML = Object.entries(CATEGORY_ICONS)
      .map(([cat, icon]) => `<option value="${cat}">${icon} ${cat}</option>`)
      .join('');
  }

  if (filterSelect) {
    filterSelect.innerHTML = '<option value="All">All Categories</option>' + 
      Object.entries(CATEGORY_ICONS)
      .map(([cat, icon]) => `<option value="${cat}">${cat}</option>`)
      .join('');
  }

  if (budgetGrid) {
    budgetGrid.innerHTML = Object.entries(CATEGORY_ICONS)
      .map(([cat, icon]) => `
          <div class="budget-input">
            <label>${icon} ${cat.toUpperCase()}</label>
            <input type="number" id="bm-${getCleanId(cat)}" placeholder="0" min="0" step="50">
          </div>`)
      .join('');
  }
}

function addNewCategory() {
  const name = prompt("Enter new category name:");
  if (!name || !name.trim() || CATEGORY_ICONS[name.trim()]) return;
  const icon = prompt("Enter an emoji for this category:", "📌");
  if (!icon || !icon.trim()) return;

  CATEGORY_ICONS[name.trim()] = icon.trim();
  saveData();
  renderCategoryUI();
  showToast('✅ Category added!');
}

function deleteCategory() {
  const catSelect = document.getElementById('category');
  if (!catSelect) return;
  const cat = catSelect.value;
  if (!cat) return;

  if (Object.keys(CATEGORY_ICONS).length <= 1) {
    alert("You must have at least one category.");
    return;
  }

  if (confirm(`Are you sure you want to delete the "${cat}" category?\n\nNote: This will not delete existing transactions under this category.`)) {
    delete CATEGORY_ICONS[cat];
    saveData();
    renderCategoryUI();
    showToast(`🗑️ ${cat} category deleted`);
  }
}

// ─────────────────────────────────────────────
// THEME TOGGLE
// ─────────────────────────────────────────────
function toggleTheme() {
  const html = document.documentElement;
  const isLight = html.getAttribute('data-theme') === 'light';
  const newTheme = isLight ? 'dark' : 'light';
  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('sbt_theme', newTheme);

  const icon = document.getElementById('toggle-icon');
  if (icon) icon.textContent = newTheme === 'light' ? '☀️' : '🌙';

  // Redraw charts if on analytics page
  if (document.getElementById('analytics').classList.contains('active')) {
    drawCharts();
  }
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Restore saved theme
  const savedTheme = localStorage.getItem('sbt_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  const icon = document.getElementById('toggle-icon');
  if (icon) icon.textContent = savedTheme === 'light' ? '☀️' : '🌙';

  // Set today's date as default
  document.getElementById('date').valueAsDate = new Date();
  renderCategoryUI();
  renderAll();
});

// ─────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────
function showSection(id) {
  // Hide all sections & deactivate nav buttons
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  // Show target section
  document.getElementById(id).classList.add('active');

  // Activate correct nav button (index matches section order)
  const order = ['dashboard', 'add-transaction', 'history', 'analytics'];
  const idx = order.indexOf(id);
  if (idx !== -1) document.querySelectorAll('.nav-btn')[idx].classList.add('active');

  // Draw charts only when analytics is visible
  if (id === 'analytics') drawCharts();
}

// ─────────────────────────────────────────────
// FORM: TYPE TOGGLE
// ─────────────────────────────────────────────
function setType(type) {
  currentType = type;

  document.getElementById('btn-expense').classList.toggle('active', type === 'expense');
  document.getElementById('btn-income').classList.toggle('active', type === 'income');

  const expContainer = document.getElementById('expense-category-container');
  const incContainer = document.getElementById('income-category');
  const catLabel = document.getElementById('category-label');

  if (type === 'income') {
    if (expContainer) expContainer.style.display = 'none';
    if (incContainer) incContainer.style.display = 'block';
    if (catLabel) catLabel.textContent = 'Label';
  } else {
    if (expContainer) expContainer.style.display = 'flex';
    if (incContainer) incContainer.style.display = 'none';
    if (catLabel) catLabel.textContent = 'Category';
  }
}

// ─────────────────────────────────────────────
// ADD TRANSACTION
// ─────────────────────────────────────────────
function addTransaction() {
  const desc = document.getElementById('desc').value.trim();
  const amount = parseFloat(document.getElementById('amount').value);
  
  let cat = '';
  if (currentType === 'expense') {
    cat = document.getElementById('category').value;
  } else {
    cat = document.getElementById('income-category').value.trim();
    if (!cat) cat = "Custom";
  }

  const date = document.getElementById('date').value;
  const msgEl = document.getElementById('form-msg');

  // Validation
  if (!desc) { showMsg(msgEl, '⚠️ Please enter a description.', 'red'); return; }
  if (!amount || amount <= 0) { showMsg(msgEl, '⚠️ Enter a valid amount.', 'red'); return; }
  if (!date) { showMsg(msgEl, '⚠️ Please select a date.', 'red'); return; }

  // Build transaction object
  const txn = {
    id: Date.now(),
    type: currentType,
    desc,
    amount,
    category: cat,
    date
  };

  transactions.unshift(txn);  // Newest first
  saveData();
  renderAll();

  // Reset form
  document.getElementById('desc').value = '';
  document.getElementById('amount').value = '';
  document.getElementById('income-category').value = '';
  document.getElementById('date').valueAsDate = new Date();
  showMsg(msgEl, '✅ Transaction added!', 'green');
  showToast(`${currentType === 'income' ? '💵' : '💸'} Transaction added!`);
}

function showMsg(el, text, color) {
  el.textContent = text;
  el.style.color = color === 'green' ? 'var(--income)' : 'var(--expense)';
  setTimeout(() => { el.textContent = ''; el.style.color = ''; }, 3000);
}

// ─────────────────────────────────────────────
// DELETE TRANSACTION
// ─────────────────────────────────────────────
function deleteTransaction(id) {
  transactions = transactions.filter(t => t.id !== id);
  saveData();
  renderAll();
  showToast('🗑️ Transaction deleted');
}

// ─────────────────────────────────────────────
// CLEAR ALL
// ─────────────────────────────────────────────
function clearAll() {
  if (!confirm('Clear ALL transactions? This cannot be undone.')) return;
  transactions = [];
  budgets = {};
  totalBudget  = 0;
  saveData();
  renderAll();
  showToast('🗑️ All data cleared');
}

// ─────────────────────────────────────────────
// RENDER ALL
// ─────────────────────────────────────────────
function renderAll() {
  renderSummaryCards();
  renderBudgetBars();
  renderRecentTransactions();
  renderHistory(transactions);
  renderTopExpenses();
}

// ─────────────────────────────────────────────
// SUMMARY CARDS
// ─────────────────────────────────────────────
function renderSummaryCards() {
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : 0;

  document.getElementById('total-balance').textContent = fmt(balance);
  document.getElementById('total-income').textContent = fmt(totalIncome);
  document.getElementById('total-expense').textContent = fmt(totalExpense);
  document.getElementById('savings-rate').textContent = savingsRate + '%';

  const addBalanceEl = document.getElementById('add-current-balance');
  if (addBalanceEl) addBalanceEl.textContent = fmt(balance);
}

// ─────────────────────────────────────────────
// BUDGET GOAL MODAL
// ─────────────────────────────────────────────
function openBudgetModal() {
  // Populate fields with existing values
  document.getElementById('bm-period').value = budgetPeriod;
  document.getElementById('bm-total').value = totalBudget || '';
  Object.keys(CATEGORY_ICONS).forEach(cat => {
    const el = document.getElementById(`bm-${getCleanId(cat)}`);
    if (el) el.value = budgets[cat] || '';
  });
  document.getElementById('budget-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeBudgetModal() {
  document.getElementById('budget-modal').classList.remove('open');
  document.body.style.overflow = '';
}

function saveBudgetGoals() {
  budgetPeriod = document.getElementById('bm-period').value;
  const tot = parseFloat(document.getElementById('bm-total').value);
  totalBudget = tot > 0 ? tot : 0;

  Object.keys(CATEGORY_ICONS).forEach(cat => {
    const el  = document.getElementById(`bm-${getCleanId(cat)}`);
    const val = parseFloat(el ? el.value : '');
    if (val > 0) {
      budgets[cat] = val;
    } else {
      delete budgets[cat];
    }
  });

  saveData();
  renderAll();
  closeBudgetModal();
  showToast('🎯 Budget goals saved!');
}

// ─────────────────────────────────────────────
// BUDGET PROGRESS BARS
// ─────────────────────────────────────────────
function getPeriodLabel() {
  if (budgetPeriod === 'weekly') return 'Weekly';
  if (budgetPeriod === 'yearly') return 'Yearly';
  return 'Monthly';
}

function renderBudgetBars() {
  const container = document.getElementById('budget-bars');
  const now = new Date();

  const isInPeriod = (dateStr) => {
    const d = new Date(dateStr);
    if (budgetPeriod === 'yearly') return d.getFullYear() === now.getFullYear();
    if (budgetPeriod === 'weekly') {
      const diff = now.getTime() - d.getTime();
      return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
    }
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  };

  const periodExpense = transactions
    .filter(t => t.type === 'expense' && isInPeriod(t.date))
    .reduce((s, t) => s + t.amount, 0);

  const hasTotal    = totalBudget > 0;
  const hasCategory = Object.keys(budgets).length > 0;

  const titleEl = document.getElementById('budget-panel-title');
  if (titleEl) titleEl.textContent = `📊 ${getPeriodLabel()} Budget Goals`;

  if (!hasTotal && !hasCategory) {
    container.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">No budget goals set yet. Click <strong>+ Set Goal</strong> to start.</p>';
    return;
  }

  let html = '';

  if (hasTotal) {
    const pct = Math.min((periodExpense / totalBudget) * 100, 100);
    const cls = pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : '';
    html += `
      <div class="budget-bar-item">
        <div class="budget-bar-label">
          <span>📊 <strong>Overall Budget</strong></span>
          <span>${fmt(periodExpense)} / ${fmt(totalBudget)} (${Math.round(pct)}%)</span>
        </div>
        <div class="budget-bar-track">
          <div class="budget-bar-fill ${cls}" style="width:${pct}%"></div>
        </div>
      </div>
      <div style="height:12px"></div>`; // spacing
  }

  for (const [cat, limit] of Object.entries(budgets)) {
    const spent = transactions
      .filter(t => t.type === 'expense' && t.category === cat && isInPeriod(t.date))
      .reduce((s, t) => s + t.amount, 0);

    const pct = Math.min((spent / limit) * 100, 100);
    const cls = pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : '';
    const icon = CATEGORY_ICONS[cat] || '📦';

    html += `
      <div class="budget-bar-item">
        <div class="budget-bar-label">
          <span>${icon} ${cat}</span>
          <span>${fmt(spent)} / ${fmt(limit)} (${Math.round(pct)}%)</span>
        </div>
        <div class="budget-bar-track">
          <div class="budget-bar-fill ${cls}" style="width:${pct}%"></div>
        </div>
      </div>`;
  }

  container.innerHTML = html;
}

// ─────────────────────────────────────────────
// RECENT TRANSACTIONS (Dashboard)
// ─────────────────────────────────────────────
function renderRecentTransactions() {
  const list = document.getElementById('recent-list');
  const addList = document.getElementById('add-recent-list');
  const recent = transactions.slice(0, 5);
  
  const noDataHtml = '<p style="color:var(--text-muted); font-size:0.85rem;">No transactions yet.</p>';
  
  if (recent.length === 0) {
    if (list) list.innerHTML = noDataHtml;
    if (addList) addList.innerHTML = noDataHtml;
    return;
  }
  
  const html = recent.map(t => txnHTML(t)).join('');
  if (list) list.innerHTML = html;
  if (addList) addList.innerHTML = html;
}

// ─────────────────────────────────────────────
// HISTORY (full list with filters)
// ─────────────────────────────────────────────
function renderHistory(list) {
  const container = document.getElementById('history-list');
  const emptyMsg = document.getElementById('empty-msg');

  if (list.length === 0) {
    container.innerHTML = '';
    emptyMsg.style.display = 'block';
  } else {
    emptyMsg.style.display = 'none';
    container.innerHTML = list.map(t => txnHTML(t, true)).join('');
  }
}

function filterTransactions() {
  const query = document.getElementById('search-input').value.toLowerCase();
  const catF = document.getElementById('filter-category').value;
  const typeF = document.getElementById('filter-type').value;

  const filtered = transactions.filter(t => {
    const matchSearch = t.desc.toLowerCase().includes(query) || t.category.toLowerCase().includes(query);
    const matchCat = catF === 'All' || t.category === catF;
    const matchType = typeF === 'All' || t.type === typeF;
    return matchSearch && matchCat && matchType;
  });

  renderHistory(filtered);
}

// ─────────────────────────────────────────────
// TRANSACTION HTML HELPER
// ─────────────────────────────────────────────
function txnHTML(t, withDelete = false) {
  const icon = CATEGORY_ICONS[t.category] || '📦';
  const sign = t.type === 'income' ? '+' : '-';
  const dateFormatted = new Date(t.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const deleteBtn = withDelete
    ? `<button class="txn-delete" onclick="deleteTransaction(${t.id})" title="Delete">✕</button>`
    : '';

  return `
    <div class="txn-item" id="txn-${t.id}">
      <div class="txn-left">
        <div class="txn-icon">${icon}</div>
        <div>
          <div class="txn-desc">${escapeHTML(t.desc)}</div>
          <div class="txn-meta">${t.category} • ${dateFormatted}</div>
        </div>
      </div>
      <span class="txn-amount ${t.type}">${sign}${fmt(t.amount)}</span>
      ${deleteBtn}
    </div>`;
}

// ─────────────────────────────────────────────
// ANALYTICS: TOP EXPENSES
// ─────────────────────────────────────────────
function renderTopExpenses() {
  const container = document.getElementById('top-expenses-list');
  const top5 = transactions
    .filter(t => t.type === 'expense')
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  if (top5.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">No expense data yet.</p>';
    return;
  }
  container.innerHTML = top5.map((t, i) => `
    <div class="top-item">
      <span class="top-item-rank">#${i + 1}</span>
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${CATEGORY_ICONS[t.category] || '📦'} ${escapeHTML(t.desc)} <small style="color:var(--text-muted)">(${t.category})</small></span>
      <span class="top-item-amount">-${fmt(t.amount)}</span>
    </div>`).join('');
}

// ─────────────────────────────────────────────
// CHARTS (vanilla Canvas — no external libraries)
// ─────────────────────────────────────────────
function drawCharts() {
  drawPieChart();
  drawBarChart();
}

/**
 * DONUT CHART — Expense by Category
 */
function drawPieChart() {
  const canvas = document.getElementById('pie-chart');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const textColor = isDark ? '#f0f0f0' : '#111111';
  const subColor = isDark ? '#888888' : '#555555';
  const emptyColor = isDark ? '#303030' : '#e0e0e0';

  // Aggregate expenses by category
  const data = {};
  transactions.filter(t => t.type === 'expense').forEach(t => {
    data[t.category] = (data[t.category] || 0) + t.amount;
  });
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);

  // —— Empty state ——
  if (entries.length === 0) {
    const cx = W / 2, cy = H / 2 - 10;
    ctx.beginPath();
    ctx.arc(cx, cy, 72, 0, Math.PI * 2);
    ctx.strokeStyle = emptyColor;
    ctx.lineWidth = 20;
    ctx.stroke();
    ctx.fillStyle = subColor;
    ctx.font = '500 12px Inter, system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No expense data yet', cx, cy + 105);
    return;
  }

  const COLORS = [
    '#3b82f6', '#10d4a0', '#ff5f7e', '#f9a825',
    '#06b6d4', '#f97316', '#a855f7', '#14b8a6', '#ec4899'
  ];

  const total = entries.reduce((s, [, v]) => s + v, 0);
  const cx = W / 2, cy = 115; // donut centre
  const outerR = 90, innerR = 52;
  const GAP = 0.03;
  let startAngle = -Math.PI / 2;

  // Draw slices
  entries.forEach(([, val], i) => {
    const slice = (val / total) * 2 * Math.PI;
    const sA = startAngle + GAP / 2;
    const eA = startAngle + slice - GAP / 2;
    const mid = startAngle + slice / 2;

    // Radial gradient per slice
    const gx1 = cx + innerR * Math.cos(mid);
    const gy1 = cy + innerR * Math.sin(mid);
    const gx2 = cx + outerR * Math.cos(mid);
    const gy2 = cy + outerR * Math.sin(mid);
    const grad = ctx.createLinearGradient(gx1, gy1, gx2, gy2);
    grad.addColorStop(0, COLORS[i % COLORS.length] + 'aa');
    grad.addColorStop(1, COLORS[i % COLORS.length]);

    ctx.beginPath();
    ctx.arc(cx, cy, outerR, sA, eA);
    ctx.arc(cx, cy, innerR, eA, sA, true);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    startAngle += slice;
  });

  // Centre text
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = subColor;
  ctx.font = '500 10px Inter, system-ui';
  ctx.fillText('TOTAL SPENT', cx, cy - 11);
  ctx.fillStyle = textColor;
  ctx.font = '800 16px Outfit, Inter, system-ui';
  ctx.fillText(fmt(total), cx, cy + 9);

  // Two-column legend below the donut
  const legTop = cy + outerR + 20;
  const colW = W / 2;
  const ROW_H = 22;

  entries.forEach(([cat, val], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const lx = col === 0 ? 12 : colW + 6;
    const ly = legTop + row * ROW_H;

    if (ly + ROW_H > H) return; // clip if too many entries

    // Dot
    ctx.beginPath();
    ctx.arc(lx + 5, ly + 8, 5, 0, Math.PI * 2);
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.fill();

    // Label
    const pct = Math.round((val / total) * 100);
    ctx.fillStyle = subColor;
    ctx.font = '500 10px Inter, system-ui';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${cat}\u2002${pct}%`, lx + 14, ly + 3);
  });
}

/**
 * BAR CHART — Monthly Income vs Expense (last 6 months)
 * Gradient bars, rounded tops, dashed grid, value labels
 */
function drawBarChart() {
  const canvas = document.getElementById('bar-chart');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Build last 6 months
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: d.toLocaleString('default', { month: 'short' }),
      month: d.getMonth(),
      year: d.getFullYear(),
      income: 0,
      expense: 0
    });
  }
  transactions.forEach(t => {
    const d = new Date(t.date);
    const m = months.find(x => x.month === d.getMonth() && x.year === d.getFullYear());
    if (m) m[t.type] += t.amount;
  });

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const gridColor = isDark ? '#2a2a2a' : '#e8e8e8';
  const labelColor = isDark ? '#777777' : '#555555';
  const valuColor = isDark ? '#cccccc' : '#222222';

  const pad = { top: 28, bottom: 50, left: 58, right: 16 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;

  // Prevent broken y-axis when all values are 0
  const rawMax = Math.max(...months.flatMap(m => [m.income, m.expense]));
  const maxVal = rawMax > 0 ? rawMax * 1.15 : 1000; // 15% headroom

  const slotW = chartW / months.length;
  const barW = Math.max(slotW * 0.28, 6);

  // —— Dashed horizontal grid lines ——
  const LINES = 4;
  ctx.save();
  ctx.setLineDash([4, 6]);
  ctx.lineWidth = 1;
  for (let i = 0; i <= LINES; i++) {
    const y = pad.top + (chartH / LINES) * i;
    const val = maxVal * (1 - i / LINES);
    ctx.strokeStyle = gridColor;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(W - pad.right, y);
    ctx.stroke();
    ctx.fillStyle = labelColor;
    ctx.font = '10px Inter, system-ui';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(rawMax > 0 ? fmtShort(val) : '\u20b90', pad.left - 6, y);
  }
  ctx.restore();

  // Baseline
  ctx.strokeStyle = isDark ? '#383838' : '#cccccc';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top + chartH);
  ctx.lineTo(W - pad.right, pad.top + chartH);
  ctx.stroke();

  // Rounded-top bar helper
  function roundedBar(x, y, w, h, r) {
    if (h < 1) return;
    r = Math.min(r, h, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // —— Draw bars ——
  months.forEach((m, i) => {
    const cx = pad.left + slotW * i + slotW / 2;
    const incX = cx - barW - 2;
    const expX = cx + 2;
    const baseY = pad.top + chartH;

    // Income bar — green gradient
    const iH = (m.income / maxVal) * chartH;
    if (iH > 0.5) {
      const gI = ctx.createLinearGradient(0, baseY - iH, 0, baseY);
      gI.addColorStop(0, '#10d4a0');
      gI.addColorStop(1, '#10d4a044');
      ctx.fillStyle = gI;
      roundedBar(incX, baseY - iH, barW, iH, 5);
      ctx.fill();
      if (iH > 24) {
        ctx.fillStyle = valuColor;
        ctx.font = 'bold 8.5px Inter, system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(fmtShort(m.income), incX + barW / 2, baseY - iH - 3);
      }
    }

    // Expense bar — rose gradient
    const eH = (m.expense / maxVal) * chartH;
    if (eH > 0.5) {
      const gE = ctx.createLinearGradient(0, baseY - eH, 0, baseY);
      gE.addColorStop(0, '#ff5f7e');
      gE.addColorStop(1, '#ff5f7e44');
      ctx.fillStyle = gE;
      roundedBar(expX, baseY - eH, barW, eH, 5);
      ctx.fill();
      if (eH > 24) {
        ctx.fillStyle = valuColor;
        ctx.font = 'bold 8.5px Inter, system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(fmtShort(m.expense), expX + barW / 2, baseY - eH - 3);
      }
    }

    // Month label
    ctx.fillStyle = labelColor;
    ctx.font = '600 10.5px Inter, system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(m.label, cx, baseY + 7);
  });

  // —— Legend (circular dots) ——
  const legY = H - 13;
  const legX = pad.left;
  const legColor = isDark ? '#aaaaaa' : '#444444';

  ctx.beginPath();
  ctx.arc(legX + 5, legY, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#10d4a0';
  ctx.fill();
  ctx.fillStyle = legColor;
  ctx.font = '600 10.5px Inter, system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Income', legX + 13, legY);

  ctx.beginPath();
  ctx.arc(legX + 76, legY, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#ff5f7e';
  ctx.fill();
  ctx.fillStyle = legColor;
  ctx.fillText('Expense', legX + 84, legY);
}

// ─────────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────────
function saveData() {
  localStorage.setItem('sbt_transactions', JSON.stringify(transactions));
  localStorage.setItem('sbt_budgets', JSON.stringify(budgets));
  localStorage.setItem('sbt_total_budget', totalBudget.toString());
  localStorage.setItem('sbt_budget_period', budgetPeriod);
  localStorage.setItem('sbt_categories', JSON.stringify(CATEGORY_ICONS));
}

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────

/**
 * Format a number as Indian Rupee currency
 * @param {number} n
 * @returns {string}
 */
function fmt(n) {
  return '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Short format for chart axis labels
 */
function fmtShort(n) {
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'k';
  return '₹' + Math.round(n);
}

/**
 * Prevent XSS by escaping HTML special characters
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Show a floating toast notification
 * @param {string} message
 */
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  toast.style.animation = 'none';
  requestAnimationFrame(() => {
    toast.style.animation = '';
    toast.style.animationName = 'toastIn';
  });
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2800);
}
