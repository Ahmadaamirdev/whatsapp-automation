// Al-Haditha Energy WhatsApp System - Application Logic
let currentTab = 'dashboard';
let activePhone = '+923306579717';
let templatesList = [];
let allChats = {};
let allBroadcasts = [];
let pollingInterval = null;
let currentEmployeePage = 1;
let totalEmployeesCount = 0;
let cachedEmployeesAll = [];

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  initIcons();
  setupNavigation();
  loadMetrics();
  loadBroadcasts();
  loadTemplates();
  setupBroadcastStudio();
  setupEmployeesModule();
  loadBroadcastRecipients();
  setupWhatsAppWebMessaging();
  setupTemplateModal();
  setupBroadcastTracker();
  loadTrackerLogs();

  // Bell icon click -> navigate to Messages
  const bell = document.getElementById('notificationBellBtn');
  if (bell) {
    bell.addEventListener('click', () => switchTab('messages'));
  }

  // Periodic polling for incoming messages & metrics every 3 seconds
  pollingInterval = setInterval(() => {
    loadChats(false);
    loadMetrics();
    if (currentTab === 'broadcasts') { loadTrackerLogs(); }
  }, 3000);
});

function initIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Tab navigation handler
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item[data-tab]');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTab = item.getAttribute('data-tab');
      switchTab(targetTab);
      closeMobileSidebar();
    });
  });

  // Mobile sidebar toggle & backdrop
  const toggleBtn = document.getElementById('btnToggleSidebar');
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  window.closeMobileSidebar = function() {
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
  };

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('open');
      if (overlay) overlay.classList.toggle('active', sidebar.classList.contains('open'));
    });
  }

  if (overlay) {
    overlay.addEventListener('click', () => {
      if (window.closeMobileSidebar) window.closeMobileSidebar();
    });
  }

  // URL hash routing
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    if (hash && hash !== currentTab) {
      switchTab(hash);
    }
  });

  // Maintain active module on reload / page refresh
  const urlHash = window.location.hash.replace('#', '');
  const savedTab = localStorage.getItem('active_wa_tab');
  const targetTab = urlHash || savedTab || 'dashboard';
  switchTab(targetTab);
}

function switchTab(tabName) {
  if (!tabName) tabName = 'dashboard';
  currentTab = tabName;
  localStorage.setItem('active_wa_tab', tabName);
  if (window.location.hash !== `#${tabName}`) {
    history.replaceState(null, '', `#${tabName}`);
  }

  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const activeNav = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
  if (activeNav) activeNav.classList.add('active');

  // Hide all tab views
  document.querySelectorAll('.tab-view').forEach(view => view.style.display = 'none');

  // Activate selected tab without injecting redundant top headings
  if (tabName === 'dashboard') {
    document.getElementById('view-dashboard').style.display = 'block';
    loadMetrics();
    loadBroadcasts();
  } else if (tabName === 'broadcasts') {
    document.getElementById('view-broadcasts').style.display = 'block';
    loadBroadcasts();
    loadBroadcastRecipients();
  } else if (tabName === 'employees') {
    document.getElementById('view-employees').style.display = 'block';
    loadEmployeesTable(currentEmployeePage);
  } else if (tabName === 'messages') {
    document.getElementById('view-messages').style.display = 'flex';
    loadChats(true);
  } else if (tabName === 'templates') {
    document.getElementById('view-templates').style.display = 'block';
    loadTemplatesTable();
  }

  if (window.closeMobileSidebar && window.innerWidth <= 768) {
    window.closeMobileSidebar();
  }

  window.location.hash = tabName;
  initIcons();
}

// --- 1. METRICS & KPI UPDATES ---
async function loadMetrics() {
  try {
    const res = await fetch('/api/metrics');
    if (!res.ok) return;
    const data = await res.json();

    const elBc = document.getElementById('metricTotalBroadcasts');
    const elDel = document.getElementById('metricDeliveryRate');
    const elRep = document.getElementById('metricTotalReplies');
    const elConv = document.getElementById('metricTotalConversations');

    if (elBc) elBc.textContent = data.total_broadcasts ?? '0';
    if (elDel) elDel.textContent = data.overall_delivery_rate ?? '98.4%';
    if (elRep) elRep.textContent = data.total_replies ?? '0';
    if (elConv) elConv.textContent = data.total_conversations ?? '0';

    // Synchronize Unread Badges (Bell & Sidebar)
    const unreadCount = data.total_unread || 0;
    const headerBadge = document.getElementById('headerUnreadBadge');
    const sidebarBadge = document.getElementById('sidebarUnreadBadge');

    if (headerBadge) {
      if (unreadCount > 0) {
        headerBadge.style.display = 'flex';
        headerBadge.textContent = unreadCount;
      } else {
        headerBadge.style.display = 'none';
      }
    }
    if (sidebarBadge) {
      if (unreadCount > 0) {
        sidebarBadge.style.display = 'inline-flex';
        sidebarBadge.textContent = unreadCount;
      } else {
        sidebarBadge.style.display = 'none';
      }
    }
  } catch (err) {
    console.error('Error loading metrics:', err);
  }
}

// --- 2. BROADCAST HISTORY & LOGS ---
async function loadBroadcasts() {
  try {
    const res = await fetch('/api/broadcasts');
    if (!res.ok) return;
    const data = await res.json();
    allBroadcasts = data.broadcasts || [];

    renderDashboardBroadcasts(allBroadcasts);
    renderFullBroadcasts(allBroadcasts);
  } catch (err) {
    console.error('Error loading broadcasts:', err);
  }
}

