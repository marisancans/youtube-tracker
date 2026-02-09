// Load settings on page load
async function loadSettings() {
  const result = await chrome.storage.local.get('settings')
  const settings = result.settings || {}

  const trackingEnabled = document.getElementById('trackingEnabled') as HTMLInputElement
  const dailyGoal = document.getElementById('dailyGoal') as HTMLInputElement
  const productivityPrompts = document.getElementById('productivityPrompts') as HTMLInputElement
  const promptChance = document.getElementById('promptChance') as HTMLInputElement
  const promptChanceValue = document.getElementById('promptChanceValue') as HTMLSpanElement
  const weeklyReports = document.getElementById('weeklyReports') as HTMLInputElement
  const backendEnabled = document.getElementById('backendEnabled') as HTMLInputElement
  const backendUrl = document.getElementById('backendUrl') as HTMLInputElement
  const userId = document.getElementById('userId') as HTMLInputElement

  trackingEnabled.checked = settings.trackingEnabled ?? true
  dailyGoal.value = String(settings.dailyGoalMinutes ?? 60)
  productivityPrompts.checked = settings.interventionsEnabled?.productivityPrompts ?? true
  
  const chance = Math.round((settings.productivityPromptChance ?? 0.3) * 100)
  promptChance.value = String(chance)
  promptChanceValue.textContent = `${chance}%`
  
  weeklyReports.checked = settings.interventionsEnabled?.weeklyReports ?? true
  backendEnabled.checked = settings.backend?.enabled ?? false
  backendUrl.value = settings.backend?.url ?? ''
  userId.value = settings.backend?.userId ?? ''
}

// Update range display
document.getElementById('promptChance')?.addEventListener('input', (e) => {
  const target = e.target as HTMLInputElement
  const display = document.getElementById('promptChanceValue')
  if (display) display.textContent = `${target.value}%`
})

// Save settings
document.getElementById('saveBtn')?.addEventListener('click', async () => {
  const trackingEnabled = (document.getElementById('trackingEnabled') as HTMLInputElement).checked
  const dailyGoal = parseInt((document.getElementById('dailyGoal') as HTMLInputElement).value) || 60
  const productivityPrompts = (document.getElementById('productivityPrompts') as HTMLInputElement).checked
  const promptChance = parseInt((document.getElementById('promptChance') as HTMLInputElement).value) / 100
  const weeklyReports = (document.getElementById('weeklyReports') as HTMLInputElement).checked
  const backendEnabled = (document.getElementById('backendEnabled') as HTMLInputElement).checked
  const backendUrl = (document.getElementById('backendUrl') as HTMLInputElement).value.trim()
  const userId = (document.getElementById('userId') as HTMLInputElement).value.trim()

  const result = await chrome.storage.local.get('settings')
  const current = result.settings || {}

  const updated = {
    ...current,
    trackingEnabled,
    dailyGoalMinutes: dailyGoal,
    interventionsEnabled: {
      productivityPrompts,
      weeklyReports,
    },
    productivityPromptChance: promptChance,
    backend: {
      ...current.backend,
      enabled: backendEnabled,
      url: backendUrl,
      userId: userId || crypto.randomUUID(),
    },
  }

  await chrome.storage.local.set({ settings: updated })

  const status = document.getElementById('status')
  if (status) {
    status.textContent = 'Settings saved!'
    status.className = 'status success'
    setTimeout(() => {
      status.className = 'status'
    }, 2000)
  }
})

// Init
loadSettings()
