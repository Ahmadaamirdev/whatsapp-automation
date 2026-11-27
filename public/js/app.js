// Al-Haditha Energy WhatsApp System - Application Logic
let currentTab = 'dashboard';
let activePhone = null;
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

  // Collapse sidebar to show symbols only when in message chat
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    if (tabName === 'messages') {
      sidebar.classList.add('collapsed');
    } else {
      sidebar.classList.remove('collapsed');
    }
  }

  // Hide all tab views
  document.querySelectorAll('.tab-view').forEach(view => view.style.display = 'none');

  const topHeader = document.getElementById('mainTopHeader') || document.querySelector('.top-header');
  const welcomeBlock = document.getElementById('dashboardWelcomeBlock');
  const notifBlock = document.getElementById('headerNotificationBlock');

  if (tabName === 'dashboard') {
    document.getElementById('view-dashboard').style.display = 'block';
    // Restore welcome text and notification symbol on Dashboard
    if (topHeader) topHeader.style.display = 'flex';
    if (welcomeBlock) welcomeBlock.style.display = 'block';
    if (notifBlock) notifBlock.style.display = 'flex';
    loadMetrics();
    loadBroadcasts();
  } else {
    // Hide notifications symbol on all other modules
    if (notifBlock) notifBlock.style.display = 'none';
    if (welcomeBlock) welcomeBlock.style.display = 'none';

    // On other modules, hide top-header so top cards align right at the top
    if (topHeader) {
      if (window.innerWidth > 768) {
        topHeader.style.display = 'none';
      } else {
        topHeader.style.display = 'flex';
      }
    }

    if (tabName === 'broadcasts') {
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
      <td style="font-weight: 700; color: ${(bc.delivered_pct ?? 100) > 0 ? '#00a651' : '#dc2626'};">${bc.delivered_pct !== undefined && bc.delivered_pct !== null ? bc.delivered_pct : 0}%</td>
      <td style="color: #0284c7; font-weight: 600;">${bc.read_pct || 91.5}%</td>
      <td><span class="status-badge active"><span class="badge-dot"></span>${bc.status || 'Completed'}</span></td>
      <td>
        <button type="button" class="btn-action-view" onclick="viewBroadcastDetails('${bc.id || ''}')" title="View Detailed Delivery Logs & Failure Reasons" style="display: inline-flex; align-items: center; gap: 5px; font-weight: 700; color: #0284c7; border-color: #bae6fd; background: #f0f9ff;">
          <i data-lucide="eye" style="width: 13px; height: 13px;"></i>
          <span>View Log</span>
        </button>
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
        <button type="button" class="btn-action-view" onclick="viewBroadcastDetails('${bc.id || ''}')" title="View Detailed Delivery Logs & Failure Reasons" style="display: inline-flex; align-items: center; gap: 5px; font-weight: 700; color: #0284c7; border-color: #bae6fd; background: #f0f9ff;">
          <i data-lucide="eye" style="width: 13px; height: 13px;"></i>
          <span>View Log</span>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.viewBroadcastDetails = async function(bcId) {
  let bc = allBroadcasts.find(b => b.id === bcId);
  try {
    const res = await fetch(`/api/broadcasts/${encodeURIComponent(bcId)}/details`);
    if (res.ok) {
      bc = await res.json();
    }
  } catch (e) {
    console.error('Error fetching broadcast details:', e);
  }

  if (!bc) return;

  const modal = document.getElementById('broadcastDetailModal');
  if (!modal) return;

  document.getElementById('modalDetailTitle').textContent = `Broadcast Report: ${bc.template || bc.template_name || 'Announcement'}`;
  document.getElementById('modalDetailSubtitle').textContent = `ID: ${bc.id} • Sent on ${bc.date || 'Recent'} • Target: ${bc.recipient_filter || 'All'}`;
  document.getElementById('modalDetailTotal').textContent = Number(bc.recipients_count || (bc.messages ? bc.messages.length : 1)).toLocaleString();
  document.getElementById('modalDetailDelivered').textContent = Number(bc.sent_count || bc.recipients_count || 1).toLocaleString();
  document.getElementById('modalDetailRate').textContent = `${bc.delivered_pct || 100}%`;
  document.getElementById('modalDetailFailed').textContent = Number(bc.failed_count || 0).toLocaleString();

  const messagesList = bc.messages || [];
  const tbody = document.getElementById('modalDetailTableBody');
  const searchInput = document.getElementById('modalDetailSearch');
  let activeFilter = 'all';

  function renderModalRows() {
    if (!tbody) return;
    const term = searchInput ? searchInput.value.toLowerCase().trim() : '';

    const filtered = messagesList.filter(m => {
      const matchSearch = !term ||
        (m.name || '').toLowerCase().includes(term) ||
        (m.phone || '').includes(term) ||
        (m.department || '').toLowerCase().includes(term);

      const isFailed = (m.status || '').toLowerCase() === 'failed';
      const isDelivered = (m.status || '').toLowerCase() === 'delivered' || (m.status || '').toLowerCase() === 'sent' || (m.status || '').toLowerCase() === 'read' || (m.status || '').toLowerCase() === 'replied';

      if (activeFilter === 'failed') return matchSearch && isFailed;
      if (activeFilter === 'delivered') return matchSearch && isDelivered;
      return matchSearch;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 20px;">No matching recipient delivery records found.</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    filtered.forEach(m => {
      const isFailed = (m.status || '').toLowerCase() === 'failed';
      const isDelivered = (m.status || '').toLowerCase() === 'delivered' || (m.status || '').toLowerCase() === 'read' || (m.status || '').toLowerCase() === 'replied';
      
      const statusBadge = isFailed
        ? '<span style="background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 11px;">✗ Failed</span>'
        : isDelivered
        ? '<span style="background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 11px;">✓ Delivered</span>'
        : '<span style="background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 11px;">Sent</span>';

      const reasonHtml = isFailed
        ? `<span style="color: #dc2626; font-weight: 600;">⚠ Meta Error: ${m.error || 'Recipient number not registered on WhatsApp or rejected by Meta'}</span>`
        : `<span style="color: #059669;">✓ Successfully delivered to WhatsApp</span>`;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 700; color: #1e293b; padding: 8px 12px;">${m.name || 'Staff Member'}</td>
        <td style="font-family: monospace; color: #475569; padding: 8px 12px;">${m.phone || '-'}</td>
        <td style="color: #64748b; padding: 8px 12px;">${m.department || 'Operations'}</td>
        <td style="padding: 8px 12px;">${statusBadge}</td>
        <td style="color: #64748b; padding: 8px 12px;">${m.time || '-'}</td>
        <td style="padding: 8px 12px;">${reasonHtml}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  if (searchInput) searchInput.oninput = renderModalRows;

  document.querySelectorAll('.modal-filter-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.modal-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.getAttribute('data-filter');
      renderModalRows();
    };
  });

  renderModalRows();
  modal.style.display = 'flex';

  const closeBtn1 = document.getElementById('btnCloseDetailModal');
  const closeBtn2 = document.getElementById('btnCloseDetailModal2');
  if (closeBtn1) closeBtn1.onclick = () => modal.style.display = 'none';
  if (closeBtn2) closeBtn2.onclick = () => modal.style.display = 'none';
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
  const fallbackTemplates = [
    {
      name: "staff_official_notice",
      status: "APPROVED",
      category: "MARKETING",
      components: [
        { type: "HEADER", format: "TEXT", text: "Al-Haditha Energy Notice" },
        { type: "BODY", text: "Dear {{1}}, please be advised of the following announcement regarding {{2}}:\n\n{{3}}\n\nThank you for your cooperation." },
        { type: "FOOTER", text: "Al-Haditha Energy Management" }
      ]
    },
    {
      name: "general_announcement",
      status: "APPROVED",
      category: "UTILITY",
      components: [
        { type: "HEADER", format: "TEXT", text: "Al Haditha Energy Official Announcement" },
        { type: "BODY", text: "Dear {{1}},\n\nThis is a general announcement from Al Haditha Energy regarding {{2}}:\n{{3}}\n\nThank you for your continued support." },
        { type: "FOOTER", text: "Al Haditha Energy HR" }
      ]
    }
  ];

  try {
    const res = await fetch('/api/templates');
    if (res.ok) {
      const data = await res.json();
      templatesList = (data.templates && data.templates.length > 0) ? data.templates : fallbackTemplates;
    } else {
      templatesList = fallbackTemplates;
    }
  } catch (err) {
    console.error('Error loading templates, using fallback:', err);
    templatesList = fallbackTemplates;
  }

  const select = document.getElementById('broadcastTemplateSelect');
  if (!select) return;
  select.innerHTML = '';

  const formatTitleCase = (str) => (str || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

  templatesList.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.name;
    opt.textContent = `${formatTitleCase(t.name)} (${formatTitleCase(t.status || 'APPROVED')})`;
    select.appendChild(opt);
  });

  updateTemplateVariablesAndPreview();
}

function closeAllCustomDropdowns(exceptDropdown = null) {
  document.querySelectorAll('.custom-dropdown').forEach(dd => {
    if (dd === exceptDropdown) return;
    const menu = dd.querySelector('.custom-dropdown-menu');
    const trigger = dd.querySelector('.custom-dropdown-trigger, .insert-var-trigger');
    if (menu) menu.style.display = 'none';
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  });
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.custom-dropdown')) {
    closeAllCustomDropdowns();
  }
});

