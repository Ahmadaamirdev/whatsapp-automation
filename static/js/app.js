// Al-Haditha Energy WhatsApp System - Application Logic
let currentTab = 'dashboard';
let activePhone = '+923306579717';
let templatesList = [];
let allChats = {};
let allBroadcasts = [];
let pollingInterval = null;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  initIcons();
  setupNavigation();
  loadMetrics();
  loadBroadcasts();
  loadTemplates();
  setupBroadcastStudio();
  setupWhatsAppWebMessaging();
  setupTemplateModal();

  // Bell icon click -> navigate to Messages
  const bell = document.getElementById('notificationBellBtn');
  if (bell) {
    bell.addEventListener('click', () => switchTab('messages'));
  }

  // Periodic polling for incoming messages & metrics every 3 seconds
  pollingInterval = setInterval(() => {
    loadChats(false);
    loadMetrics();
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
    });
  });

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

  const welcomeBlock = document.getElementById('dashboardWelcomeBlock');
  const titleBlock = document.getElementById('pageTitleBlock');
  const pageTitle = document.getElementById('pageTitle');
  const pageSubtitle = document.getElementById('pageSubtitle');

  if (tabName === 'dashboard') {
    document.getElementById('view-dashboard').style.display = 'block';
    if (welcomeBlock) welcomeBlock.style.display = 'block';
    if (titleBlock) titleBlock.style.display = 'none';
    loadMetrics();
    loadBroadcasts();
  } else if (tabName === 'broadcasts') {
    document.getElementById('view-broadcasts').style.display = 'block';
    if (welcomeBlock) welcomeBlock.style.display = 'none';
    if (titleBlock) {
      titleBlock.style.display = 'block';
      pageTitle.textContent = 'WhatsApp Broadcast Studio';
      pageSubtitle.textContent = 'Design, preview, and dispatch official Meta-approved template announcements.';
    }
    loadBroadcasts();
  } else if (tabName === 'messages') {
    document.getElementById('view-messages').style.display = 'flex';
    if (welcomeBlock) welcomeBlock.style.display = 'none';
    if (titleBlock) {
      titleBlock.style.display = 'block';
      pageTitle.textContent = 'WhatsApp Live Conversations';
      pageSubtitle.textContent = 'Real-time two-way WhatsApp live chat powered by Meta Cloud API.';
    }
    loadChats(true);
  } else if (tabName === 'templates') {
    document.getElementById('view-templates').style.display = 'block';
    if (welcomeBlock) welcomeBlock.style.display = 'none';
    if (titleBlock) {
      titleBlock.style.display = 'block';
      pageTitle.textContent = 'Meta Message Templates';
      pageSubtitle.textContent = 'Review template approval statuses and submit new templates directly to Meta.';
    }
    loadTemplatesTable();
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
        headerBadge.style.display = 'inline-block';
        headerBadge.textContent = unreadCount;
      } else {
        headerBadge.style.display = 'none';
      }
    }
    if (sidebarBadge) {
      if (unreadCount > 0) {
        sidebarBadge.style.display = 'inline-block';
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
      <td style="font-weight: 700; color: #059669;">${bc.delivered_pct || 98.2}%</td>
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
      <td style="font-weight: 700; color: #059669;">${bc.delivered_pct || 98.2}%</td>
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

  // Recipient pill selection toggles
  const pillAll = document.getElementById('pillAll');
  const pillDept = document.getElementById('pillDept');
  const pillCustom = document.getElementById('pillCustom');
  const deptWrap = document.getElementById('deptSelectorWrap');
  const phoneWrap = document.getElementById('customPhoneWrap');

  function setRecipientMode(mode) {
    [pillAll, pillDept, pillCustom].forEach(p => p && p.classList.remove('active'));
    if (deptWrap) deptWrap.style.display = 'none';
    if (phoneWrap) phoneWrap.style.display = 'none';

    if (mode === 'all') {
      if (pillAll) pillAll.classList.add('active');
    } else if (mode === 'department') {
      if (pillDept) pillDept.classList.add('active');
      if (deptWrap) deptWrap.style.display = 'block';
    } else if (mode === 'custom') {
      if (pillCustom) pillCustom.classList.add('active');
      if (phoneWrap) phoneWrap.style.display = 'block';
    }
  }

  if (pillAll) pillAll.addEventListener('click', () => setRecipientMode('all'));
  if (pillDept) pillDept.addEventListener('click', () => setRecipientMode('department'));
  if (pillCustom) pillCustom.addEventListener('click', () => setRecipientMode('custom'));

  // Send Broadcast button
  const sendBtn = document.getElementById('sendBroadcastBtn');
  if (sendBtn) {
    sendBtn.addEventListener('click', handleSendBroadcast);
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

  const templateSpecific = variableLabels[selectedName] || [];

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

  if (recipientType === 'department') {
    filterValue = document.getElementById('deptSelectDropdown').value;
  } else if (recipientType === 'custom') {
    testNumber = document.getElementById('customPhoneInput').value.trim();
    if (!testNumber) {
      alert('Please enter a valid WhatsApp test phone number (e.g. +923306579717)');
      return;
    }
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
      alert(`Broadcast Dispatched Successfully!\n\nTarget: ${recipientType === 'custom' ? testNumber : (recipientType === 'department' ? filterValue : 'Everyone')}\nStatus: Delivered via Meta Cloud API.`);
      loadBroadcasts();
      loadMetrics();
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
            <div style="width: 52px; height: 52px; border-radius: 50%; background: #f1f5f9; display: flex; align-items: center; justify-content: center; margin-bottom: 14px; color: #059669;">
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
          <span class="wa-row-time">${chat.last_activity || ''}</span>
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
              <span>${m.time || ''}</span>
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
        <td style="font-weight: 600; color: #059669;">${matches.length} Variables</td>
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

  if (btnOpen) btnOpen.addEventListener('click', () => modal.style.display = 'flex');
  if (btnClose) btnClose.addEventListener('click', () => modal.style.display = 'none');
  if (btnCancel) btnCancel.addEventListener('click', () => modal.style.display = 'none');

  if (btnSubmit) {
    btnSubmit.addEventListener('click', async () => {
      const name = document.getElementById('tplNameInput').value.trim();
      const cat = document.getElementById('tplCategorySelect').value;
      const lang = document.getElementById('tplLangSelect').value;
      const header = document.getElementById('tplHeaderInput').value.trim();
      const body = document.getElementById('tplBodyInput').value.trim();
      const footer = document.getElementById('tplFooterInput').value.trim();
      const exStr = document.getElementById('tplExampleInput').value.trim();

      if (!name || !body) {
        alert('Please fill out the Template Name and Body text.');
        return;
      }

      const examples = exStr ? exStr.split(',').map(s => s.trim()) : [];

      btnSubmit.disabled = true;
      btnSubmit.textContent = 'Submitting to Meta...';

      try {
        const res = await fetch('/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name,
            category: cat,
            language: lang,
            header_text: header || null,
            body_text: body,
            footer_text: footer || null,
            example_variables: examples
          })
        });

        const data = await res.json();
        if (data.success) {
          alert('Template submitted to Meta successfully! Approval usually takes 1-5 minutes.');
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
