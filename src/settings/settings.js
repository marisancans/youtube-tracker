/**
 * YouTube Detox - Settings Page
 */

const els = {
  dailyGoal: document.getElementById('dailyGoal'),
  productivityPrompts: document.getElementById('productivityPrompts'),
  promptChance: document.getElementById('promptChance'),
  promptChanceVal: document.getElementById('promptChanceVal'),
  promptChanceRow: document.getElementById('promptChanceRow'),
  weeklyReports: document.getElementById('weeklyReports'),
  whitelistTags: document.getElementById('whitelistTags'),
  whitelistInput: document.getElementById('whitelistInput'),
  whitelistAdd: document.getElementById('whitelistAdd'),
  backendEnabled: document.getElementById('backendEnabled'),
  backendFields: document.getElementById('backendFields'),
  backendUrl: document.getElementById('backendUrl'),
  backendUserId: document.getElementById('backendUserId'),
  testConnection: document.getElementById('testConnection'),
  connectionStatus: document.getElementById('connectionStatus'),
  saveStatus: document.getElementById('saveStatus'),
};

let settings = {};

// ===== LOAD =====

function loadSettings() {
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (result) => {
    if (chrome.runtime.lastError || !result) return;
    settings = result;

    // Phase
    const phaseRadio = document.querySelector(`input[name="phase"][value="${settings.phase || 'observation'}"]`);
    if (phaseRadio) phaseRadio.checked = true;

    // Daily goal
    els.dailyGoal.value = settings.dailyGoalMinutes || 60;

    // Interventions
    els.productivityPrompts.checked = settings.interventionsEnabled?.productivityPrompts !== false;
    els.weeklyReports.checked = settings.interventionsEnabled?.weeklyReports !== false;

    // Prompt chance
    const chance = Math.round((settings.productivityPromptChance || 0.3) * 100);
    els.promptChance.value = chance;
    els.promptChanceVal.textContent = chance + '%';
    updatePromptChanceVisibility();

    // Whitelist
    renderWhitelist();

    // Backend
    els.backendEnabled.checked = settings.backend?.enabled || false;
    els.backendUrl.value = settings.backend?.url || '';
    els.backendUserId.value = settings.backend?.userId || '';
    updateBackendVisibility();
  });
}

// ===== SAVE =====

function save() {
  const phase = document.querySelector('input[name="phase"]:checked')?.value || 'observation';

  const updated = {
    ...settings,
    phase,
    dailyGoalMinutes: parseInt(els.dailyGoal.value, 10) || 60,
    interventionsEnabled: {
      productivityPrompts: els.productivityPrompts.checked,
      weeklyReports: els.weeklyReports.checked,
    },
    productivityPromptChance: parseInt(els.promptChance.value, 10) / 100,
    whitelistedChannels: settings.whitelistedChannels || [],
    backend: {
      ...(settings.backend || {}),
      enabled: els.backendEnabled.checked,
      url: els.backendUrl.value.trim(),
      userId: els.backendUserId.value.trim(),
    },
  };

  chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', data: updated }, () => {
    settings = updated;
    showSaveStatus();
  });
}

function showSaveStatus() {
  els.saveStatus.textContent = 'Settings saved';
  els.saveStatus.classList.add('visible');
  setTimeout(() => els.saveStatus.classList.remove('visible'), 2000);
}

// ===== WHITELIST =====

function renderWhitelist() {
  const channels = settings.whitelistedChannels || [];
  els.whitelistTags.innerHTML = '';

  channels.forEach((channel, i) => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = `${channel} <span class="tag-remove" data-index="${i}">&times;</span>`;
    els.whitelistTags.appendChild(tag);
  });

  // Remove handlers
  els.whitelistTags.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index, 10);
      settings.whitelistedChannels.splice(idx, 1);
      renderWhitelist();
      save();
    });
  });
}

function addWhitelistChannel() {
  const channel = els.whitelistInput.value.trim();
  if (!channel) return;

  if (!settings.whitelistedChannels) settings.whitelistedChannels = [];
  if (settings.whitelistedChannels.includes(channel)) return;

  settings.whitelistedChannels.push(channel);
  els.whitelistInput.value = '';
  renderWhitelist();
  save();
}

// ===== VISIBILITY =====

function updatePromptChanceVisibility() {
  els.promptChanceRow.style.display = els.productivityPrompts.checked ? 'flex' : 'none';
}

function updateBackendVisibility() {
  els.backendFields.classList.toggle('visible', els.backendEnabled.checked);
}

// ===== TEST CONNECTION =====

async function testBackendConnection() {
  const url = els.backendUrl.value.trim();
  if (!url) {
    els.connectionStatus.textContent = 'Enter a URL';
    els.connectionStatus.className = 'connection-status error';
    return;
  }

  els.connectionStatus.textContent = 'Testing...';
  els.connectionStatus.className = 'connection-status';

  try {
    const response = await fetch(`${url}/health`, { method: 'GET' });
    if (response.ok) {
      els.connectionStatus.textContent = 'Connected';
      els.connectionStatus.className = 'connection-status success';
    } else {
      els.connectionStatus.textContent = 'Server error: ' + response.status;
      els.connectionStatus.className = 'connection-status error';
    }
  } catch (err) {
    els.connectionStatus.textContent = 'Failed to connect';
    els.connectionStatus.className = 'connection-status error';
  }
}

// ===== EVENT LISTENERS =====

// Auto-save on change
els.dailyGoal.addEventListener('change', save);
els.productivityPrompts.addEventListener('change', () => {
  updatePromptChanceVisibility();
  save();
});
els.promptChance.addEventListener('input', () => {
  els.promptChanceVal.textContent = els.promptChance.value + '%';
});
els.promptChance.addEventListener('change', save);
els.weeklyReports.addEventListener('change', save);
els.backendEnabled.addEventListener('change', () => {
  updateBackendVisibility();
  save();
});
els.backendUrl.addEventListener('change', save);
els.backendUserId.addEventListener('change', save);

// Phase radios
document.querySelectorAll('input[name="phase"]').forEach(radio => {
  radio.addEventListener('change', save);
});

// Whitelist
els.whitelistAdd.addEventListener('click', addWhitelistChannel);
els.whitelistInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addWhitelistChannel();
});

// Test connection
els.testConnection.addEventListener('click', testBackendConnection);

// Init
loadSettings();
