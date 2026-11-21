// Application state
let currentTab = 'dashboard';
let activePhone = '+923306579717';
let employeesList = [];
let employeePage = 1;
const employeeLimit = 50;
let templatesList = [];
let allChats = [];

// Initialize app on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initIcons();
  setupNavigation();
  loadMetrics();
  loadRecentBroadcasts();
  loadTemplates();
  loadChats();
  loadEmployees();
  setupBroadcastForm();
  setupChatHandlers();
  setupTemplateModal();
  checkMetaStatus();

  // Polling for new chats/messages every 5 seconds
  setInterval(loadChats, 5000);
});

function initIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Tab navigation
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item[data-tab]');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTab = item.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  // Handle hash changes
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    switchTab(hash);
  });
}

function switchTab(tabName) {
  currentTab = tabName;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const activeNav = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
  if (activeNav) activeNav.classList.add('active');

  document.querySelectorAll('.tab-view').forEach(view => view.style.display = 'none');
  
  if (tabName === 'dashboard') {
    document.getElementById('view-dashboard').style.display = 'flex';
  } else if (tabName === 'templates') {
    document.getElementById('view-templates').style.display = 'flex';
    loadTemplatesTable();
  } else if (tabName === 'employees') {
    document.getElementById('view-employees').style.display = 'flex';
    loadEmployees();
  } else if (tabName === 'broadcasts' || tabName === 'delivery-logs') {
    document.getElementById('view-broadcasts').style.display = 'flex';
    loadFullBroadcasts();
  } else if (tabName === 'messages') {
    document.getElementById('view-dashboard').style.display = 'flex';
    document.getElementById('chatMessageInput').focus();
  } else if (tabName === 'settings') {
    document.getElementById('view-settings').style.display = 'flex';
    checkMetaStatus();
  }
  initIcons();
}

// Meta connection status check
async function checkMetaStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    const badge = document.getElementById('metaBadge');
    if (data.connected) {
      badge.style.backgroundColor = '#d1fae5';
      badge.style.color = '#065f46';
      badge.innerHTML = `<i data-lucide="check-circle-2" style="width: 14px; height: 14px;"></i><span>Meta WhatsApp Verified</span>`;
    }
    const phoneInput = document.getElementById('settingsPhone');
    if (phoneInput && data.display_phone_number) {
      phoneInput.value = `${data.display_phone_number} (${data.verified_name || 'Verified'})`;
    }
    initIcons();
  } catch (err) {
    console.error('Error checking Meta status:', err);
  }
}

// Metrics loader
async function loadMetrics() {
  try {
    const res = await fetch('/api/metrics');
    const data = await res.json();
    document.getElementById('metricTotalEmployees').textContent = Number(data.total_employees).toLocaleString();
    document.getElementById('metricTotalBroadcasts').textContent = data.total_broadcasts;
    document.getElementById('metricDeliveryRate').textContent = data.overall_delivery_rate;
    document.getElementById('metricTotalReplies').textContent = data.total_replies;
  } catch (e) {
    console.error('Error loading metrics:', e);
  }
}

// Broadcasts loader
async function loadRecentBroadcasts() {
  try {
    const res = await fetch('/api/broadcasts');
    const data = await res.json();
    const tbody = document.getElementById('recentBroadcastsTableBody');
    tbody.innerHTML = '';

    (data.broadcasts || []).slice(0, 4).forEach(bc => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <i data-lucide="megaphone" style="width: 15px; height: 15px; color: #059669;"></i>
            <span>${bc.date}</span>
          </div>
        </td>
        <td style="font-weight: 600;">${bc.template}</td>
        <td>${Number(bc.recipients_count).toLocaleString()}</td>
        <td>
          <span class="status-pill completed">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: #059669;"></span>
            ${bc.status}
          </span>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="btn-action-view" onclick="alert('Broadcast: ${bc.template}\\nContent: ${bc.content.replace(/'/g, "\\'")}\\nDelivered: ${bc.delivered_pct}% | Read: ${bc.read_pct}%')">View</button>
            <i data-lucide="more-vertical" style="width: 14px; height: 14px; color: #94a3b8; cursor: pointer;"></i>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
    initIcons();
  } catch (err) {
    console.error('Error loading broadcasts:', err);
  }
}