function renderDashboardBroadcasts(list) {
  const tbody = document.getElementById('dashboardBroadcastsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const searchInput = document.getElementById('dashboardSearchBroadcasts');
  const term = searchInput ? searchInput.value.toLowerCase().trim() : '';

  const filtered = list.filter(b => {
    if (!term) return true;
    return (b.template || '').toLowerCase().includes(term) ||
           (b.content || '').toLowerCase().includes(term) ||
           (b.recipient_filter || '').toLowerCase().includes(term);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 24px;">No broadcasts found.</td></tr>`;
    return;
  }

  filtered.slice(0, 6).forEach(bc => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${bc.date || 'Recent'}</td>
      <td style="font-weight: 700; color: #0f172a;">${bc.template || 'Announcement'}</td>
      <td>${Number(bc.recipients_count || 1).toLocaleString()} (${bc.recipient_filter || 'Recipients'})</td>
      <td style="font-weight: 700; color: #00a651;">${bc.delivered_pct || 98.2}%</td>
      <td style="color: #0284c7; font-weight: 600;">${bc.read_pct || 91.5}%</td>
      <td><span class="status-badge active"><span class="badge-dot"></span>${bc.status || 'Completed'}</span></td>
      <td>
        <button class="btn-action-view" onclick="viewBroadcastDetails('${bc.id || ''}')">View</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderFullBroadcasts(list) {
  const tbody = document.getElementById('fullBroadcastsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const searchInput = document.getElementById('broadcastFilterSearch');
  const statusSelect = document.getElementById('broadcastFilterStatus');

  const term = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const statusFilter = statusSelect ? statusSelect.value : 'all';

  const filtered = list.filter(b => {
    const matchesSearch = !term ||
      (b.template || '').toLowerCase().includes(term) ||
      (b.content || '').toLowerCase().includes(term) ||
      (b.id || '').toLowerCase().includes(term);
    const matchesStatus = statusFilter === 'all' || (b.status || '').toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #94a3b8; padding: 24px;">No matching broadcasts found.</td></tr>`;
    return;
  }

  filtered.forEach(bc => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-family: monospace; font-size: 11px; color: #64748b;">${bc.id || 'BC-LIVE'}</td>
      <td>${bc.date || 'Today'}</td>
      <td style="font-weight: 700; color: #0f172a;">${bc.template || 'Announcement'}</td>
      <td>${Number(bc.recipients_count || 1).toLocaleString()} (${bc.recipient_filter || 'All'})</td>
      <td style="font-weight: 700; color: #00a651;">${bc.delivered_pct || 98.2}%</td>
      <td style="color: #0284c7; font-weight: 600;">${bc.read_pct || 91.5}%</td>
      <td style="color: #9333ea; font-weight: 600;">${bc.replies_count || 0}</td>
      <td><span class="status-badge active"><span class="badge-dot"></span>${bc.status || 'Completed'}</span></td>
      <td>
        <button class="btn-action-view" onclick="viewBroadcastDetails('${bc.id || ''}')">View</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.viewBroadcastDetails = function(bcId) {
  const bc = allBroadcasts.find(b => b.id === bcId);
  if (!bc) return;
  alert(`Broadcast: ${bc.template}\n\nContent:\n${bc.content}\n\nRecipients: ${bc.recipients_count}\nDelivery Rate: ${bc.delivered_pct}%\nRead Rate: ${bc.read_pct}%\nStatus: ${bc.status}`);
};

// Filter event listeners
const dSearch = document.getElementById('dashboardSearchBroadcasts');
if (dSearch) dSearch.addEventListener('input', () => renderDashboardBroadcasts(allBroadcasts));

const bSearch = document.getElementById('broadcastFilterSearch');
if (bSearch) bSearch.addEventListener('input', () => renderFullBroadcasts(allBroadcasts));

const bStatus = document.getElementById('broadcastFilterStatus');
if (bStatus) bStatus.addEventListener('change', () => renderFullBroadcasts(allBroadcasts));



// --- 2.5 BROADCAST DELIVERY STATUS TRACKER ---
let trackerFilterDebounceTimer = null;

async function loadTrackerLogs() {
  const tableBody = document.getElementById('trackerTableBody');
  if (!tableBody) return;

  const bcSelect = document.getElementById('trackerBroadcastFilter');
  const dateSelect = document.getElementById('trackerDateFilter');
  const statusSelect = document.getElementById('trackerStatusFilter');
  const searchInput = document.getElementById('trackerSearchInput');

  const bcId = bcSelect ? bcSelect.value : 'all';
  const dateVal = dateSelect ? dateSelect.value : 'all';
  const statusVal = statusSelect ? statusSelect.value : 'all';
  const searchVal = searchInput ? searchInput.value.trim() : '';

  try {
    const params = new URLSearchParams();
    if (bcId && bcId !== 'all') params.append('broadcast_id', bcId);
    if (dateVal && dateVal !== 'all') params.append('date', dateVal);
    if (statusVal && statusVal !== 'all') params.append('status', statusVal);
    if (searchVal) params.append('search', searchVal);

    const res = await fetch(`/api/broadcasts/tracker?${params.toString()}`);
    if (!res.ok) return;
    const data = await res.json();

    // 1. Update Summary KPI Counters
    const kpiTotal = document.getElementById('trackerKpiTotal');
    const kpiDelivered = document.getElementById('trackerKpiDelivered');
    const kpiRead = document.getElementById('trackerKpiRead');
    const kpiReplied = document.getElementById('trackerKpiReplied');
    const kpiFailed = document.getElementById('trackerKpiFailed');

    if (data.summary) {
      if (kpiTotal) kpiTotal.textContent = data.summary.total_sent || 0;
      if (kpiDelivered) kpiDelivered.textContent = data.summary.delivered || 0;
      if (kpiRead) kpiRead.textContent = data.summary.read || 0;
      if (kpiReplied) kpiReplied.textContent = data.summary.replied || 0;
      if (kpiFailed) kpiFailed.textContent = data.summary.failed || 0;
    }

    // 2. Populate Broadcast Filter Dropdown if count changed
    if (bcSelect && data.broadcast_options) {
      const currentSelected = bcSelect.value;
      const existingOptionsCount = bcSelect.options.length - 1;
      if (existingOptionsCount !== data.broadcast_options.length) {
        bcSelect.innerHTML = '<option value="all">All Broadcasts</option>';
        data.broadcast_options.forEach(b => {
          const opt = document.createElement('option');
          opt.value = b.id;
          opt.textContent = `${b.id} • ${b.template} (${b.date})`;
          bcSelect.appendChild(opt);
        });
        bcSelect.value = currentSelected || 'all';
      }
    }

    // 3. Render Recipient Delivery Rows
    const records = data.records || [];
    tableBody.innerHTML = '';

    if (records.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#94a3b8; padding:24px;">No recipient delivery logs match the selected filters.</td></tr>`;
      return;
    }

    records.forEach(r => {
      const tr = document.createElement('tr');
      const st = (r.status || 'sent').toLowerCase();

      let badgeHtml = '';
      if (st === 'delivered') {
        badgeHtml = `<span class="status-pill" style="background:#dcfce7; color:#15803d; font-weight:700;"><span class="badge-dot" style="background:#22c55e;"></span>Delivered ✓✓</span>`;
      } else if (st === 'read' || st === 'seen') {
        badgeHtml = `<span class="status-pill" style="background:#e0f2fe; color:#0369a1; font-weight:700;"><span class="badge-dot" style="background:#0284c7;"></span>Seen ✓✓</span>`;
      } else if (st === 'replied') {
        badgeHtml = `<span class="status-pill" style="background:#f3e8ff; color:#7e22ce; font-weight:700;"><span class="badge-dot" style="background:#9333ea;"></span>Replied 💬</span>`;
      } else if (st === 'failed') {
        badgeHtml = `<span class="status-pill" style="background:#ffe4e6; color:#be123c; font-weight:700;" title="${r.error || 'Meta API delivery failed'}"><span class="badge-dot" style="background:#e11d48;"></span>Failed ⚠️</span>`;
      } else {
        badgeHtml = `<span class="status-pill" style="background:#fef3c7; color:#b45309; font-weight:700;"><span class="badge-dot" style="background:#f59e0b;"></span>Sent ✓</span>`;
      }

      const initial = (r.name || 'E').charAt(0).toUpperCase();

      tr.innerHTML = `
        <td>
          <div style="font-weight:700; color:#0f172a; font-size:12px;">${r.broadcast_id || 'BC'}</div>
          <div style="font-size:11px; color:#64748b;">${r.template || 'Announcement'}</div>
        </td>
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="width:26px; height:26px; border-radius:50%; background:#e2e8f0; color:#334155; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center;">${initial}</div>
            <span style="font-weight:600; color:#1e293b;">${r.name || 'Staff Member'}</span>
          </div>
        </td>
        <td style="font-family:monospace; font-size:12px; color:#334155;">${r.phone || '-'}</td>
        <td><span style="font-size:11px; background:#f1f5f9; padding:3px 8px; border-radius:4px; color:#475569; font-weight:600;">${r.department || 'Operations'}</span></td>
        <td style="font-size:12px; color:#64748b;">${r.time || '12:00 PM'}</td>
        <td>${badgeHtml}</td>
        <td>
          <button class="btn-action-view" onclick="openChatWithEmployee('${r.phone || ''}', '${r.name || ''}')" style="display:inline-flex; align-items:center; gap:4px; font-size:11px; padding:4px 8px; cursor:pointer;">
            <i data-lucide="message-square" style="width:12px; height:12px;"></i>
            <span>Chat</span>
          </button>
        </td>
      `;
      tableBody.appendChild(tr);
    });

    initIcons();
  } catch (err) {
    console.error('Error loading tracker logs:', err);
  }
}

function setupBroadcastTracker() {
  const bcSelect = document.getElementById('trackerBroadcastFilter');
  const dateSelect = document.getElementById('trackerDateFilter');
  const statusSelect = document.getElementById('trackerStatusFilter');
  const searchInput = document.getElementById('trackerSearchInput');
  const refreshBtn = document.getElementById('btnRefreshTracker');

  if (bcSelect) bcSelect.addEventListener('change', () => loadTrackerLogs());
  if (dateSelect) dateSelect.addEventListener('change', () => loadTrackerLogs());
  if (statusSelect) statusSelect.addEventListener('change', () => loadTrackerLogs());

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(trackerFilterDebounceTimer);
      trackerFilterDebounceTimer = setTimeout(() => {
        loadTrackerLogs();
      }, 250);
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadTrackerLogs();
    });
  }
}


// --- 3. BROADCAST STUDIO & LIVE PREVIEW ---
async function loadTemplates() {
  try {
    const res = await fetch('/api/templates');
    if (!res.ok) return;
    const data = await res.json();
    templatesList = data.templates || [];

    const select = document.getElementById('broadcastTemplateSelect');
    if (!select) return;
    select.innerHTML = '';

    templatesList.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.name;
      opt.textContent = `${t.name.replace(/_/g, ' ').toUpperCase()} (${t.status || 'APPROVED'})`;
      select.appendChild(opt);
    });

    updateTemplateVariablesAndPreview();
  } catch (err) {
    console.error('Error loading templates:', err);
  }
}

function setupBroadcastStudio() {
  const select = document.getElementById('broadcastTemplateSelect');
  if (select) {
    select.addEventListener('change', updateTemplateVariablesAndPreview);
  }

  // Recipient pill selection toggles (Simplified: Everyone, By Department, Select Employee)
  const pillAll = document.getElementById('pillAll');
  const pillDept = document.getElementById('pillDept');
  const pillEmployee = document.getElementById('pillEmployee');
  const deptWrap = document.getElementById('deptSelectorWrap');
  const employeeWrap = document.getElementById('employeeSelectorWrap');
  const btnUnselectEmp = document.getElementById('btnUnselectEmployee');
  const btnUnselectDept = document.getElementById('btnUnselectDept');

  window.setRecipientMode = function(mode) {
    [pillAll, pillDept, pillEmployee].forEach(p => p && p.classList.remove('active'));
    if (deptWrap) deptWrap.style.display = 'none';
    if (employeeWrap) employeeWrap.style.display = 'none';

    if (mode === 'department') {
      if (pillDept) pillDept.classList.add('active');
      if (deptWrap) deptWrap.style.display = 'block';
    } else if (mode === 'employee') {
      if (pillEmployee) pillEmployee.classList.add('active');
      if (employeeWrap) employeeWrap.style.display = 'block';
      syncSelectedEmployeeWithTemplate();
    } else {
      // Default: 'all' (Everyone)
      if (pillAll) pillAll.classList.add('active');
      const empSelect = document.getElementById('employeeSelectDropdown');
      if (empSelect) empSelect.value = '';
      resetRecipientVariableToDefault();
    }
  };

  // Toggle selection: clicking an active pill unselects it and returns to Everyone
  if (pillAll) {
    pillAll.addEventListener('click', () => setRecipientMode('all'));
  }
  if (pillDept) {
    pillDept.addEventListener('click', () => {
      if (pillDept.classList.contains('active')) {
        setRecipientMode('all'); // Unselect
      } else {
        setRecipientMode('department');
      }
    });
  }
  if (pillEmployee) {
    pillEmployee.addEventListener('click', () => {
      if (pillEmployee.classList.contains('active')) {
        setRecipientMode('all'); // Unselect
      } else {
        setRecipientMode('employee');
      }
    });
  }

  // Quick Unselect buttons
  if (btnUnselectEmp) {
    btnUnselectEmp.addEventListener('click', () => setRecipientMode('all'));
  }
  if (btnUnselectDept) {
    btnUnselectDept.addEventListener('click', () => setRecipientMode('all'));
  }

  const empSelect = document.getElementById('employeeSelectDropdown');
  if (empSelect) {
    empSelect.addEventListener('change', () => {
      if (!empSelect.value) {
        setRecipientMode('all');
      } else {
        syncSelectedEmployeeWithTemplate();
      }
    });
  }

  // Send Broadcast button
  const sendBtn = document.getElementById('sendBroadcastBtn');
  if (sendBtn) {
    sendBtn.addEventListener('click', handleSendBroadcast);
  }
}

// Reset first parameter (Recipient / Staff Name) when unselecting back to Everyone
function resetRecipientVariableToDefault() {
  const select = document.getElementById('broadcastTemplateSelect');
  const selectedName = select ? select.value : 'staff_official_notice';
  const defaults = {
    staff_official_notice: "Ahmed Raza",
    general_announcement: "Team",
    system_maintenance: "Friday 12:00 AM to 4:00 AM",
    hr_update: "All Staff"
  };
  const defaultVal = defaults[selectedName] || "Staff";
  const firstVarInput = document.querySelector('.var-field[data-tag="{{1}}"]');
  if (firstVarInput) {
    firstVarInput.value = defaultVal;
    renderLivePreview();
  }
}

// Dynamically load and synchronize employees into broadcast recipient selection
async function loadBroadcastRecipients() {
  try {
    const res = await fetch('/api/employees/all');
    if (!res.ok) return;
    const data = await res.json();
    cachedEmployeesAll = data.employees || [];

    // Populate Broadcast Employee Selector with an Unselect / Choose option
    const empSelect = document.getElementById('employeeSelectDropdown');
    if (empSelect) {
      empSelect.innerHTML = '<option value="">-- Choose an Employee (or click Unselect) --</option>';
      cachedEmployeesAll.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.setAttribute('data-name', e.name);
        opt.setAttribute('data-phone', e.phone);
        opt.setAttribute('data-dept', e.department);
        opt.textContent = `${e.name} (${e.phone}) • ${e.department}`;
        empSelect.appendChild(opt);
      });
    }

    // Populate Department Selectors (Broadcast and Directory Filter)
    const depts = data.departments || [];
    const deptSelect = document.getElementById('deptSelectDropdown');
    if (deptSelect && depts.length > 0) {
      deptSelect.innerHTML = '';
      depts.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = `${d} Department`;
        deptSelect.appendChild(opt);
      });
    }

    const empFilterDept = document.getElementById('employeeFilterDept');
    if (empFilterDept && depts.length > 0) {
      const cur = empFilterDept.value;
      empFilterDept.innerHTML = '<option value="All">All Departments</option>';
      depts.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        empFilterDept.appendChild(opt);
      });
      if (cur) empFilterDept.value = cur;
    }
  } catch (err) {
    console.error('Error loading broadcast recipients:', err);
  }
}