function enhanceSelectToCustomDropdown(selectId, iconName = 'list', placeholder = 'Select an option') {
  const selectEl = document.getElementById(selectId);
  if (!selectEl || selectEl.dataset.enhanced === 'true') return;
  selectEl.dataset.enhanced = 'true';
  selectEl.style.display = 'none';

  const wrapper = document.createElement('div');
  wrapper.className = 'custom-dropdown';
  wrapper.id = `${selectId}_customDropdown`;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-dropdown-trigger';
  trigger.setAttribute('aria-expanded', 'false');

  const selectedSpan = document.createElement('span');
  selectedSpan.className = 'custom-dropdown-selected';

  const chevron = document.createElement('i');
  chevron.setAttribute('data-lucide', 'chevron-down');
  chevron.className = 'custom-dropdown-chevron';
  chevron.style.cssText = 'width: 16px; height: 16px;';

  trigger.appendChild(selectedSpan);
  trigger.appendChild(chevron);

  const menu = document.createElement('div');
  menu.className = 'custom-dropdown-menu';
  menu.style.display = 'none';

  wrapper.appendChild(trigger);
  wrapper.appendChild(menu);
  selectEl.parentNode.insertBefore(wrapper, selectEl.nextSibling);

  function syncDropdown() {
    const opts = Array.from(selectEl.options);
    const currentVal = selectEl.value;
    const selectedOpt = opts.find(o => o.value === currentVal) || opts[0];
    const displayText = selectedOpt ? selectedOpt.textContent : placeholder;

    selectedSpan.innerHTML = `<i data-lucide="${iconName}" style="width: 15px; height: 15px; color: var(--primary-green); flex-shrink: 0;"></i><span>${displayText}</span>`;

    menu.innerHTML = '';
    opts.forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isSelected = opt.value === currentVal;
      btn.className = `custom-dropdown-item${isSelected ? ' active' : ''}`;
      btn.innerHTML = `
        <span class="custom-dropdown-item-left">
          <i data-lucide="${iconName}" style="width: 15px; height: 15px; flex-shrink: 0;"></i>
          <span>${opt.textContent}</span>
        </span>
        <i data-lucide="check" class="custom-dropdown-check" style="width: 15px; height: 15px; flex-shrink: 0;"></i>
      `;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectEl.value = opt.value;
        menu.style.display = 'none';
        trigger.setAttribute('aria-expanded', 'false');
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        syncDropdown();
      });
      menu.appendChild(btn);
    });

    if (typeof initIcons === 'function') initIcons();
  }

  selectEl._syncCustomDropdown = syncDropdown;

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = menu.style.display === 'flex';
    closeAllCustomDropdowns(wrapper);
    menu.style.display = isOpen ? 'none' : 'flex';
    trigger.setAttribute('aria-expanded', String(!isOpen));
  });

  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) {
      menu.style.display = 'none';
      trigger.setAttribute('aria-expanded', 'false');
    }
  });

  selectEl.addEventListener('change', syncDropdown);

  const observer = new MutationObserver(syncDropdown);
  observer.observe(selectEl, { childList: true, subtree: true });

  syncDropdown();
}