async function loadFullBroadcasts() {
  try {
    const res = await fetch('/api/broadcasts');
    const data = await res.json();
    const tbody = document.getElementById('fullBroadcastsTableBody');
    tbody.innerHTML = '';

    (data.broadcasts || []).forEach(bc => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 700; color: #059669;">${bc.id}</td>
        <td>${bc.date}</td>
        <td style="font-weight: 600;">${bc.template}</td>
        <td>${Number(bc.recipients_count).toLocaleString()} (${bc.recipient_filter})</td>
        <td style="font-weight: 700; color: #059669;">${bc.delivered_pct}%</td>
        <td style="font-weight: 700; color: #0284c7;">${bc.read_pct}%</td>
        <td style="font-weight: 700; color: #9333ea;">${bc.replies_count || 0}</td>
        <td>
          <span class="status-pill completed">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: #059669;"></span>
            ${bc.status}
          </span>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error(e);
  }
}

// Templates loader & form synchronization
async function loadTemplates() {
  try {
    const res = await fetch('/api/templates');
    const data = await res.json();
    templatesList = data.templates || [];
    
    const select = document.getElementById('broadcastTemplateSelect');
    select.innerHTML = '';
    templatesList.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.name;
      opt.textContent = `${t.name.replace(/_/g, ' ').toUpperCase()} (${t.category})`;
      select.appendChild(opt);
    });

    updateTemplatePreview();
  } catch (err) {
    console.error('Error loading templates:', err);
  }
}

function updateTemplatePreview() {
  const select = document.getElementById('broadcastTemplateSelect');
  const selectedName = select.value;
  const tpl = templatesList.find(t => t.name === selectedName);
  const preview = document.getElementById('broadcastContentPreview');
  const varContainer = document.getElementById('dynamicVariablesContainer');

  if (tpl) {
    const bodyComp = (tpl.components || []).find(c => c.type === 'BODY') || {};
    let text = bodyComp.text || "Dear Team,\nThis is a general announcement from Al Haditha Energy.\nThank you for your continued support.";
    preview.value = text;
    document.getElementById('charCount').textContent = text.length;

    // Detect variables {{1}}, {{2}}
    const matches = text.match(/\{\{\d+\}\}/g);
    if (matches && matches.length > 0) {
      varContainer.style.display = 'flex';
      varContainer.innerHTML = '<span style="font-size: 11px; font-weight: 700; color: #059669;">Dynamic Announcement Variables:</span>';
      matches.forEach((m, idx) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '8px';
        row.style.alignItems = 'center';
        row.innerHTML = `
          <label style="font-size: 11px; font-weight: 700; width: 35px;">${m}:</label>
          <input type="text" class="form-input var-input" data-var="${m}" style="padding: 4px 8px; font-size: 12px;" placeholder="Value for ${m} (e.g. Topic or Notice)" value="${idx === 0 ? 'Team' : (idx === 1 ? 'Notice' : 'Important')}">
        `;
        varContainer.appendChild(row);
      });
    } else {
      varContainer.style.display = 'none';
      varContainer.innerHTML = '';
    }
  }
}