function syncSelectedEmployeeWithTemplate() {
  const empSelect = document.getElementById('employeeSelectDropdown');
  if (!empSelect) return;
  const selectedOpt = empSelect.querySelector('option:checked');
  if (!selectedOpt || !empSelect.value) {
    resetRecipientVariableToDefault();
    return;
  }

  const empName = selectedOpt.getAttribute('data-name');
  if (!empName) return;

  // Auto-fill recipient/staff name variable {{1}} with employee's name
  const firstVarInput = document.querySelector('.var-field[data-tag="{{1}}"]');
  if (firstVarInput) {
    firstVarInput.value = empName;
    renderLivePreview();
  }
}

function updateTemplateVariablesAndPreview() {
  const select = document.getElementById('broadcastTemplateSelect');
  if (!select) return;
  const selectedName = select.value;
  const tpl = templatesList.find(t => t.name === selectedName);
  if (!tpl) return;

  const headerComp = (tpl.components || []).find(c => c.type === 'HEADER') || {};
  const bodyComp = (tpl.components || []).find(c => c.type === 'BODY') || {};
  const footerComp = (tpl.components || []).find(c => c.type === 'FOOTER') || {};

  const varContainer = document.getElementById('dynamicVariablesContainer');
  varContainer.innerHTML = '';

  const rawBody = bodyComp.text || "Dear {{1}}, notice: {{2}}. Thank you.";
  const matches = rawBody.match(/\{\{\d+\}\}/g) || [];

  // Descriptive label mappings for known templates
  const variableLabels = {
    staff_official_notice: [
      { label: "Recipient / Staff Name", defaultVal: "Ahmed Raza", placeholder: "e.g. Ahmed Raza" },
      { label: "Announcement Title / Subject", defaultVal: "Office Timings Update", placeholder: "e.g. Office Timings Update" },
      { label: "Official Notice Details", defaultVal: "Thursday working hours will conclude at 2:00 PM.", placeholder: "e.g. Thursday working hours will conclude at 2:00 PM." }
    ],
    general_announcement: [
      { label: "Staff / Team Name", defaultVal: "Team", placeholder: "e.g. Al-Haditha Team" },
      { label: "Announcement Topic", defaultVal: "Safety Standards", placeholder: "e.g. Safety Standards" },
      { label: "Detailed Notice Content", defaultVal: "All site engineers must follow PPE guidelines.", placeholder: "Enter notice body..." }
    ],
    system_maintenance: [
      { label: "Scheduled Maintenance Window", defaultVal: "Friday 12:00 AM to 4:00 AM", placeholder: "e.g. Friday 12:00 AM" }
    ],
    hr_update: [
      { label: "Target Department", defaultVal: "All Staff", placeholder: "e.g. All Staff" },
      { label: "HR Update Details", defaultVal: "Medical insurance policy cards have been renewed.", placeholder: "e.g. Insurance cards renewed" }
    ]
  };

  const templateSpecific = (tpl.variable_definitions && tpl.variable_definitions.length > 0)
    ? tpl.variable_definitions.map((v, i) => ({
        label: v.label || `Parameter ${v.index || i + 1}`,
        defaultVal: v.example || `Value ${i + 1}`,
        placeholder: `e.g. ${v.example || v.label || 'Value'}`
      }))
    : (variableLabels[selectedName] || []);

  if (matches.length > 0) {
    matches.forEach((m, idx) => {
      const config = templateSpecific[idx] || {
        label: `Announcement Parameter ${idx + 1}`,
        defaultVal: `Value ${idx + 1}`,
        placeholder: `Enter parameter ${idx + 1}`
      };

      const card = document.createElement('div');
      card.className = 'var-input-card';
      card.innerHTML = `
        <label>
          <span>${config.label}</span>
          <span class="var-tag">${m}</span>
        </label>
        <input type="text" class="form-input var-field" data-tag="${m}" value="${config.defaultVal}" placeholder="${config.placeholder}">
      `;
      varContainer.appendChild(card);
    });
  } else {
    varContainer.innerHTML = `<p style="font-size: 12px; color: #64748b;">This template does not require dynamic variables.</p>`;
  }

  // Bind live preview listeners
  const varInputs = varContainer.querySelectorAll('.var-field');
  varInputs.forEach(input => {
    input.addEventListener('input', renderLivePreview);
  });

  renderLivePreview();
}