function setupBroadcastStudio() {
  enhanceSelectToCustomDropdown('broadcastTemplateSelect', 'file-check-2', 'Select a template...');
  enhanceSelectToCustomDropdown('deptSelectDropdown', 'briefcase', 'Select Department...');
  enhanceSelectToCustomDropdown('employeeSelectDropdown', 'user', '-- Choose an Employee --');

  const select = document.getElementById('broadcastTemplateSelect');
  if (select) {
    select.addEventListener('change', updateTemplateVariablesAndPreview);
  }

  // Recipient custom dropdown selection (Everyone, By Department, Select Employee, Upload CSV)
  const recipientModeSelect = document.getElementById('recipientModeSelect');
  const recipientDropdown = document.getElementById('recipientModeDropdown');
  const recipientTrigger = document.getElementById('recipientModeTrigger');
  const recipientSelected = document.getElementById('recipientModeSelected');
  const recipientMenu = document.getElementById('recipientModeMenu');
  const deptWrap = document.getElementById('deptSelectorWrap');
  const employeeWrap = document.getElementById('employeeSelectorWrap');
  const btnUnselectEmp = document.getElementById('btnUnselectEmployee');
  const btnUnselectDept = document.getElementById('btnUnselectDept');
  const csvWrap = document.getElementById('csvSelectorWrap');
  let csvRecipientsList = [];

  const recipientModeMeta = {
    all: { label: 'Everyone (All Employees)', icon: 'globe' },
    department: { label: 'By Department', icon: 'briefcase' },
    employee: { label: 'Select Employee', icon: 'user' },
    csv: { label: 'Upload CSV / Excel', icon: 'file-spreadsheet' }
  };

  window.setRecipientMode = function(mode) {
    if (!mode || !recipientModeMeta[mode]) mode = 'all';
    if (recipientModeSelect) recipientModeSelect.value = mode;

    // Update custom dropdown UI
    if (recipientMenu) {
      recipientMenu.querySelectorAll('.custom-dropdown-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-value') === mode);
      });
    }
    if (recipientSelected) {
      const meta = recipientModeMeta[mode];
      recipientSelected.innerHTML = `<i data-lucide="${meta.icon}" style="width: 15px; height: 15px; color: var(--primary-green);"></i><span>${meta.label}</span>`;
      if (typeof initIcons === 'function') initIcons();
    }

    if (deptWrap) deptWrap.style.display = 'none';
    if (employeeWrap) employeeWrap.style.display = 'none';
    if (csvWrap) csvWrap.style.display = 'none';

    if (mode === 'department') {
      if (deptWrap) deptWrap.style.display = 'block';
    } else if (mode === 'employee') {
      if (employeeWrap) employeeWrap.style.display = 'block';
      syncSelectedEmployeeWithTemplate();
    } else if (mode === 'csv') {
      if (csvWrap) csvWrap.style.display = 'block';
    } else {
      const empSelect = document.getElementById('employeeSelectDropdown');
      if (empSelect) {
        empSelect.value = '';
        if (empSelect._syncCustomDropdown) empSelect._syncCustomDropdown();
      }
      resetRecipientVariableToDefault();
    }
    renderLivePreview();
  };

  if (recipientTrigger && recipientMenu) {
    recipientTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = recipientMenu.style.display === 'flex';
      closeAllCustomDropdowns(recipientDropdown);
      recipientMenu.style.display = isOpen ? 'none' : 'flex';
      recipientTrigger.setAttribute('aria-expanded', String(!isOpen));
    });

    recipientMenu.querySelectorAll('.custom-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = item.getAttribute('data-value');
        recipientMenu.style.display = 'none';
        recipientTrigger.setAttribute('aria-expanded', 'false');
        setRecipientMode(mode);
      });
    });

    document.addEventListener('click', (e) => {
      if (recipientDropdown && !recipientDropdown.contains(e.target)) {
        recipientMenu.style.display = 'none';
        recipientTrigger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // CSV File Upload handling
  const csvInput = document.getElementById('csvFileInput');
  const csvStatus = document.getElementById('csvStatusBox');
  const btnDownloadSample = document.getElementById('btnDownloadSampleCsv');

  if (btnDownloadSample) {
    btnDownloadSample.addEventListener('click', () => {
      const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(
        "Name,Phone,Department,Role\n" +
        "Ahmed Raza,+923306579717,HR,HR Manager\n" +
        "Shoaib Bhai,+96879783152,Operations,Site Engineer\n" +
        "Ali Musa,+923104220217,Operations,Technician\n" +
        "Emaad,+923124494540,Engineering,Lead Engineer\n"
      );
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", csvContent);
      downloadAnchor.setAttribute("download", "alhaditha_recipients_sample.csv");
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    });
  }

  if (csvInput) {
    csvInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      const reader = new FileReader();
      reader.onload = function(evt) {
        let text = '';
        if (isExcel) {
          if (typeof XLSX === 'undefined') {
            alert('Excel parser is still loading. Please try again in a moment.');
            return;
          }
          const wb = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
          const firstSheet = wb.SheetNames[0];
          text = XLSX.utils.sheet_to_csv(wb.Sheets[firstSheet]);
        } else {
          text = evt.target.result;
        }
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) {
          alert('CSV file is empty or missing data rows.');
          return;
        }

        const headers = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/['"]/g, ''));
        const nameIdx = headers.findIndex(h => h.includes('name'));
        const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('number') || h.includes('mobile'));
        const deptIdx = headers.findIndex(h => h.includes('dept') || h.includes('department'));
        const roleIdx = headers.findIndex(h => h.includes('role') || h.includes('designation') || h.includes('title'));

        if (phoneIdx === -1) {
          alert('CSV must contain a "Phone" column header.');
          return;
        }

        csvRecipientsList = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim().replace(/['"]/g, ''));
          if (!cols[phoneIdx]) continue;
          
          let rawPhone = cols[phoneIdx].replace(/\s+/g, '').replace(/-/g, '');
          if (!rawPhone.startsWith('+')) rawPhone = '+' + rawPhone;

          const rec = {
            id: `CSV-${i}`,
            name: nameIdx !== -1 && cols[nameIdx] ? cols[nameIdx] : `Recipient ${i}`,
            phone: rawPhone,
            department: deptIdx !== -1 && cols[deptIdx] ? cols[deptIdx] : "Operations",
            role: roleIdx !== -1 && cols[roleIdx] ? cols[roleIdx] : "Staff"
          };
          csvRecipientsList.push(rec);
        }

        if (csvStatus) {
          csvStatus.style.display = 'block';
          csvStatus.innerHTML = `✓ Successfully loaded <b>${csvRecipientsList.length} recipients</b> from <i>${file.name}</i>`;
        }
        renderLivePreview();
      };
      if (isExcel) {
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsText(file);
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
  const firstVarInput = document.querySelector('.var-field[data-tag="{{1}}"]');
  if (firstVarInput) {
    firstVarInput.value = "";
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

function getTemplateVarConfigs(tpl, rawBody) {
  const matches = rawBody.match(/\{\{\d+\}\}/g) || [];
  const variableLabels = {
    staff_official_notice: [
      { label: "Recipient / Staff Name", varName: "Staff Name", defaultVal: "{Employee Name}", placeholder: "e.g. {name} (Auto-filled per recipient)" },
      { label: "Announcement Title / Subject", varName: "Announcement Title", defaultVal: "Office Timings Update", placeholder: "e.g. Office Timings Update" },
      { label: "Official Notice Details", varName: "Notice Details", defaultVal: "Thursday working hours will conclude at 2:00 PM.", placeholder: "e.g. Thursday working hours will conclude at 2:00 PM." }
    ],
    general_announcement: [
      { label: "Staff / Team Name", varName: "Staff Name", defaultVal: "{Employee Name}", placeholder: "e.g. {name} (Auto-filled per recipient)" },
      { label: "Announcement Topic", varName: "Announcement Topic", defaultVal: "Safety Standards", placeholder: "e.g. Safety Standards" },
      { label: "Detailed Notice Content", varName: "Notice Details", defaultVal: "All site engineers must follow PPE guidelines.", placeholder: "Enter notice body..." }
    ],
    system_maintenance: [
      { label: "Scheduled Maintenance Window", varName: "Maintenance Window", defaultVal: "Friday 12:00 AM to 4:00 AM", placeholder: "e.g. Friday 12:00 AM" }
    ],
    hr_update: [
      { label: "Target Department", varName: "Target Department", defaultVal: "All Staff", placeholder: "e.g. All Staff" },
      { label: "HR Update Details", varName: "Update Details", defaultVal: "Medical insurance policy cards have been renewed.", placeholder: "e.g. Insurance cards renewed" }
    ]
  };

  if (tpl.variable_definitions && tpl.variable_definitions.length > 0) {
    return tpl.variable_definitions.map((v, i) => ({
      label: v.label || v.name || `Field ${i + 1}`,
      varName: v.name || v.label || `Field ${i + 1}`,
      defaultVal: (i === 0 && ((v.name || '') + (v.label || '')).toLowerCase().includes('name')) ? "{Employee Name}" : (v.example || ''),
      placeholder: `e.g. ${v.example || v.label || v.name || 'Enter details'}`
    }));
  }

  if (variableLabels[tpl.name]) {
    return variableLabels[tpl.name];
  }

  const bodyComp = (tpl.components || []).find(c => c.type === 'BODY') || {};
  const metaExamples = (bodyComp.example && bodyComp.example.body_text && bodyComp.example.body_text[0]) ? bodyComp.example.body_text[0] : [];

  return matches.map((m, idx) => {
    const pos = rawBody.indexOf(m);
    const before = rawBody.slice(Math.max(0, pos - 40), pos).toLowerCase();
    const exVal = metaExamples[idx] || '';

    if (idx === 0 && (before.includes('dear') || before.includes('hello') || before.includes('hi') || exVal.toLowerCase().includes('ahmed') || exVal.toLowerCase().includes('staff'))) {
      return { label: "Recipient / Staff Name", varName: "Staff Name", defaultVal: "{Employee Name}", placeholder: "e.g. {name} (Auto-filled per recipient)" };
    }
    if (before.includes('regarding') || before.includes('about') || before.includes('subject') || before.includes('topic')) {
      return { label: "Announcement Title / Topic", varName: "Topic / Title", defaultVal: exVal || "Office Timings Update", placeholder: `e.g. ${exVal || 'Office Timings Update'}` };
    }
    if (before.includes('department') || before.includes('team')) {
      return { label: "Target Department", varName: "Department", defaultVal: exVal || "All Staff", placeholder: `e.g. ${exVal || 'All Staff'}` };
    }
    if (before.includes('date') || before.includes('time') || before.includes('when') || before.includes('occur on')) {
      return { label: "Date / Time Schedule", varName: "Date / Time", defaultVal: exVal || "Thursday at 2:00 PM", placeholder: `e.g. ${exVal || 'Thursday at 2:00 PM'}` };
    }
    if (idx === matches.length - 1 || before.includes('details') || before.includes('follows') || before.includes(':')) {
      return { label: "Official Notice Details", varName: "Notice Details", defaultVal: exVal || "", placeholder: exVal ? `e.g. ${exVal}` : "Enter full announcement details..." };
    }
    return { label: `Announcement Field`, varName: `Details`, defaultVal: exVal || "", placeholder: exVal ? `e.g. ${exVal}` : "Enter details..." };
  });
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

  const templateSpecific = getTemplateVarConfigs(tpl, rawBody);

  if (matches.length > 0) {
    matches.forEach((m, idx) => {
      const config = templateSpecific[idx] || {
        label: `Variable ${idx + 1}`,
        varName: `Variable ${idx + 1}`,
        defaultVal: `Value ${idx + 1}`,
        placeholder: `Enter variable ${idx + 1}`
      };

      const displayVarName = config.varName || config.label || `Variable ${idx + 1}`;

      const card = document.createElement('div');
      card.className = 'var-input-card';
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <label style="font-size: 12px; font-weight: 700; color: #1e293b; margin: 0;">${config.label}</label>
          <div class="custom-dropdown insert-var-dropdown" style="flex: 0 0 auto; width: auto;">
            <button type="button" class="insert-var-trigger" aria-expanded="false" title="Insert dynamic placeholder">
              <i data-lucide="plus" style="width: 12px; height: 12px; color: var(--primary-green);"></i>
              <span>Insert Variable</span>
              <i data-lucide="chevron-down" class="custom-dropdown-chevron" style="width: 12px; height: 12px;"></i>
            </button>
            <div class="custom-dropdown-menu insert-var-menu" style="display: none;">
              <button type="button" class="custom-dropdown-item insert-var-option" data-target="${m}" data-insert="{name}">
                <span class="custom-dropdown-item-left"><i data-lucide="user" style="width: 13px; height: 13px;"></i><span>Employee Name</span></span>
                <span class="insert-var-code">{name}</span>
              </button>
              <button type="button" class="custom-dropdown-item insert-var-option" data-target="${m}" data-insert="{department}">
                <span class="custom-dropdown-item-left"><i data-lucide="briefcase" style="width: 13px; height: 13px;"></i><span>Department</span></span>
                <span class="insert-var-code">{department}</span>
              </button>
              <button type="button" class="custom-dropdown-item insert-var-option" data-target="${m}" data-insert="{role}">
                <span class="custom-dropdown-item-left"><i data-lucide="badge-check" style="width: 13px; height: 13px;"></i><span>Role</span></span>
                <span class="insert-var-code">{role}</span>
              </button>
              <button type="button" class="custom-dropdown-item insert-var-option" data-target="${m}" data-insert="{date}">
                <span class="custom-dropdown-item-left"><i data-lucide="calendar" style="width: 13px; height: 13px;"></i><span>Current Date</span></span>
                <span class="insert-var-code">{date}</span>
              </button>
            </div>
          </div>
        </div>
        <input type="text" class="form-input var-field" data-tag="${m}" data-varname="${displayVarName}" value="" placeholder="${config.placeholder}">
      `;
      varContainer.appendChild(card);
    });

    // Handle Insert Variable dropdown toggles & option clicks
    varContainer.querySelectorAll('.insert-var-dropdown').forEach(dd => {
      const trigger = dd.querySelector('.insert-var-trigger');
      const menu = dd.querySelector('.insert-var-menu');
      if (trigger && menu) {
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          const isOpen = menu.style.display === 'flex';
          closeAllCustomDropdowns(dd);
          menu.style.display = isOpen ? 'none' : 'flex';
          trigger.setAttribute('aria-expanded', String(!isOpen));
        });
      }
    });

    varContainer.querySelectorAll('.insert-var-option').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetTag = btn.getAttribute('data-target');
        const insertText = btn.getAttribute('data-insert');
        const inp = varContainer.querySelector(`.var-field[data-tag="${targetTag}"]`);
        const dd = btn.closest('.insert-var-dropdown');
        if (dd) {
          const menu = dd.querySelector('.insert-var-menu');
          const trigger = dd.querySelector('.insert-var-trigger');
          if (menu) menu.style.display = 'none';
          if (trigger) trigger.setAttribute('aria-expanded', 'false');
        }
        if (inp) {
          if (!inp.value.trim()) {
            inp.value = insertText;
          } else {
            inp.value += ' ' + insertText;
          }
          inp.focus();
          inp.dispatchEvent(new Event('input'));
        }
      });
    });

    if (typeof initIcons === 'function') initIcons();
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


  // Local file upload & state for Broadcast Studio
  let broadcastMediaId = null;
  let broadcastLocalPreviewUrl = null;
  let broadcastLocalFileName = null;
  let isBroadcastMediaUploading = false;

  const bcFileInput = document.getElementById('broadcastLocalFileInput');
  const bcFileStatus = document.getElementById('broadcastFileLoadedStatus');
  const bcUrlInput = document.getElementById('broadcastMediaUrlInput');
  const bcTplSelect = document.getElementById('broadcastTemplateSelect');

  if (bcTplSelect) {
    bcTplSelect.addEventListener('change', () => {
      broadcastMediaId = null;
      broadcastLocalPreviewUrl = null;
      broadcastLocalFileName = null;
      if (bcFileInput) bcFileInput.value = '';
      if (bcUrlInput) bcUrlInput.value = '';
      if (bcFileStatus) bcFileStatus.style.display = 'none';
    });
  }

  if (bcUrlInput) {
    bcUrlInput.addEventListener('input', () => {
      broadcastLocalPreviewUrl = null;
      broadcastMediaId = null;
      renderLivePreview();
    });
  }

  if (bcFileInput) {
    bcFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Instant local preview in the right card
      if (broadcastLocalPreviewUrl && broadcastLocalPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(broadcastLocalPreviewUrl);
      }
      broadcastLocalPreviewUrl = URL.createObjectURL(file);
      broadcastLocalFileName = file.name;
      broadcastMediaId = null;
      isBroadcastMediaUploading = true;
      renderLivePreview();

      if (bcFileStatus) {
        bcFileStatus.style.display = 'block';
        bcFileStatus.style.color = '#0369a1';
        bcFileStatus.textContent = `Uploading ${file.name} to Meta Cloud...`;
      }

      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!res.ok) {
          const msg = res.status === 413
            ? 'File exceeds 4.5 MB serverless limit. For larger videos, paste a public https:// MP4 link.'
            : `Upload failed (HTTP ${res.status})`;
          if (bcFileStatus) {
            bcFileStatus.textContent = msg;
            bcFileStatus.style.color = '#dc2626';
          }
          return;
        }
        const data = await res.json();

        if (data.success && data.media_id) {
          broadcastMediaId = data.media_id;
          if (bcUrlInput) bcUrlInput.value = data.url || '';
          if (bcFileStatus) {
            bcFileStatus.textContent = `✓ ${file.name} uploaded & ready!`;
            bcFileStatus.style.color = '#059669';
          }
          renderLivePreview();
        } else if (data.success && !data.media_id) {
          if (bcUrlInput) bcUrlInput.value = data.url || '';
          if (bcFileStatus) {
            bcFileStatus.textContent = `⚠ Meta upload did not return a Media ID. Please try another file format (JPG/PNG/MP4/PDF).`;
            bcFileStatus.style.color = '#d97706';
          }
        } else {
          if (bcFileStatus) {
            bcFileStatus.textContent = `Upload failed: ${data.error || 'Server error'}`;
            bcFileStatus.style.color = '#dc2626';
          }
        }
      } catch (err) {
        console.error('Error uploading broadcast file:', err);
        if (bcFileStatus) {
          bcFileStatus.textContent = `Upload error: ${err.message}`;
          bcFileStatus.style.color = '#dc2626';
        }
      } finally {
        isBroadcastMediaUploading = false;
      }
    });
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

  // Header Media Preview
  const previewMediaWrap = document.getElementById('previewMediaWrap');
  const previewMediaImg = document.getElementById('previewMediaImg');
  const previewMediaVideo = document.getElementById('previewMediaVideo');
  const previewMediaDoc = document.getElementById('previewMediaDoc');
  const previewMediaDocName = document.getElementById('previewMediaDocName');
  const previewPlaceholder = document.getElementById('previewMediaPlaceholder');
  const previewPlaceholderIcon = document.getElementById('previewMediaPlaceholderIcon');
  const previewPlaceholderText = document.getElementById('previewMediaPlaceholderText');
  const mediaInput = document.getElementById('broadcastMediaUrlInput');
  const mediaWrap = document.getElementById('broadcastMediaAttachmentWrap');

  const headerFormat = (headerComp.format || '').toUpperCase();
  const isMediaTpl = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat);

  if (mediaWrap) {
    mediaWrap.style.display = isMediaTpl ? 'block' : 'none';
  }

  if (previewMediaWrap) {
    if (isMediaTpl) {
      previewMediaWrap.style.display = 'block';
      const pastedUrl = (mediaInput && mediaInput.value.trim().startsWith('http')) ? mediaInput.value.trim() : null;
      const customSrc = broadcastLocalPreviewUrl || pastedUrl;

      if (previewMediaImg) previewMediaImg.style.display = 'none';
      if (previewMediaVideo) previewMediaVideo.style.display = 'none';
      if (previewMediaDoc) previewMediaDoc.style.display = 'none';
      if (previewPlaceholder) previewPlaceholder.style.display = 'none';

      if (headerFormat === 'IMAGE') {
        if (customSrc && previewMediaImg) {
          previewMediaImg.src = customSrc;
          previewMediaImg.style.display = 'block';
        } else if (previewPlaceholder) {
          previewPlaceholder.style.display = 'flex';
          if (previewPlaceholderIcon) previewPlaceholderIcon.textContent = '📷';
          if (previewPlaceholderText) previewPlaceholderText.textContent = 'Choose a photo on the left to preview';
        }
      } else if (headerFormat === 'VIDEO') {
        if (customSrc && previewMediaVideo) {
          previewMediaVideo.src = customSrc;
          previewMediaVideo.style.display = 'block';
        } else if (previewPlaceholder) {
          previewPlaceholder.style.display = 'flex';
          if (previewPlaceholderIcon) previewPlaceholderIcon.textContent = '🎥';
          if (previewPlaceholderText) previewPlaceholderText.textContent = 'Choose a video on the left to preview';
        }
      } else if (headerFormat === 'DOCUMENT' && previewMediaDoc) {
        previewMediaDoc.style.display = 'flex';
        if (previewMediaDocName) {
          previewMediaDocName.textContent = broadcastLocalFileName || (pastedUrl ? pastedUrl.split('/').pop() : 'Document Attachment (PDF)');
        }
      }
    } else {
      previewMediaWrap.style.display = 'none';
    }
  }

  if (previewHeader) {
    if (isMediaTpl || headerFormat === 'NONE') {
      previewHeader.style.display = 'none';
      previewHeader.textContent = '';
    } else {
      previewHeader.textContent = headerComp.text || '';
      previewHeader.style.display = headerComp.text ? 'block' : 'none';
    }
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

  // Determine active recipient preview name
  const empSelect = document.getElementById('employeeSelectDropdown');
  const selectedEmpOpt = empSelect ? empSelect.querySelector('option:checked') : null;
  const activeEmpName = (selectedEmpOpt && selectedEmpOpt.value) ? selectedEmpOpt.getAttribute('data-name') : "Ali Musa";

  varInputs.forEach(input => {
    const tag = input.getAttribute('data-tag');
    const varName = input.getAttribute('data-varname') || tag;
    let val = input.value || `{{${varName}}}`;
    values.push(val);
    
    // Friendly dynamic preview for {Employee Name} or {name} without polluting message text
    let displayVal = val;
    if (val === "{Employee Name}" || val === "{name}") {
      displayVal = activeEmpName;
    }

    text = text.split(tag).join(`<span class="var-highlight">${displayVal}</span>`);
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

  const recipientSelect = document.getElementById('recipientModeSelect');
  const recipientType = recipientSelect ? recipientSelect.value : 'all';

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
  } else if (recipientType === 'csv') {
    if (!csvRecipientsList || csvRecipientsList.length === 0) {
      alert('Please upload a valid CSV file of recipients before dispatching.');
      return;
    }
    targetDisplay = `CSV File (${csvRecipientsList.length} Contacts)`;
  } else {
    // Everyone
    targetDisplay = 'Everyone (All Staff)';
  }

  const mediaInput = document.getElementById('broadcastMediaUrlInput');
  const mediaUrl = mediaInput ? mediaInput.value.trim() : null;
  const selectTplObj = templatesList.find(t => t.name === selectedTemplate);
  const hComp = selectTplObj ? (selectTplObj.components || []).find(c => c.type === 'HEADER') : null;
  const mediaType = hComp ? hComp.format : null;

  if (isBroadcastMediaUploading) {
    alert('Media file is still uploading to Meta. Please wait a moment and try again.');
    return;
  }

  if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes((mediaType || '').toUpperCase()) && !broadcastMediaId && !(mediaUrl && mediaUrl.startsWith('http'))) {
    alert(`This template requires a ${mediaType} attachment. Please upload a file from your computer or paste a valid public link before sending.`);
    return;
  }

  const varInputs = document.querySelectorAll('.var-field');
  const emptyVar = Array.from(varInputs).find(inp => !inp.value.trim());
  if (emptyVar) {
    const varLabel = emptyVar.getAttribute('data-varname') || 'variable';
    alert(`Please fill in "${varLabel}" before sending the broadcast.`);
    emptyVar.focus();
    return;
  }
  const variables = Array.from(varInputs).map(inp => inp.value.trim());

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
        test_number: testNumber,
        media_url: mediaUrl,
        media_id: broadcastMediaId,
        media_type: mediaType,
        csv_recipients: recipientType === 'csv' ? csvRecipientsList : null
      })
    });

    const data = await res.json();
    if (res.ok) {
      const sentCount = data.sent_count || 0;
      const failedCount = data.failed_count || 0;
      const results = (data.broadcast && data.broadcast.recipient_results) ? data.broadcast.recipient_results : [];
      const firstFail = results.find(r => r.status === 'failed');
      const failReason = firstFail && firstFail.error ? firstFail.error : 'Check Broadcast Delivery Logs for details.';

      if (sentCount === 0 && failedCount > 0) {
        alert(`Broadcast Failed to Deliver! (0 Sent, ${failedCount} Failed)\n\nReason: ${failReason}\n\nYou can inspect exact per-recipient details in the Broadcast Delivery Logs below.`);
      } else if (failedCount > 0) {
        alert(`Broadcast Partially Dispatched: ${sentCount} Sent, ${failedCount} Failed.\n\nFailure Reason: ${failReason}`);
      } else {
        const confirmed = confirm(`Broadcast Dispatched Successfully!\n\nTarget: ${targetDisplay}\nTemplate: ${selectedTemplate}\nSent: ${sentCount} | Status: Delivered via Meta Cloud API.${testNumber ? '\n\nWould you like to open live chat with this recipient now?' : ''}`);
        if (confirmed && testNumber) {
          openChatWithEmployee(testNumber, targetDisplay.split(' (')[0]);
        }
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
function formatWhatsAppText(text) {
  if (!text) return '';

  // 1. Convert brackets [Text] into bold heading (removes literal brackets, renders clean bold text)
  let formatted = text.replace(/\[([^\]\r\n]+)\]/g, '<strong class="wa-bold">$1</strong>');

  // 2. WhatsApp bold: *text* -> <strong>text</strong>
  formatted = formatted.replace(/(?<=^|[\s\p{P}])\*([^\s*](?:.*?[^\s*])?)\*(?=[\s\p{P}]|$)/gu, '<strong class="wa-bold">$1</strong>');

  // 3. WhatsApp italic: _text_ -> <em>text</em>
  formatted = formatted.replace(/(?<=^|[\s\p{P}])_([^\s_](?:.*?[^\s_])?)_(?=[\s\p{P}]|$)/gu, '<em>$1</em>');

  // 4. WhatsApp strikethrough: ~text~ -> <del>text</del>
  formatted = formatted.replace(/(?<=^|[\s\p{P}])~([^\s~](?:.*?[^\s~])?)~(?=[\s\p{P}]|$)/gu, '<del>$1</del>');

  // 5. WhatsApp inline monospace: `text` -> <code>text</code>
  formatted = formatted.replace(/`([^`\r\n]+)`/g, '<code class="wa-code">$1</code>');

  // 6. Convert newlines to line breaks
  formatted = formatted.replace(/\n/g, '<br>');

  return formatted;
}

function cleanChatSnippet(text) {
  if (!text) return '';
  return text
    .replace(/\[([^\]\r\n]+)\]/g, '$1')
    .replace(/\*([^*\r\n]+)\*/g, '$1')
    .replace(/_([^_\r\n]+)_/g, '$1')
    .replace(/~([^~\r\n]+)~/g, '$1')
    .replace(/\n+/g, ' ')
    .trim();
}

let lastChatsSignature = '';

async function loadChats(forceRerender = false) {
  try {
    const res = await fetch('/api/chats');
    if (!res.ok) return;
    const data = await res.json();
    const chatsList = data.chats || [];

    const currentSig = chatsList.map(c => `${c.phone}:${c.last_activity}:${c.unread_count}`).join('|');
    if (forceRerender || currentSig !== lastChatsSignature) {
      lastChatsSignature = currentSig;
      renderConversationsList(chatsList);
    }

    // If active phone is selected, reload that conversation; otherwise render clean unselected state
    if (activePhone) {
      loadActiveChat(activePhone, forceRerender);
    } else {
      renderNoChatSelectedState();
    }
  } catch (err) {
    console.error('Error loading chats:', err);
  }
}

function renderNoChatSelectedState() {
  const headerEl = document.getElementById('waChatHeader');
  const inputBarEl = document.querySelector('.wa-input-bar');
  const msgArea = document.getElementById('waMessagesArea');

  if (headerEl) headerEl.style.display = 'none';
  if (inputBarEl) inputBarEl.style.display = 'none';

  if (msgArea) {
    msgArea.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; padding: 32px; background: #efeae2; background-image: radial-gradient(#d4ccc3 1px, transparent 1px); background-size: 16px 16px;">
        <div style="width: 68px; height: 68px; border-radius: 50%; background: #ffffff; box-shadow: 0 4px 14px rgba(0,0,0,0.06); display: flex; align-items: center; justify-content: center; margin-bottom: 18px; color: #00a651;">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        </div>
        <h3 style="font-size: 20px; font-weight: 700; color: #111b21; margin-bottom: 8px;">WhatsApp Live Conversations</h3>
        <p style="font-size: 13.5px; color: #64748b; max-width: 360px; line-height: 1.5; margin-bottom: 24px;">
          Select a conversation from the left to view messages, send replies, or share documents and photos.
        </p>
        <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #8696a0; font-weight: 500;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          <span>End-to-end encrypted Al-Haditha WhatsApp Portal</span>
        </div>
      </div>
    `;
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
          <span class="wa-row-msg">${cleanChatSnippet(chat.last_message || chat.role || 'WhatsApp conversation')}</span>
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
    const headerEl = document.getElementById('waChatHeader');
    const inputBarEl = document.querySelector('.wa-input-bar');

    if (headerEl) headerEl.style.display = 'flex';
    if (inputBarEl) inputBarEl.style.display = 'flex';

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
          let mediaHtml = '';
          if (m.media_url) {
            const mType = (m.media_type || 'image').toLowerCase();
            if (mType === 'image') {
              mediaHtml = `
                <div style="position: relative; border-radius: 8px; overflow: hidden; margin-bottom: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.12); background: #f8fafc; max-width: 320px;">
                  <img src="${m.media_url}" 
                       alt="Image attachment" 
                       style="width: 100%; max-height: 260px; object-fit: cover; display: block; cursor: pointer; transition: transform 0.15s ease;" 
                       onclick="window.open('${m.media_url}', '_blank')"
                       title="Click to view full image"
                       onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                  <div style="display: none; padding: 12px; background: rgba(0,0,0,0.04); font-size: 12px; color: #64748b; align-items: center; gap: 8px;">
                    <span>📷</span><span>Image attachment</span>
                  </div>
                </div>`;
            } else if (mType === 'sticker') {
              mediaHtml = `
                <div style="margin-bottom: 4px; max-width: 150px;">
                  <img src="${m.media_url}" alt="Sticker" style="width: 140px; height: 140px; object-fit: contain; display: block; cursor: pointer;" onclick="window.open('${m.media_url}', '_blank')">
                </div>`;
            } else if (mType === 'audio') {
              mediaHtml = `
                <div style="margin-bottom: 6px; min-width: 240px;">
                  <audio src="${m.media_url}" controls style="width: 100%; height: 36px;"></audio>
                </div>`;
            } else if (mType === 'video') {
              mediaHtml = `
                <div style="position: relative; border-radius: 8px; overflow: hidden; margin-bottom: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.12); background: #000; max-width: 320px;">
                  <video src="${m.media_url}" controls style="width: 100%; max-height: 260px; border-radius: 8px; display: block;"></video>
                </div>`;
            } else {
              mediaHtml = `
                <a href="${m.media_url}" target="_blank" style="display: flex; align-items: center; gap: 10px; background: rgba(0,0,0,0.04); border: 1px solid rgba(0,0,0,0.08); padding: 10px 14px; border-radius: 8px; margin-bottom: 6px; text-decoration: none; color: inherit; font-size: 13px; font-weight: 500; max-width: 320px;">
                  <span style="font-size: 22px;">📄</span>
                  <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    <div style="font-weight: 600; color: #0f172a;">Attachment Document</div>
                    <div style="font-size: 11px; color: #64748b;">Click to view file</div>
                  </div>
                </a>`;
            }
          }

          bubble.innerHTML = `
            ${mediaHtml}
            <div>${formatWhatsAppText(m.text || '')}</div>
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

  // Attach media modal logic (with direct local computer file upload and WhatsApp dropup)
  const attachBtn = document.getElementById('waChatAttachBtn');
  const attachDropup = document.getElementById('waAttachDropup');
  const btnAttachDoc = document.getElementById('waAttachDocBtn');
  const btnAttachMedia = document.getElementById('waAttachMediaBtn');
  const mediaModal = document.getElementById('chatMediaModal');
  const btnCloseMediaModal = document.getElementById('btnCloseChatMediaModal');
  const btnCancelMedia = document.getElementById('btnCancelChatMedia');
  const btnSendMedia = document.getElementById('btnSendChatMedia');
  const mediaUrlInput = document.getElementById('chatMediaUrlInput');
  const mediaCaptionInput = document.getElementById('chatMediaCaptionInput');
  const dropzone = document.getElementById('chatUploadDropzone');
  const fileInput = document.getElementById('chatLocalFileInput');
  const filePreview = document.getElementById('chatSelectedFilePreview');
  const fileNameEl = document.getElementById('chatFileName');
  const fileSizeEl = document.getElementById('chatFileSize');
  const fileIconEl = document.getElementById('chatFileIcon');
  const btnRemoveFile = document.getElementById('btnRemoveChatFile');
  const toggleUrl = document.getElementById('toggleChatUrlField');
  const urlWrap = document.getElementById('chatUrlWrap');

  let selectedChatFile = null;
  let selectedChatFileDataUrl = null;

  if (dropzone && fileInput) {
    dropzone.onclick = () => fileInput.click();
  }

  if (fileInput) {
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      selectedChatFile = file;

      let icon = '📄';
      const isImg = file.type.startsWith('image/') && !file.name.toLowerCase().endsWith('.svg');
      const isVid = file.type.startsWith('video/');

      if (isImg) {
        icon = '📷';
        const reader = new FileReader();
        reader.onload = (re) => {
          selectedChatFileDataUrl = re.target.result;
          if (fileIconEl) {
            fileIconEl.innerHTML = `<img src="${selectedChatFileDataUrl}" style="width: 44px; height: 44px; object-fit: cover; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.15);">`;
          }
        };
        reader.readAsDataURL(file);
      } else {
        selectedChatFileDataUrl = null;
        if (isVid) icon = '🎥';
        if (fileIconEl) fileIconEl.textContent = icon;
      }

      if (fileNameEl) fileNameEl.textContent = file.name;
      if (fileSizeEl) fileSizeEl.textContent = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
      if (filePreview) filePreview.style.display = 'flex';
      if (dropzone) dropzone.style.display = 'none';

      // Open media confirmation modal ready to send
      if (mediaModal) {
        mediaModal.style.display = 'flex';
      }
    };
  }

  if (btnRemoveFile) {
    btnRemoveFile.onclick = (e) => {
      e.stopPropagation();
      selectedChatFile = null;
      if (fileInput) fileInput.value = '';
      if (filePreview) filePreview.style.display = 'none';
      if (dropzone) dropzone.style.display = 'block';
    };
  }

  if (toggleUrl && urlWrap) {
    toggleUrl.onclick = () => {
      urlWrap.style.display = urlWrap.style.display === 'none' ? 'block' : 'none';
    };
  }

  // WhatsApp Attachment Dropup Toggle
  if (attachBtn && attachDropup) {
    attachBtn.onclick = (e) => {
      e.stopPropagation();
      if (!activePhone) {
        alert('Please select an active conversation first.');
        return;
      }
      attachDropup.style.display = (attachDropup.style.display === 'none' || !attachDropup.style.display) ? 'flex' : 'none';
    };

    document.addEventListener('click', (e) => {
      if (attachDropup && attachDropup.style.display !== 'none') {
        if (!attachDropup.contains(e.target) && !attachBtn.contains(e.target)) {
          attachDropup.style.display = 'none';
        }
      }
    });
  }

  if (btnAttachDoc && fileInput) {
    btnAttachDoc.onclick = (e) => {
      e.stopPropagation();
      if (attachDropup) attachDropup.style.display = 'none';
      fileInput.accept = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,application/pdf';
      fileInput.click();
    };
  }

  if (btnAttachMedia && fileInput) {
    btnAttachMedia.onclick = (e) => {
      e.stopPropagation();
      if (attachDropup) attachDropup.style.display = 'none';
      fileInput.accept = 'image/*,video/*';
      fileInput.click();
    };
  }

  if (btnCloseMediaModal && mediaModal) btnCloseMediaModal.onclick = () => mediaModal.style.display = 'none';
  if (btnCancelMedia && mediaModal) btnCancelMedia.onclick = () => mediaModal.style.display = 'none';

  if (btnSendMedia && mediaModal) {
    btnSendMedia.onclick = async () => {
      let url = mediaUrlInput ? mediaUrlInput.value.trim() : '';
      let mediaId = null;
      let detectedType = 'image';
      const caption = mediaCaptionInput ? mediaCaptionInput.value.trim() : '';

      if (!selectedChatFile && !url) {
        alert('Please choose a file from your computer or enter a media link.');
        return;
      }

      btnSendMedia.disabled = true;
      btnSendMedia.textContent = 'Uploading & Sending...';

      try {
        if (selectedChatFile) {
          const lowerName = selectedChatFile.name.toLowerCase();
          if (selectedChatFile.type.startsWith('video/') || lowerName.match(/\.(mp4|3gp|mov|avi)$/)) {
            detectedType = 'video';
          } else if (lowerName.endsWith('.svg') || selectedChatFile.type.includes('svg') || selectedChatFile.type === 'application/pdf' || lowerName.endsWith('.pdf')) {
            detectedType = 'document';
          } else if (selectedChatFile.type.startsWith('image/') || lowerName.match(/\.(jpg|jpeg|png|webp|gif)$/)) {
            detectedType = 'image';
          } else {
            detectedType = 'document';
          }

          // Upload to /api/upload
          const formData = new FormData();
          formData.append('file', selectedChatFile);
          const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
          if (!uploadRes.ok) {
            alert(uploadRes.status === 413
              ? 'File exceeds 4.5 MB serverless upload limit. For larger videos, paste a public https:// MP4 link.'
              : `File upload failed (HTTP ${uploadRes.status})`);
            btnSendMedia.disabled = false;
            btnSendMedia.innerHTML = '<i data-lucide="send" style="width: 14px; height: 14px;"></i><span>Send to WhatsApp</span>';
            initIcons();
            return;
          }
          const uploadData = await uploadRes.json();
          if (!uploadData.success) {
            alert('File upload failed: ' + (uploadData.error || 'Server error'));
            btnSendMedia.disabled = false;
            btnSendMedia.textContent = 'Send to WhatsApp';
            return;
          }
          url = uploadData.url;
          mediaId = uploadData.media_id;
        } else if (url) {
          if (url.match(/\.(mp4|mov|avi)($|\?)/i)) detectedType = 'video';
          else if (url.match(/\.(pdf|docx|xlsx)($|\?)/i)) detectedType = 'document';
          else detectedType = 'image';
        }

        const res = await fetch(`/api/chats/${encodeURIComponent(activePhone)}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: caption,
            media_url: url,
            media_id: mediaId,
            preview_url: selectedChatFileDataUrl,
            media_type: detectedType
          })
        });

        if (res.ok) {
          mediaModal.style.display = 'none';
          loadActiveChat(activePhone, true);
          loadChats(false);
        } else {
          const errData = await res.json();
          alert('Error sending media: ' + (errData.detail || 'Meta API error'));
        }
      } catch (e) {
        console.error('Error sending chat media:', e);
        alert('Error dispatching media: ' + e.message);
      } finally {
        btnSendMedia.disabled = false;
        btnSendMedia.innerHTML = '<i data-lucide="send" style="width: 14px; height: 14px;"></i><span>Send to WhatsApp</span>';
        initIcons();
      }
    };
  }

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
function openViewTemplateModal(tpl) {
  const modal = document.getElementById('viewTemplateModal');
  if (!modal || !tpl) return;

  const titleEl = document.getElementById('viewTplModalTitle');
  const badgesEl = document.getElementById('viewTplMetaBadges');
  const rejBox = document.getElementById('viewTplRejectionBox');
  const hdrBadge = document.getElementById('viewTplHeaderBadge');
  const hdrText = document.getElementById('viewTplHeaderText');
  const bodyEl = document.getElementById('viewTplBodyText');
  const ftrEl = document.getElementById('viewTplFooterText');

  if (titleEl) titleEl.textContent = tpl.name;

  const st = (tpl.status || 'APPROVED').toUpperCase();
  const stBg = st === 'APPROVED' ? '#dcfce7' : st === 'PENDING' ? '#fef3c7' : '#fee2e2';
  const stCol = st === 'APPROVED' ? '#15803d' : st === 'PENDING' ? '#b45309' : '#b91c1c';

  const headerComp = (tpl.components || []).find(c => c.type === 'HEADER') || {};
  const bodyComp = (tpl.components || []).find(c => c.type === 'BODY') || {};
  const footerComp = (tpl.components || []).find(c => c.type === 'FOOTER') || {};
  const hFmt = (headerComp.format || (headerComp.text ? 'TEXT' : 'NONE')).toUpperCase();

  if (badgesEl) {
    badgesEl.innerHTML = `
      <span style="font-size: 11px; padding: 3px 10px; border-radius: 20px; font-weight: 700; background: ${stBg}; color: ${stCol};">${st}</span>
      <span style="font-size: 11px; padding: 3px 10px; border-radius: 20px; font-weight: 700; background: #e0f2fe; color: #0369a1;">${tpl.category || 'UTILITY'}</span>
      <span style="font-size: 11px; padding: 3px 10px; border-radius: 20px; font-weight: 600; background: #f1f5f9; color: #334155;">Lang: ${tpl.language || 'en_US'}</span>
      <span style="font-size: 11px; padding: 3px 10px; border-radius: 20px; font-weight: 600; background: #f1f5f9; color: #334155;">Header: ${hFmt}</span>
    `;
  }

  if (rejBox) {
    if (tpl.rejected_reason && tpl.rejected_reason !== 'NONE') {
      rejBox.style.display = 'block';
      rejBox.innerHTML = `<strong>Meta Rejection Reason:</strong> ${tpl.rejected_reason}`;
    } else {
      rejBox.style.display = 'none';
    }
  }

  if (hdrBadge && hdrText) {
    hdrBadge.style.display = 'none';
    hdrText.style.display = 'none';
    if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(hFmt)) {
      const icon = hFmt === 'IMAGE' ? '📷' : hFmt === 'VIDEO' ? '🎥' : '📄';
      hdrBadge.textContent = `${icon} ${hFmt} HEADER (Attached when sending broadcast)`;
      hdrBadge.style.display = 'block';
    } else if (headerComp.text) {
      hdrText.textContent = headerComp.text;
      hdrText.style.display = 'block';
    }
  }

  if (bodyEl) {
    const rawText = bodyComp.text || '';
    const configs = getTemplateVarConfigs(tpl, rawText);
    const formatted = rawText.replace(/\{\{(\d+)\}\}/g, (match, numStr) => {
      const idx = parseInt(numStr, 10) - 1;
      const vName = (configs[idx] && (configs[idx].varName || configs[idx].label)) || `Field`;
      return `<span style="background: #fef08a; color: #854d0e; padding: 1px 6px; border-radius: 4px; font-weight: 700;">{{${vName}}}</span>`;
    });
    bodyEl.innerHTML = formatted;
  }

  if (ftrEl) {
    if (footerComp.text) {
      ftrEl.textContent = footerComp.text;
      ftrEl.style.display = 'block';
    } else {
      ftrEl.style.display = 'none';
    }
  }

  modal.style.display = 'flex';
  initIcons();
}

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
      const st = (tpl.status || 'APPROVED').toUpperCase();
      let badgeStyle = '';
      if (st === 'PENDING') badgeStyle = 'background: #fef3c7; color: #b45309; border-color: #fde68a;';
      else if (st === 'REJECTED') badgeStyle = 'background: #fee2e2; color: #b91c1c; border-color: #fecaca;';

      tr.innerHTML = `
        <td style="font-weight: 700; color: #0f172a;">${tpl.name}</td>
        <td><span style="font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 4px; font-weight: 700;">${tpl.category}</span></td>
        <td>${tpl.language}</td>
        <td><span class="status-badge active" style="${badgeStyle}"><span class="badge-dot" style="${st === 'PENDING' ? 'background:#d97706;' : st === 'REJECTED' ? 'background:#dc2626;' : ''}"></span>${st}</span></td>
        <td style="font-weight: 600; color: #00a651;">${matches.length} Variables</td>
        <td style="font-size: 12px; color: #475569; max-width: 280px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${bodyComp.text || ''}</td>
        <td>
          <button type="button" class="btn-action-view btn-view-tpl-row" style="padding: 4px 10px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px; cursor: pointer;">
            <i data-lucide="eye" style="width: 12px; height: 12px;"></i>
            <span>View</span>
          </button>
        </td>
      `;
      tr.querySelector('.btn-view-tpl-row').addEventListener('click', () => openViewTemplateModal(tpl));
      tbody.appendChild(tr);
    });
    initIcons();

    const viewModal = document.getElementById('viewTemplateModal');
    const btnCloseTop = document.getElementById('btnCloseViewTplModal');
    const btnCloseBot = document.getElementById('btnCloseViewTplFooter');
    if (btnCloseTop && viewModal) btnCloseTop.onclick = () => viewModal.style.display = 'none';
    if (btnCloseBot && viewModal) btnCloseBot.onclick = () => viewModal.style.display = 'none';
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

  const headerTypeSelect = document.getElementById('tplHeaderTypeSelect');
  const headerTextWrap = document.getElementById('tplHeaderTextWrap');
  const headerMediaWrap = document.getElementById('tplHeaderMediaWrap');
  const headerInput = document.getElementById('tplHeaderInput');
  const headerCounter = document.getElementById('tplHeaderCharCounter');
  const bodyCounter = document.getElementById('tplBodyCharCounter');

  // Local sample media file upload for template creation
  const tplHeaderFileInput = document.getElementById('tplHeaderFileInput');
  const btnChooseTplSample = document.getElementById('btnChooseTplSampleFile');
  const tplSampleFileName = document.getElementById('tplSampleFileName');
  const tplHeaderMediaInput = document.getElementById('tplHeaderMediaInput');

  if (btnChooseTplSample && tplHeaderFileInput) {
    btnChooseTplSample.onclick = () => tplHeaderFileInput.click();
  }

  if (tplHeaderFileInput) {
    tplHeaderFileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (tplSampleFileName) tplSampleFileName.textContent = file.name;
      
      try {
        const formData = new FormData();
        formData.append('file', file);
        const upRes = await fetch('/api/upload', { method: 'POST', body: formData });
        const upData = await upRes.json();
        if (upData.success && upData.url) {
          if (tplHeaderMediaInput) tplHeaderMediaInput.value = upData.url;
        }
      } catch (err) {
        console.warn('Sample upload warning:', err);
      }
    };
  }

  if (headerTypeSelect) {
    headerTypeSelect.addEventListener('change', () => {
      const val = headerTypeSelect.value;
      if (val === 'TEXT') {
        if (headerTextWrap) headerTextWrap.style.display = 'block';
        if (headerMediaWrap) headerMediaWrap.style.display = 'none';
      } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(val)) {
        if (headerTextWrap) headerTextWrap.style.display = 'none';
        if (headerMediaWrap) headerMediaWrap.style.display = 'block';
      } else {
        if (headerTextWrap) headerTextWrap.style.display = 'none';
        if (headerMediaWrap) headerMediaWrap.style.display = 'none';
      }
    });
  }

  if (headerInput && headerCounter) {
    headerInput.addEventListener('input', () => {
      headerCounter.textContent = `${headerInput.value.length} / 60`;
    });
  }

  if (bodyInput && bodyCounter) {
    bodyInput.addEventListener('input', () => {
      bodyCounter.textContent = `${bodyInput.value.length} / 1024`;
    });
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

  // Preset samples for friendly variable names
  const sampleMap = {
    "Staff Name": "Ahmed Raza",
    "name": "Ahmed Raza",
    "Topic / Title": "Office Timings Update",
    "topic": "Office Timings Update",
    "Notice Details": "Thursday working hours will conclude at 2:00 PM.",
    "details": "Thursday working hours will conclude at 2:00 PM.",
    "Date / Deadline": "Thursday at 10:00 AM",
    "date": "Thursday at 10:00 AM",
    "Department": "Operations Department",
    "Role": "Field Engineer"
  };

  function getDetectedVariables() {
    if (!bodyInput) return [];
    const text = bodyInput.value || '';
    const regex = /\{\{([^}]+)\}\}/g;
    const found = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      const raw = match[1].trim();
      if (raw && !found.includes(raw)) {
        found.push(raw);
      }
    }
    return found;
  }

  function updateLivePreview() {
    if (!previewText || !bodyInput) return;
    let text = bodyInput.value || '';
    if (!text.trim()) {
      previewText.innerHTML = '<span style="color: #94a3b8; font-style: italic;">Enter body text to preview message...</span>';
      return;
    }

    const detected = getDetectedVariables();
    detected.forEach((vName, idx) => {
      const cur = definedVarsState[vName] || {};
      const exVal = cur.example || sampleMap[vName] || (defaultVarConfigs[idx] ? defaultVarConfigs[idx].example : `Sample ${idx + 1}`);
      const escaped = vName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`\\{\\{${escaped}\\}\\}`, 'g');
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

    detected.forEach((vName, idx) => {
      const fallbackEx = sampleMap[vName] || (defaultVarConfigs[idx] ? defaultVarConfigs[idx].example : `Sample ${idx + 1}`);
      if (!definedVarsState[vName]) {
        definedVarsState[vName] = {
          label: vName,
          example: fallbackEx
        };
      }

      const cur = definedVarsState[vName];
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; gap: 10px; align-items: center; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px;';

      row.innerHTML = `
        <div style="background: #ecfdf5; border: 1px solid #a7f3d0; color: #008c44; font-family: monospace; font-size: 12px; font-weight: 800; padding: 4px 8px; border-radius: 6px; white-space: nowrap;">
          {{${vName}}}
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 2px;">
          <label style="font-size: 10px; font-weight: 700; color: #64748b;">Variable Name / Label</label>
          <input type="text" class="form-input var-label-field" data-vname="${vName}" value="${cur.label || vName}" placeholder="e.g. Staff Name" style="font-size: 12px; padding: 5px 8px;">
        </div>
        <div style="flex: 1.2; display: flex; flex-direction: column; gap: 2px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <label style="font-size: 10px; font-weight: 700; color: #64748b;">Meta Approval Sample</label>
            <span style="font-size: 10px; color: #059669; font-weight: 600;">✓ Auto-supplied</span>
          </div>
          <input type="text" class="form-input var-example-field" data-vname="${vName}" value="${cur.example || fallbackEx}" placeholder="e.g. Ahmed Raza" style="font-size: 12px; padding: 5px 8px; background: #f8fafc;">
        </div>
      `;

      varsContainer.appendChild(row);
    });

    varsContainer.querySelectorAll('.var-label-field').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const vName = e.target.getAttribute('data-vname');
        if (definedVarsState[vName]) {
          definedVarsState[vName].label = e.target.value;
        }
      });
    });

    varsContainer.querySelectorAll('.var-example-field').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const vName = e.target.getAttribute('data-vname');
        if (definedVarsState[vName]) {
          definedVarsState[vName].example = e.target.value;
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

    const vName = tag.replace(/^\{\{|\}\}$/g, '').trim();
    if (!definedVarsState[vName] || defaultLabel) {
      definedVarsState[vName] = {
        label: defaultLabel || vName,
        example: defaultExample || sampleMap[vName] || `Sample Value`
      };
    }

    renderDefinedVariables();
  }

  document.querySelectorAll('.tpl-quick-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const label = chip.getAttribute('data-name');
      const example = chip.getAttribute('data-example');
      // Insert named variable (e.g. {{Staff Name}}), NOT raw numbers {{1}}
      insertPlaceholderAtCursor(`{{${label}}}`, label, example);
    });
  });

  if (btnAddVar) {
    btnAddVar.addEventListener('click', () => {
      const detected = getDetectedVariables();
      const nextName = `Variable_${detected.length + 1}`;
      insertPlaceholderAtCursor(`{{${nextName}}}`, nextName);
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
      const hType = document.getElementById('tplHeaderTypeSelect') ? document.getElementById('tplHeaderTypeSelect').value : 'TEXT';
      const header = document.getElementById('tplHeaderInput') ? document.getElementById('tplHeaderInput').value.trim() : '';
      const hMediaUrl = document.getElementById('tplHeaderMediaInput') ? document.getElementById('tplHeaderMediaInput').value.trim() : null;
      const body = bodyInput ? bodyInput.value.trim() : '';
      const footerEl = document.getElementById('tplFooterInput');
      const footer = footerEl ? footerEl.value.trim() : null;

      if (!rawName || !body) {
        alert('Please enter a Template Name and Body text.');
        return;
      }

      // Automatic Name Formatter: Convert 'Staff Timing Update 2026' into 'staff_timing_update_2026'
      const cleanName = formatMetaTemplateName(rawName) || `template_${Date.now()}`;

      // Automatic Sample Values & Variable Name Conversion for Meta Cloud API format
      const detected = getDetectedVariables();
      const variableDefs = [];
      const examples = [];
      let metaFormattedBody = body;

      for (let i = 0; i < detected.length; i++) {
        const vName = detected[i];
        const num = i + 1;
        const cur = definedVarsState[vName] || {};
        const fallbackEx = sampleMap[vName] || (defaultVarConfigs[i] ? defaultVarConfigs[i].example : `Sample ${num}`);
        
        const label = cur.label || vName;
        const ex = (cur.example && cur.example.trim()) ? cur.example.trim() : fallbackEx;

        // Convert friendly variable names {{Staff Name}} to {{1}} for Meta's strict backend requirement
        const escaped = vName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`\\{\\{${escaped}\\}\\}`, 'g');
        metaFormattedBody = metaFormattedBody.replace(regex, `{{${num}}}`);

        variableDefs.push({
          index: num,
          name: vName,
          tag: `{{${vName}}}`,
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
            header_type: hType, header_text: header || null, header_media_sample_url: hMediaUrl,
            body_text: metaFormattedBody,
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
        <td style="font-family: monospace; font-size: 11px; font-weight: 600; color: #475569; white-space: nowrap;">
          <div>${emp.id}</div>
          ${isFromMessages ? '<span style="display: inline-block; margin-top: 2px; font-size: 9px; background: #dcfce7; color: #047857; padding: 1px 4px; border-radius: 3px; font-weight: 700;">LIVE CHAT</span>' : ''}
        </td>
        <td style="font-weight: 700; color: #0f172a;">${emp.name}</td>
        <td style="color: #00a651; font-weight: 600; font-family: monospace; font-size: 12px; white-space: nowrap;">${emp.phone}</td>
        <td><span style="font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 7px; border-radius: 4px; font-weight: 700; white-space: nowrap;">${emp.department || 'General'}</span></td>
        <td style="color: #64748b; font-size: 12px;">${emp.designation || 'Staff'}</td>
        <td style="color: #64748b; font-size: 12px; white-space: nowrap;">${emp.location || 'Muscat HQ'}</td>
        <td style="white-space: nowrap;"><span class="status-badge active"><span class="badge-dot"></span>Active</span></td>
        <td style="white-space: nowrap;">
          <div style="display: flex; gap: 5px; flex-wrap: nowrap;">
            <button type="button" class="btn-action-view" onclick="selectEmployeeForBroadcast('${emp.id}')" title="Send WhatsApp broadcast announcement to this employee" style="padding: 4px 7px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;">
              <i data-lucide="megaphone" style="width: 12px; height: 12px;"></i>
              <span>Broadcast</span>
            </button>
            <button type="button" class="btn-action-view" onclick="openChatWithEmployee('${emp.phone}', '${emp.name.replace(/'/g, "\\'")}')" title="Open 1-on-1 WhatsApp chat with this employee" style="padding: 4px 7px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;">
              <i data-lucide="message-square" style="width: 12px; height: 12px;"></i>
              <span>Chat</span>
            </button>
            <button type="button" class="btn-action-view" onclick="deleteEmployee('${emp.id}', '${emp.name.replace(/'/g, "\\'")}')" title="Delete employee" style="padding: 4px 7px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; color: #ef4444; border-color: #fecaca; background: #fff5f5;">
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
    if (empSelect._syncCustomDropdown) empSelect._syncCustomDropdown();
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