// Setup Broadcast Form
function setupBroadcastForm() {
  const select = document.getElementById('broadcastTemplateSelect');
  select.addEventListener('change', updateTemplatePreview);

  const preview = document.getElementById('broadcastContentPreview');
  preview.addEventListener('input', () => {
    document.getElementById('charCount').textContent = preview.value.length;
  });

  // Radio recipient filter changes
  const radios = document.querySelectorAll('input[name="recipientFilter"]');
  const subSelector = document.getElementById('filterSubSelector');
  const filterDropdown = document.getElementById('filterDropdown');

  radios.forEach(r => {
    r.addEventListener('change', () => {
      if (r.value === 'department') {
        subSelector.style.display = 'block';
        filterDropdown.innerHTML = `
          <option value="HR">HR Department (180)</option>
          <option value="Operations">Operations & Field (420)</option>
          <option value="Engineering">Engineering (310)</option>
          <option value="Logistics">Logistics (250)</option>
          <option value="Site Staff">Site Staff (340)</option>
        `;
      } else if (r.value === 'location') {
        subSelector.style.display = 'block';
        filterDropdown.innerHTML = `
          <option value="Muscat HQ">Muscat HQ</option>
          <option value="Sohar Plant">Sohar Plant</option>
          <option value="Duqm Project Site">Duqm Project Site</option>
          <option value="Salalah Terminal">Salalah Terminal</option>
        `;
      } else {
        subSelector.style.display = 'none';
      }
    });
  });

  // Send Broadcast button click
  const sendBtn = document.getElementById('sendBroadcastBtn');
  sendBtn.addEventListener('click', async () => {
    const selectedTemplate = select.value;
    const bodyContent = preview.value;
    const recipientType = document.querySelector('input[name="recipientFilter"]:checked').value;
    const filterVal = subSelector.style.display !== 'none' ? filterDropdown.value : null;

    // Gather variable values
    const varInputs = document.querySelectorAll('.var-input');
    const variables = Array.from(varInputs).map(inp => inp.value);

    sendBtn.disabled = true;
    sendBtn.innerHTML = `<i data-lucide="loader" style="width: 16px; height: 16px; animation: spin 1s linear infinite;"></i><span>Dispatching...</span>`;

    try {
      const res = await fetch('/api/broadcasts/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_name: selectedTemplate,
          template_language: 'en_US',
          body_text: bodyContent,
          variables: variables,
          recipient_type: recipientType,
          recipient_filter_value: filterVal
        })
      });

      const data = await res.json();
      if (data.success) {
        alert(`Success: ${data.message}`);
        loadRecentBroadcasts();
        loadMetrics();
      } else {
        alert(`Broadcast Error: ${data.message || 'Failed to dispatch'}`);
      }
    } catch (err) {
      alert(`Network error dispatching broadcast: ${err.message}`);
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = `<i data-lucide="send" style="width: 16px; height: 16px;"></i><span>Send Broadcast</span>`;
      initIcons();
    }
  });
}

// Live Chat Handlers
async function loadChats() {
  try {
    const res = await fetch('/api/chats');
    const data = await res.json();
    allChats = data.chats || [];
    renderChatList(allChats);
    if (activePhone) {
      loadActiveChatHistory(activePhone, false);
    }
  } catch (err) {
    console.error('Error loading chats:', err);
  }
}

function renderChatList(chats) {
  const container = document.getElementById('chatListContainer');
  const search = document.getElementById('chatSearchInput').value.toLowerCase();
  
  const filtered = chats.filter(c => 
    c.name.toLowerCase().includes(search) || 
    c.phone.includes(search) ||
    c.last_message.toLowerCase().includes(search)
  );

  container.innerHTML = '';
  filtered.forEach(chat => {
    const item = document.createElement('div');
    item.className = `chat-item ${chat.phone === activePhone ? 'active' : ''}`;
    
    // Initials
    const initials = chat.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const avatarClass = initials === 'SA' ? 'sa' : 'ur';

    item.innerHTML = `
      <div class="chat-avatar ${avatarClass}">${initials}</div>
      <div class="chat-item-info">
        <div class="chat-item-top">
          <span class="chat-item-name">${chat.name}</span>
          <span class="chat-item-time">${chat.last_activity}</span>
        </div>
        <div class="chat-item-bottom">
          <span class="chat-item-snippet">${chat.last_message || 'No messages'}</span>
          ${chat.unread_count > 0 ? `<span class="chat-unread-badge">${chat.unread_count}</span>` : ''}
        </div>
      </div>
    `;

    item.addEventListener('click', () => {
      activePhone = chat.phone;
      document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      loadActiveChatHistory(chat.phone, true);
    });

    container.appendChild(item);
  });
}