function renderLivePreview() {
  const select = document.getElementById('broadcastTemplateSelect');
  if (!select) return;
  const selectedName = select.value;
  const tpl = templatesList.find(t => t.name === selectedName);
  if (!tpl) return;

  const headerComp = (tpl.components || []).find(c => c.type === 'HEADER') || {};
  const bodyComp = (tpl.components || []).find(c => c.type === 'BODY') || {};
  const footerComp = (tpl.components || []).find(c => c.type === 'FOOTER') || {};

  const previewHeader = document.getElementById('previewHeader');
  const previewBody = document.getElementById('previewBodyText');
  const previewFooter = document.getElementById('previewFooter');
  const previewTime = document.getElementById('previewTimestamp');

  if (previewHeader) {
    previewHeader.textContent = headerComp.text || 'Al-Haditha Energy Official Notice';
    previewHeader.style.display = headerComp.text ? 'block' : 'none';
  }

  if (previewFooter) {
    previewFooter.textContent = footerComp.text || 'Al-Haditha Energy Management';
    previewFooter.style.display = footerComp.text ? 'block' : 'none';
  }

  if (previewTime) {
    const now = new Date();
    previewTime.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Build body with highlighted values
  let text = bodyComp.text || "";
  const varInputs = document.querySelectorAll('.var-field');
  const values = [];

  varInputs.forEach(input => {
    const tag = input.getAttribute('data-tag');
    const val = input.value || `[${tag}]`;
    values.push(val);
    text = text.split(tag).join(`<span class="var-highlight">${val}</span>`);
  });

  if (previewBody) {
    previewBody.innerHTML = text.replace(/\n/g, '<br>');
  }

  // Update hidden preview
  const hiddenPreview = document.getElementById('broadcastContentPreview');
  if (hiddenPreview) {
    hiddenPreview.value = previewBody ? previewBody.innerText : text;
  }
}

async function handleSendBroadcast() {
  const select = document.getElementById('broadcastTemplateSelect');
  const selectedTemplate = select.value;

  const activePill = document.querySelector('.recipient-pill.active input');
  const recipientType = activePill ? activePill.value : 'all';

  let filterValue = null;
  let testNumber = null;
  let targetDisplay = 'Everyone';

  if (recipientType === 'department') {
    filterValue = document.getElementById('deptSelectDropdown').value;
    targetDisplay = `Department: ${filterValue}`;
  } else if (recipientType === 'employee') {
    const empSelect = document.getElementById('employeeSelectDropdown');
    filterValue = empSelect ? empSelect.value : null;
    if (!filterValue) {
      alert('Please choose an employee from the dropdown or click Unselect.');
      return;
    }
    const selectedOpt = empSelect ? empSelect.querySelector('option:checked') : null;
    const empName = selectedOpt ? selectedOpt.getAttribute('data-name') : 'Selected Employee';
    const empPhone = selectedOpt ? selectedOpt.getAttribute('data-phone') : null;
    testNumber = empPhone;
    targetDisplay = `${empName} (${empPhone})`;
  } else {
    // Everyone
    targetDisplay = 'Everyone (All Staff)';
  }

  const varInputs = document.querySelectorAll('.var-field');
  const variables = Array.from(varInputs).map(inp => inp.value);

  const previewEl = document.getElementById('broadcastContentPreview');
  const bodyText = previewEl ? previewEl.value : '';

  const sendBtn = document.getElementById('sendBroadcastBtn');
  const originalText = sendBtn.innerHTML;
  sendBtn.disabled = true;
  sendBtn.innerHTML = `<span>Dispatching to Meta API...</span>`;

  try {
    const res = await fetch('/api/broadcasts/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_name: selectedTemplate,
        template_language: 'en_US',
        body_text: bodyText,
        variables: variables,
        recipient_type: recipientType,
        recipient_filter_value: filterValue,
        test_number: testNumber
      })
    });

    const data = await res.json();
    if (res.ok) {
      const confirmed = confirm(`Broadcast Dispatched Successfully!\n\nTarget: ${targetDisplay}\nTemplate: ${selectedTemplate}\nStatus: Delivered via Meta Cloud API.\n\nWould you like to open live chat with this recipient now?`);
      if (confirmed && testNumber) {
        openChatWithEmployee(testNumber, targetDisplay.split(' (')[0]);
      }
      loadBroadcasts();
      loadMetrics();
      loadTrackerLogs();
    } else {
      alert(`Meta Broadcast Error: ${data.message || JSON.stringify(data)}`);
    }
  } catch (err) {
    alert(`Dispatch Error: ${err.message}`);
  } finally {
    sendBtn.disabled = false;
    sendBtn.innerHTML = originalText;
    initIcons();
  }
}