async function loadActiveChatHistory(phone, scrollToBottom = true) {
  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(phone)}`);
    const chat = await res.json();
    
    document.getElementById('activeChatName').textContent = chat.name || 'Employee';
    document.getElementById('activeChatRole').textContent = chat.role || 'Employee';
    
    const initials = (chat.name || 'EM').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const avatarEl = document.getElementById('activeChatAvatar');
    avatarEl.textContent = initials;
    avatarEl.className = `chat-avatar ${initials === 'SA' ? 'sa' : 'ur'}`;

    const area = document.getElementById('chatMessagesArea');
    area.innerHTML = '';

    (chat.messages || []).forEach(msg => {
      const bubble = document.createElement('div');
      bubble.className = `message-bubble ${msg.direction}`;
      
      const isOutgoing = msg.direction === 'outgoing';
      bubble.innerHTML = `
        <div>${escapeHtml(msg.text).replace(/\n/g, '<br>')}</div>
        <span class="message-time">
          ${msg.time} ${isOutgoing ? '&#10003;&#10003;' : ''}
        </span>
      `;
      area.appendChild(bubble);
    });

    if (scrollToBottom) {
      area.scrollTop = area.scrollHeight;
    }
  } catch (err) {
    console.error('Error loading chat history:', err);
  }
}

function setupChatHandlers() {
  const searchInput = document.getElementById('chatSearchInput');
  searchInput.addEventListener('input', () => renderChatList(allChats));

  const sendBtn = document.getElementById('chatSendBtn');
  const input = document.getElementById('chatMessageInput');

  async function handleSend() {
    const text = input.value.trim();
    if (!text || !activePhone) return;

    input.value = '';
    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(activePhone)}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text })
      });
      const data = await res.json();
      if (data.success) {
        loadActiveChatHistory(activePhone, true);
        loadChats();
      }
    } catch (e) {
      console.error('Error sending message:', e);
    }
  }

  sendBtn.addEventListener('click', handleSend);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSend();
  });
}

// Templates Table in View Templates
async function loadTemplatesTable() {
  try {
    const res = await fetch('/api/templates');
    const data = await res.json();
    const tbody = document.getElementById('templatesTableBody');
    tbody.innerHTML = '';

    (data.templates || []).forEach(tpl => {
      const tr = document.createElement('tr');
      const bodyComp = (tpl.components || []).find(c => c.type === 'BODY') || {};
      const statusClass = tpl.status === 'APPROVED' ? 'completed' : 'pending';
      const statusColor = tpl.status === 'APPROVED' ? '#059669' : '#f59e0b';
      const audit = tpl.audit || {};
      const auditText = audit.submitted_at 
        ? `<div style="font-size: 11px; color: #64748b; margin-top: 3px;">
             <span>Sent: ${audit.submitted_at}</span>
             ${audit.approved_at ? `<br><span style="color: #059669; font-weight: 600;">Approved: ${audit.approved_at} (${audit.approval_duration})</span>` : '<br><span style="color: #f59e0b;">Waiting for Meta...</span>'}
           </div>`
        : '';
      
      tr.innerHTML = `
        <td style="font-weight: 700; color: #0f172a;">
          ${tpl.name}
          ${auditText}
        </td>
        <td><span style="font-size: 11px; font-weight: 700; background: #f1f5f9; padding: 2px 8px; border-radius: 4px;">${tpl.category}</span></td>
        <td>${tpl.language}</td>
        <td>
          <span class="status-pill" style="background: ${tpl.status === 'APPROVED' ? '#d1fae5' : '#fef3c7'}; color: ${statusColor};">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: ${statusColor};"></span>
            ${tpl.status}
          </span>
        </td>
        <td style="font-weight: 600;">${tpl.variable_count || (bodyComp.text ? (bodyComp.text.match(/\{\{\d+\}\}/g) || []).length : 0)}</td>
        <td style="max-width: 300px; color: #475569; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${escapeHtml(bodyComp.text || '')}
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
  }
}