// --- 4. WHATSAPP WEB-STYLE LIVE MESSAGING ---
async function loadChats(forceRerender = false) {
  try {
    const res = await fetch('/api/chats');
    if (!res.ok) return;
    const data = await res.json();
    const chatsList = data.chats || [];

    renderConversationsList(chatsList);

    // If active phone is selected, reload that conversation
    if (activePhone) {
      loadActiveChat(activePhone, forceRerender);
    } else if (chatsList.length > 0) {
      activePhone = chatsList[0].phone;
      loadActiveChat(activePhone, true);
    } else {
      const msgArea = document.getElementById('waMessagesArea');
      if (msgArea) {
        msgArea.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #64748b; text-align: center; padding: 24px;">
            <div style="width: 52px; height: 52px; border-radius: 50%; background: #f1f5f9; display: flex; align-items: center; justify-content: center; margin-bottom: 14px; color: #00a651;">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            </div>
            <h4 style="font-size: 16px; font-weight: 600; color: #1e293b; margin-bottom: 6px;">No conversations yet</h4>
            <p style="font-size: 13px; max-width: 320px; line-height: 1.5; color: #64748b; margin-bottom: 16px;">
              When an employee sends a WhatsApp message or you start a new conversation, it will appear here in real time.
            </p>
            <button type="button" class="btn btn-primary" onclick="const b=document.getElementById('btnNewChatPrompt'); if(b) b.click();" style="display: inline-flex; align-items: center; gap: 8px; font-size: 13px; padding: 8px 16px;">
              + Start New Chat
            </button>
          </div>
        `;
      }
    }
  } catch (err) {
    console.error('Error loading chats:', err);
  }
}

// --- Helper: Format Time in Local / Pakistan Timezone ---
function formatLocalTime(timeStr, isoTimestamp) {
  if (isoTimestamp) {
    try {
      const d = new Date(isoTimestamp);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      }
    } catch (e) {}
  }
  return timeStr || '';
}

function renderConversationsList(chats) {
  const container = document.getElementById('waConversationsList');
  if (!container) return;

  const searchInput = document.getElementById('waChatSearchInput');
  const term = searchInput ? searchInput.value.toLowerCase().trim() : '';

  const filtered = chats.filter(c => {
    if (!term) return true;
    return (c.name || '').toLowerCase().includes(term) ||
           (c.phone || '').includes(term) ||
           (c.last_message || '').toLowerCase().includes(term);
  });

  container.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: #94a3b8; font-size: 13px; padding: 24px;">No chats found.</div>`;
    return;
  }

  filtered.forEach(chat => {
    const row = document.createElement('div');
    row.className = `wa-chat-row ${chat.phone === activePhone ? 'active' : ''}`;
    
    // Initials
    const initials = (chat.name || 'Staff')
      .split(' ')
      .map(n => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

    row.innerHTML = `
      <div class="wa-avatar">${initials}</div>
      <div class="wa-chat-row-info">
        <div class="wa-row-header">
          <span class="wa-row-name">${chat.name || chat.phone}</span>
          <span class="wa-row-time">${formatLocalTime(chat.last_activity, chat.last_timestamp)}</span>
        </div>
        <div class="wa-row-sub">
          <span class="wa-row-msg">${chat.last_message || chat.role || 'WhatsApp conversation'}</span>
          ${chat.unread_count > 0 ? `<span class="wa-unread-badge">${chat.unread_count}</span>` : ''}
        </div>
      </div>
    `;

    row.addEventListener('click', () => {
      activePhone = chat.phone;
      document.querySelectorAll('.wa-chat-row').forEach(r => r.classList.remove('active'));
      row.classList.add('active');
      loadActiveChat(chat.phone, true);
    });

    container.appendChild(row);
  });
}

async function loadActiveChat(phone, scrollBottom = false) {
  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(phone)}`);
    if (!res.ok) return;
    const chat = await res.json();

    const nameEl = document.getElementById('activeChatName');
    const phoneEl = document.getElementById('activeChatPhone');
    const avatarEl = document.getElementById('activeChatAvatar');
    const msgArea = document.getElementById('waMessagesArea');

    if (nameEl) nameEl.textContent = chat.name || phone;
    if (phoneEl) phoneEl.textContent = `${phone} • ${chat.role || 'Active on WhatsApp'}`;
    
    if (avatarEl) {
      const initials = (chat.name || 'WA').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      avatarEl.textContent = initials;
    }

    if (!msgArea) return;

    // Check if message count changed before full innerHTML rewrite to preserve scroll position
    const msgs = chat.messages || [];
    const currentCount = msgArea.children.length;

    if (currentCount !== msgs.length || scrollBottom) {
      msgArea.innerHTML = '';

      if (msgs.length === 0) {
        msgArea.innerHTML = `<div style="text-align: center; color: #64748b; font-size: 13px; margin: auto;">No messages in this conversation yet. Send a message below to start chatting.</div>`;
      } else {
        msgs.forEach(m => {
          const isOut = m.direction === 'outgoing';
          const bubble = document.createElement('div');
          bubble.className = `wa-bubble ${isOut ? 'outgoing' : 'incoming'}`;
          bubble.innerHTML = `
            <div>${m.text.replace(/\n/g, '<br>')}</div>
            <div class="wa-msg-meta">
              <span>${formatLocalTime(m.time, m.timestamp)}</span>
              ${isOut ? '<span class="wa-ticks">✓✓</span>' : ''}
            </div>
          `;
          msgArea.appendChild(bubble);
        });

        // Auto scroll to bottom
        msgArea.scrollTop = msgArea.scrollHeight;
      }
    }
  } catch (err) {
    console.error('Error loading active chat:', err);
  }
}

function setupWhatsAppWebMessaging() {
  const searchInput = document.getElementById('waChatSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => loadChats(false));
  }

  // New Chat Prompt
  const newChatBtn = document.getElementById('btnNewChatPrompt');
  if (newChatBtn) {
    newChatBtn.addEventListener('click', () => {
      const number = prompt('Enter WhatsApp phone number with country code (e.g. +923306579717):', '+92');
      if (number && number.length > 5) {
        activePhone = number.trim();
        loadActiveChat(activePhone, true);
        loadChats(true);
      }
    });
  }

  // Send message on click
  const sendBtn = document.getElementById('waChatSendBtn');
  const input = document.getElementById('waChatMessageInput');

  async function sendMessage() {
    if (!input) return;
    const text = input.value.trim();
    if (!text || !activePhone) return;

    input.value = '';

    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(activePhone)}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text })
      });

      if (res.ok) {
        loadActiveChat(activePhone, true);
        loadChats(false);
      }
    } catch (err) {
      console.error('Error sending chat message:', err);
    }
  }

  if (sendBtn) sendBtn.addEventListener('click', sendMessage);

  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
      }
    });
  }
}


// --- 5. META TEMPLATES TABLE & MODAL ---
async function loadTemplatesTable() {
  try {
    const res = await fetch('/api/templates');
    if (!res.ok) return;
    const data = await res.json();
    const tbody = document.getElementById('templatesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    (data.templates || []).forEach(tpl => {
      const tr = document.createElement('tr');
      const bodyComp = (tpl.components || []).find(c => c.type === 'BODY') || {};
      const matches = (bodyComp.text || '').match(/\{\{\d+\}\}/g) || [];

      tr.innerHTML = `
        <td style="font-weight: 700; color: #0f172a;">${tpl.name}</td>
        <td><span style="font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 4px; font-weight: 700;">${tpl.category}</span></td>
        <td>${tpl.language}</td>
        <td><span class="status-badge active"><span class="badge-dot"></span>${tpl.status || 'APPROVED'}</span></td>
        <td style="font-weight: 600; color: #00a651;">${matches.length} Variables</td>
        <td style="font-size: 12px; color: #475569; max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${bodyComp.text || ''}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error loading templates table:', err);
  }
}

function setupTemplateModal() {
  const modal = document.getElementById('newTemplateModal');
  const btnOpen = document.getElementById('btnOpenNewTemplateModal');
  const btnClose = document.getElementById('btnCloseModal');
  const btnCancel = document.getElementById('btnCancelModal');
  const btnSubmit = document.getElementById('btnSubmitTemplateToMeta');
  const nameInput = document.getElementById('tplNameInput');
  const namePreview = document.getElementById('tplMetaNamePreview');
  const bodyInput = document.getElementById('tplBodyInput');
  const varsContainer = document.getElementById('tplDefinedVarsContainer');
  const varsBadge = document.getElementById('tplVarsCountBadge');
  const previewText = document.getElementById('tplLivePreviewText');
  const btnAddVar = document.getElementById('btnAddVariableBtn');

  // Automatic Name Formatter helper
  function formatMetaTemplateName(raw) {
    if (!raw) return '';
    return raw
      .toLowerCase()
      .trim()
      .replace(/[\s\-]+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  // Live Auto-formatting of Template Name
  if (nameInput) {
    nameInput.addEventListener('input', () => {
      const clean = formatMetaTemplateName(nameInput.value);
      if (namePreview) {
        if (clean) {
          namePreview.textContent = `Meta ID: ${clean}`;
          namePreview.style.display = 'inline-block';
        } else {
          namePreview.style.display = 'none';
        }
      }
    });
  }

  // Local state holding variable labels & pre-configured automatic Meta sample values
  let definedVarsState = {};

  const defaultVarConfigs = [
    { label: "Recipient / Staff Name", example: "Ahmed Raza" },
    { label: "Announcement Topic", example: "Office Timings Update" },
    { label: "Notice Details", example: "Thursday working hours will conclude at 2:00 PM." },
    { label: "Date / Time", example: "Thursday at 10:00 AM" },
    { label: "Department / Location", example: "Operations Head Office" }
  ];

  function getDetectedVariables() {
    if (!bodyInput) return [];
    const text = bodyInput.value || '';
    const regex = /\{\{(\d+)\}\}/g;
    const found = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      const num = parseInt(match[1], 10);
      if (!found.includes(num)) {
        found.push(num);
      }
    }
    return found.sort((a, b) => a - b);
  }

  function updateLivePreview() {
    if (!previewText || !bodyInput) return;
    let text = bodyInput.value || '';
    if (!text.trim()) {
      previewText.innerHTML = '<span style="color: #94a3b8; font-style: italic;">Enter body text to preview message...</span>';
      return;
    }

    const detected = getDetectedVariables();
    detected.forEach(num => {
      const cur = definedVarsState[num] || {};
      const exVal = cur.example || (defaultVarConfigs[num - 1] ? defaultVarConfigs[num - 1].example : `Sample ${num}`);
      const regex = new RegExp(`\\{\\{${num}\\}\\}`, 'g');
      text = text.replace(regex, `<span style="background: #fef08a; color: #854d0e; padding: 1px 4px; border-radius: 3px; font-weight: 600;">${exVal}</span>`);
    });

    previewText.innerHTML = text;
  }

  function renderDefinedVariables() {
    if (!varsContainer) return;
    const detected = getDetectedVariables();

    if (varsBadge) {
      varsBadge.textContent = `${detected.length} Variable${detected.length === 1 ? '' : 's'}`;
    }

    if (detected.length === 0) {
      varsContainer.innerHTML = `
        <div style="font-size: 12px; color: #64748b; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 10px; text-align: center;">
          No dynamic variables in text. (Standard plain text templates require zero variables and are approved instantly!)
        </div>
      `;
      updateLivePreview();
      return;
    }

    varsContainer.innerHTML = '';

    detected.forEach((num, idx) => {
      const fallback = defaultVarConfigs[idx] || { label: `Parameter ${num}`, example: `Sample Value ${num}` };
      if (!definedVarsState[num]) {
        definedVarsState[num] = {
          label: fallback.label,
          example: fallback.example
        };
      }

      const cur = definedVarsState[num];
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; gap: 10px; align-items: center; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px;';

      row.innerHTML = `
        <div style="background: #ecfdf5; border: 1px solid #a7f3d0; color: #008c44; font-family: monospace; font-size: 12px; font-weight: 800; padding: 4px 8px; border-radius: 6px; white-space: nowrap;">
          {{${num}}}
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 2px;">
          <label style="font-size: 10px; font-weight: 700; color: #64748b;">Variable Purpose / Label</label>
          <input type="text" class="form-input var-label-field" data-num="${num}" value="${cur.label || fallback.label}" placeholder="e.g. Staff Name" style="font-size: 12px; padding: 5px 8px;">
        </div>
        <div style="flex: 1.2; display: flex; flex-direction: column; gap: 2px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <label style="font-size: 10px; font-weight: 700; color: #64748b;">Meta Approval Sample</label>
            <span style="font-size: 10px; color: #059669; font-weight: 600;">✓ Auto-configured</span>
          </div>
          <input type="text" class="form-input var-example-field" data-num="${num}" value="${cur.example || fallback.example}" placeholder="e.g. Ahmed Raza" style="font-size: 12px; padding: 5px 8px; background: #f8fafc;">
        </div>
      `;

      varsContainer.appendChild(row);
    });

    varsContainer.querySelectorAll('.var-label-field').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const num = e.target.getAttribute('data-num');
        if (definedVarsState[num]) {
          definedVarsState[num].label = e.target.value;
        }
      });
    });

    varsContainer.querySelectorAll('.var-example-field').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const num = e.target.getAttribute('data-num');
        if (definedVarsState[num]) {
          definedVarsState[num].example = e.target.value;
        }
        updateLivePreview();
      });
    });

    updateLivePreview();
    initIcons();
  }

  function insertPlaceholderAtCursor(tag, defaultLabel, defaultExample) {
    if (!bodyInput) return;
    const start = bodyInput.selectionStart || bodyInput.value.length;
    const end = bodyInput.selectionEnd || bodyInput.value.length;
    const val = bodyInput.value;

    bodyInput.value = val.substring(0, start) + tag + val.substring(end);
    bodyInput.focus();
    bodyInput.setSelectionRange(start + tag.length, start + tag.length);

    const match = tag.match(/\{\{(\d+)\}\}/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!definedVarsState[num] || defaultLabel) {
        definedVarsState[num] = {
          label: defaultLabel || `Parameter ${num}`,
          example: defaultExample || `Sample Value ${num}`
        };
      }
    }

    renderDefinedVariables();
  }

  document.querySelectorAll('.tpl-quick-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const label = chip.getAttribute('data-name');
      const example = chip.getAttribute('data-example');
      const detected = getDetectedVariables();
      const nextNum = detected.length > 0 ? Math.max(...detected) + 1 : 1;
      insertPlaceholderAtCursor(`{{${nextNum}}}`, label, example);
    });
  });

  if (btnAddVar) {
    btnAddVar.addEventListener('click', () => {
      const detected = getDetectedVariables();
      const nextNum = detected.length > 0 ? Math.max(...detected) + 1 : 1;
      insertPlaceholderAtCursor(`{{${nextNum}}}`);
    });
  }

  if (bodyInput) {
    bodyInput.addEventListener('input', () => {
      renderDefinedVariables();
    });
  }

  if (btnOpen) {
    btnOpen.addEventListener('click', () => {
      modal.style.display = 'flex';
      renderDefinedVariables();
    });
  }
  if (btnClose) btnClose.addEventListener('click', () => modal.style.display = 'none');
  if (btnCancel) btnCancel.addEventListener('click', () => modal.style.display = 'none');

  if (btnSubmit) {
    btnSubmit.addEventListener('click', async () => {
      const rawName = nameInput ? nameInput.value.trim() : '';
      const cat = document.getElementById('tplCategorySelect').value;
      const lang = document.getElementById('tplLangSelect').value;
      const header = document.getElementById('tplHeaderInput').value.trim();
      const body = bodyInput ? bodyInput.value.trim() : '';
      const footer = document.getElementById('tplFooterInput').value.trim();

      if (!rawName || !body) {
        alert('Please enter a Template Name and Body text.');
        return;
      }

      // Automatic Name Formatter: Convert 'Staff Timing Update 2026' into 'staff_timing_update_2026'
      const cleanName = formatMetaTemplateName(rawName) || `template_${Date.now()}`;

      // Automatic Sample Values: Gather or supply default Meta approval samples
      const detected = getDetectedVariables();
      const variableDefs = [];
      const examples = [];

      for (let i = 0; i < detected.length; i++) {
        const num = detected[i];
        const cur = definedVarsState[num] || {};
        const fallback = defaultVarConfigs[i] || { label: `Parameter ${num}`, example: `Sample Value ${num}` };
        
        const label = cur.label || fallback.label;
        const ex = (cur.example && cur.example.trim()) ? cur.example.trim() : fallback.example;

        variableDefs.push({
          index: num,
          label: label,
          example: ex
        });
        examples.push(ex);
      }

      btnSubmit.disabled = true;
      btnSubmit.textContent = 'Submitting to Meta...';

      try {
        const res = await fetch('/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: cleanName,
            category: cat,
            language: lang,
            header_text: header || null,
            body_text: body,
            footer_text: footer || null,
            example_variables: examples,
            variable_definitions: variableDefs
          })
        });

        const data = await res.json();
        if (data.success) {
          alert(`Template "${cleanName}" submitted to Meta successfully! Approval usually takes 1-5 minutes.`);
          modal.style.display = 'none';
          loadTemplates();
          loadTemplatesTable();
        } else {
          alert(`Meta Submission Error: ${data.message || JSON.stringify(data.error)}`);
        }
      } catch (err) {
        alert(`Error: ${err.message}`);
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Submit to Meta';
      }
    });
  }
}


// --- 6. EMPLOYEE DIRECTORY & SYNC ---
function setupEmployeesModule() {
  const searchInput = document.getElementById('employeeSearchInput');
  const deptSelect = document.getElementById('employeeFilterDept');
  const btnPrev = document.getElementById('btnPrevPageEmployees');
  const btnNext = document.getElementById('btnNextPageEmployees');

  let debounceTimer = null;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        currentEmployeePage = 1;
        loadEmployeesTable(1);
      }, 300);
    });
  }

  if (deptSelect) {
    deptSelect.addEventListener('change', () => {
      currentEmployeePage = 1;
      loadEmployeesTable(1);
    });
  }

  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (currentEmployeePage > 1) {
        currentEmployeePage--;
        loadEmployeesTable(currentEmployeePage);
      }
    });
  }

  if (btnNext) {
    btnNext.addEventListener('click', () => {
      const maxPages = Math.ceil(totalEmployeesCount / 50) || 1;
      if (currentEmployeePage < maxPages) {
        currentEmployeePage++;
        loadEmployeesTable(currentEmployeePage);
      }
    });
  }

  // Add Employee Modal
  const modal = document.getElementById('addEmployeeModal');
  const btnOpen = document.getElementById('btnOpenAddEmployeeModal');
  const btnClose = document.getElementById('btnCloseAddEmpModal');
  const btnCancel = document.getElementById('btnCancelAddEmp');
  const btnSave = document.getElementById('btnSaveNewEmployee');

  if (btnOpen) btnOpen.addEventListener('click', () => {
    document.getElementById('addEmpName').value = '';
    document.getElementById('addEmpPhone').value = '';
    document.getElementById('addEmpDesignation').value = 'Staff';
    modal.style.display = 'flex';
  });

  if (btnClose) btnClose.addEventListener('click', () => modal.style.display = 'none');
  if (btnCancel) btnCancel.addEventListener('click', () => modal.style.display = 'none');

  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      const name = document.getElementById('addEmpName').value.trim();
      const phone = document.getElementById('addEmpPhone').value.trim();
      const dept = document.getElementById('addEmpDept').value;
      const desig = document.getElementById('addEmpDesignation').value.trim();

      if (!name || !phone || !dept) {
        alert('Please fill out Name, WhatsApp Phone Number, and Department.');
        return;
      }

      btnSave.disabled = true;
      btnSave.innerHTML = '<span>Saving Employee...</span>';

      try {
        const res = await fetch('/api/employees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name,
            phone: phone,
            department: dept,
            designation: desig || 'Staff',
            location: 'Muscat HQ'
          })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          modal.style.display = 'none';
          alert(`Employee "${name}" has been added and synced with WhatsApp Broadcasts!`);
          currentEmployeePage = 1;
          loadEmployeesTable(1);
          loadBroadcastRecipients();
        } else {
          alert(`Error saving employee: ${data.detail || data.message || 'Check inputs'}`);
        }
      } catch (err) {
        alert(`Error: ${err.message}`);
      } finally {
        btnSave.disabled = false;
        btnSave.innerHTML = '<i data-lucide="check" style="width: 14px; height: 14px;"></i><span>Save Employee</span>';
        initIcons();
      }
    });
  }
}