// Modal for Meta Template Creation
function setupTemplateModal() {
  const modal = document.getElementById('newTemplateModal');
  const btnOpen = document.getElementById('btnOpenNewTemplateModal');
  const btnClose = document.getElementById('btnCloseModal');
  const btnCancel = document.getElementById('btnCancelModal');
  const btnSubmit = document.getElementById('btnSubmitTemplateToMeta');

  btnOpen.addEventListener('click', () => modal.style.display = 'flex');
  btnClose.addEventListener('click', () => modal.style.display = 'none');
  btnCancel.addEventListener('click', () => modal.style.display = 'none');

  btnSubmit.addEventListener('click', async () => {
    const name = document.getElementById('tplNameInput').value.trim();
    const category = document.getElementById('tplCategorySelect').value;
    const language = document.getElementById('tplLangSelect').value;
    const header = document.getElementById('tplHeaderInput').value.trim();
    const body = document.getElementById('tplBodyInput').value.trim();
    const exampleRaw = document.getElementById('tplExampleInput').value.trim();
    const footer = document.getElementById('tplFooterInput').value.trim();

    if (!name || !body) {
      alert('Please fill out the Template Name and Body text.');
      return;
    }

    const examples = exampleRaw ? exampleRaw.split(',').map(s => s.trim()) : [];

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Submitting to Meta...';

    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name,
          category: category,
          language: language,
          header_text: header || null,
          body_text: body,
          footer_text: footer || null,
          example_variables: examples
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Template submitted to Meta successfully!');
        modal.style.display = 'none';
        loadTemplates();
        loadTemplatesTable();
      } else {
        alert(`Meta Submission Error: ${JSON.stringify(data.error || data.message)}`);
      }
    } catch (e) {
      alert(`Submission failed: ${e.message}`);
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Submit to Meta';
    }
  });
}

// Employees Directory (1,500 contacts)
async function loadEmployees() {
  const dept = document.getElementById('employeeDeptFilter').value;
  const search = document.getElementById('employeeSearchInput').value;

  try {
    const res = await fetch(`/api/employees?page=${employeePage}&limit=${employeeLimit}&department=${encodeURIComponent(dept)}&search=${encodeURIComponent(search)}`);
    const data = await res.json();

    // Populate departments filter if empty
    const deptSelect = document.getElementById('employeeDeptFilter');
    if (deptSelect.options.length <= 1 && data.departments) {
      data.departments.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = `${d} Department`;
        deptSelect.appendChild(opt);
      });
    }

    const tbody = document.getElementById('employeesTableBody');
    tbody.innerHTML = '';

    (data.employees || []).forEach(emp => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 700; color: #475569;">${emp.id}</td>
        <td style="font-weight: 600;">${emp.name}</td>
        <td style="font-family: monospace; color: #059669;">${emp.phone}</td>
        <td><span style="background: #f1f5f9; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">${emp.department}</span></td>
        <td style="color: #64748b;">${emp.location}</td>
        <td>
          <span class="status-pill completed">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: #059669;"></span>
            Active
          </span>
        </td>
        <td>
          <button class="btn-action-view" onclick="startDirectChat('${emp.phone}', '${emp.name}', '${emp.department}')">Chat</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    const startIdx = (employeePage - 1) * employeeLimit + 1;
    const endIdx = Math.min(startIdx + (data.employees || []).length - 1, data.total);
    document.getElementById('paginationInfo').textContent = `Showing ${data.total > 0 ? startIdx : 0} to ${endIdx} of ${Number(data.total).toLocaleString()} employees`;

    document.getElementById('prevPageBtn').disabled = employeePage <= 1;
    document.getElementById('nextPageBtn').disabled = endIdx >= data.total;
  } catch (e) {
    console.error('Error loading employees:', e);
  }
}

// Direct chat trigger from employees directory
window.startDirectChat = function(phone, name, dept) {
  activePhone = phone;
  switchTab('dashboard');
  loadActiveChatHistory(phone, true);
  document.getElementById('chatMessageInput').focus();
};

document.getElementById('prevPageBtn').addEventListener('click', () => {
  if (employeePage > 1) {
    employeePage--;
    loadEmployees();
  }
});

document.getElementById('nextPageBtn').addEventListener('click', () => {
  employeePage++;
  loadEmployees();
});

document.getElementById('employeeDeptFilter').addEventListener('change', () => {
  employeePage = 1;
  loadEmployees();
});

document.getElementById('employeeSearchInput').addEventListener('input', () => {
  employeePage = 1;
  loadEmployees();
});

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return (text || '').replace(/[&<>"']/g, m => map[m]);
}