async function loadEmployeesTable(page = 1) {
  try {
    const searchInput = document.getElementById('employeeSearchInput');
    const deptSelect = document.getElementById('employeeFilterDept');
    const tbody = document.getElementById('employeesTableBody');
    const pageInfo = document.getElementById('employeePaginationInfo');
    const pageCurrent = document.getElementById('employeePageCurrent');
    const btnPrev = document.getElementById('btnPrevPageEmployees');
    const btnNext = document.getElementById('btnNextPageEmployees');

    const search = searchInput ? encodeURIComponent(searchInput.value.trim()) : '';
    const dept = deptSelect ? encodeURIComponent(deptSelect.value) : 'All';

    let url = `/api/employees?page=${page}&limit=50`;
    if (dept && dept !== 'All') url += `&department=${dept}`;
    if (search) url += `&search=${search}`;

    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();

    totalEmployeesCount = data.total || 0;
    currentEmployeePage = data.page || page;
    const limit = data.limit || 50;
    const maxPages = Math.ceil(totalEmployeesCount / limit) || 1;

    if (pageInfo) {
      const start = totalEmployeesCount === 0 ? 0 : (currentEmployeePage - 1) * limit + 1;
      const end = Math.min(currentEmployeePage * limit, totalEmployeesCount);
      pageInfo.textContent = `Showing ${start} to ${end} of ${totalEmployeesCount.toLocaleString()} employees`;
    }

    if (pageCurrent) {
      pageCurrent.textContent = `Page ${currentEmployeePage} of ${maxPages}`;
    }

    if (btnPrev) btnPrev.disabled = currentEmployeePage <= 1;
    if (btnNext) btnNext.disabled = currentEmployeePage >= maxPages;

    if (!tbody) return;
    tbody.innerHTML = '';

    const list = data.employees || [];
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 28px;">No matching employees found.</td></tr>`;
      return;
    }

    list.forEach(emp => {
      const tr = document.createElement('tr');
      const isFromMessages = (emp.id || '').includes('MSG');
      tr.innerHTML = `
        <td style="font-family: monospace; font-size: 11px; font-weight: 600; color: #475569;">
          ${emp.id}
          ${isFromMessages ? '<span style="margin-left: 4px; font-size: 9px; background: #dcfce7; color: #047857; padding: 1px 4px; border-radius: 3px; font-weight: 700;">LIVE CHAT</span>' : ''}
        </td>
        <td style="font-weight: 700; color: #0f172a;">${emp.name}</td>
        <td style="color: #00a651; font-weight: 600; font-family: monospace; font-size: 12px;">${emp.phone}</td>
        <td><span style="font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 4px; font-weight: 700;">${emp.department || 'General'}</span></td>
        <td style="color: #64748b; font-size: 12px;">${emp.designation || 'Staff'}</td>
        <td style="color: #64748b; font-size: 12px;">${emp.location || 'Muscat HQ'}</td>
        <td><span class="status-badge active"><span class="badge-dot"></span>Active</span></td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button type="button" class="btn-action-view" onclick="selectEmployeeForBroadcast('${emp.id}')" title="Send WhatsApp broadcast announcement to this employee" style="padding: 4px 8px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;">
              <i data-lucide="megaphone" style="width: 12px; height: 12px;"></i>
              <span>Broadcast</span>
            </button>
            <button type="button" class="btn-action-view" onclick="openChatWithEmployee('${emp.phone}', '${emp.name.replace(/'/g, "\\'")}')" title="Open 1-on-1 WhatsApp chat with this employee" style="padding: 4px 8px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;">
              <i data-lucide="message-square" style="width: 12px; height: 12px;"></i>
              <span>Chat</span>
            </button>
            <button type="button" class="btn-action-view" onclick="deleteEmployee('${emp.id}', '${emp.name.replace(/'/g, "\\'")}')" title="Delete employee" style="padding: 4px 8px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px; color: #ef4444; border-color: #fecaca; background: #fff5f5;">
              <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
              <span>Delete</span>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    initIcons();
  } catch (err) {
    console.error('Error loading employees table:', err);
  }
}

// Global helper: Select an employee and sync them into Broadcast Studio
window.selectEmployeeForBroadcast = async function(empId) {
  switchTab('broadcasts');
  if (window.setRecipientMode) {
    window.setRecipientMode('employee');
  }

  // Ensure dropdown is loaded
  await loadBroadcastRecipients();

  const empSelect = document.getElementById('employeeSelectDropdown');
  if (empSelect) {
    empSelect.value = empId;
    syncSelectedEmployeeWithTemplate();
  }
};

// Global helper: Open live chat with an employee
window.openChatWithEmployee = function(phone, name) {
  if (!phone) return;
  activePhone = phone;
  switchTab('messages');
  loadActiveChat(phone, true);
  loadChats(true);
};

// Global helper: Delete an employee
window.deleteEmployee = async function(empId, empName) {
  if (!empId) return;
  const confirmed = confirm(`Are you sure you want to delete employee "${empName || empId}"?`);
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/employees/${encodeURIComponent(empId)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (res.ok && data.success) {
      alert(`Employee "${empName || empId}" deleted successfully.`);
      loadEmployeesTable(currentEmployeePage);
      loadBroadcastRecipients();
    } else {
      alert(`Error deleting employee: ${data.message || data.detail || 'Could not delete'}`);
    }
  } catch (err) {
    alert(`Delete Error: ${err.message}`);
  }
};
