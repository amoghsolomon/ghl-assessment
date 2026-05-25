# HighLevel Custom JS Injection

Reference snippet for adding the Observability tab to the HighLevel Voice AI dashboard/logs screen.

Paste this into the HighLevel Custom JS integration and replace the two config values at the top:

- `API_ORIGIN`: public origin for the Hono API, for example an ngrok or deployed API origin.
- `APP_ID`: HighLevel Marketplace app id used by `window.exposeSessionDetails(appId)`.

The script loads the compiled web component from `/widget/observability-copilot.js`, adds an `Observability` tab beside the existing Voice AI dashboard/logs subtabs, and mounts `<observability-copilot>` only while that tab is active.

```js
(() => {
  const CONFIG = {
    API_ORIGIN: 'https://your-public-api-origin',
    APP_ID: 'your-marketplace-app-id',
    WIDGET_PATH: '/widget/observability-copilot.js',
    TARGET_PATH: '/ai-agents/voice-ai',
    TAB_LABEL: 'Observability',
    MOUNT_ID: 'ghl-observability-copilot-root',
    SCRIPT_ID: 'ghl-observability-copilot-script',
  }

  const state = {
    active: false,
    nativePanel: null,
    nativePanelDisplay: '',
    observer: null,
  }

  const styles = `
    .ghl-observability-tab {
      align-items: center;
      background: transparent;
      border: 0;
      border-bottom: 2px solid transparent;
      color: inherit;
      cursor: pointer;
      display: inline-flex;
      font: inherit;
      min-height: 36px;
      padding: 8px 14px;
      white-space: nowrap;
    }

    .ghl-observability-tab:hover {
      color: #18a058;
    }

    .ghl-observability-tab.is-active {
      border-bottom-color: #18a058;
      color: #18a058;
      font-weight: 600;
    }

    #${CONFIG.MOUNT_ID} {
      width: 100%;
    }
  `

  function isVoiceAiPage() {
    return window.location.pathname.includes(CONFIG.TARGET_PATH)
  }

  function apiOrigin() {
    return CONFIG.API_ORIGIN.replace(/\/$/, '')
  }

  function loadWidget() {
    if (document.getElementById(CONFIG.SCRIPT_ID)) {
      return
    }

    const script = document.createElement('script')
    script.id = CONFIG.SCRIPT_ID
    script.type = 'module'
    script.src = `${apiOrigin()}${CONFIG.WIDGET_PATH}`
    document.head.appendChild(script)
  }

  function installStyles() {
    if (document.getElementById('ghl-observability-copilot-style')) {
      return
    }

    const style = document.createElement('style')
    style.id = 'ghl-observability-copilot-style'
    style.textContent = styles
    document.head.appendChild(style)
  }

  function textOf(element) {
    return (element?.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  }

  function findDashboardSubtabList() {
    const tabLists = Array.from(document.querySelectorAll('[role="tablist"], .n-tabs-nav-scroll-content, .n-tabs-nav'))

    return tabLists.find((tabList) => {
      const text = textOf(tabList)
      return text.includes('inbound') && text.includes('outbound')
    })
  }

  function findNativePanel(tabList) {
    const tabRoot =
      tabList.closest('.n-tabs') ??
      tabList.closest('[class*="tabs"]') ??
      tabList.parentElement?.parentElement ??
      null

    if (!tabRoot) {
      return null
    }

    const panels = Array.from(tabRoot.querySelectorAll('.n-tab-pane, [role="tabpanel"], .n-tabs-pane-wrapper'))
    return panels.find((panel) => !panel.contains(tabList)) ?? null
  }

  function createTab(tabList) {
    let tab = tabList.querySelector('[data-ghl-observability-tab="true"]')

    if (tab) {
      return tab
    }

    tab = document.createElement('button')
    tab.type = 'button'
    tab.className = 'ghl-observability-tab'
    tab.dataset.ghlObservabilityTab = 'true'
    tab.textContent = CONFIG.TAB_LABEL
    tab.addEventListener('click', activateObservability)

    tabList.appendChild(tab)
    return tab
  }

  function ensureMount(nativePanel) {
    let mount = document.getElementById(CONFIG.MOUNT_ID)

    if (mount) {
      return mount
    }

    mount = document.createElement('div')
    mount.id = CONFIG.MOUNT_ID
    mount.hidden = true

    const component = document.createElement('observability-copilot')
    component.setAttribute('api-base-url', apiOrigin())
    component.setAttribute('app-id', CONFIG.APP_ID)
    mount.appendChild(component)

    nativePanel.insertAdjacentElement('afterend', mount)
    return mount
  }

  function deactivateNativeTabSelection(tabList) {
    const activeClasses = ['n-tabs-tab--active', 'active', 'router-link-active']

    for (const tab of tabList.querySelectorAll('[role="tab"], .n-tabs-tab, button, a')) {
      if (tab.dataset.ghlObservabilityTab === 'true') {
        continue
      }

      tab.setAttribute('aria-selected', 'false')
      activeClasses.forEach((className) => tab.classList.remove(className))
    }
  }

  function activateObservability() {
    const tabList = findDashboardSubtabList()
    const nativePanel = tabList ? findNativePanel(tabList) : null

    if (!tabList || !nativePanel) {
      return
    }

    state.active = true
    state.nativePanel = nativePanel
    state.nativePanelDisplay = nativePanel.style.display || ''

    const tab = createTab(tabList)
    const mount = ensureMount(nativePanel)

    deactivateNativeTabSelection(tabList)
    tab.classList.add('is-active')
    tab.setAttribute('aria-selected', 'true')

    nativePanel.style.display = 'none'
    mount.hidden = false
  }

  function deactivateObservability() {
    const tab = document.querySelector('[data-ghl-observability-tab="true"]')
    const mount = document.getElementById(CONFIG.MOUNT_ID)

    state.active = false

    tab?.classList.remove('is-active')
    tab?.setAttribute('aria-selected', 'false')

    if (mount) {
      mount.hidden = true
    }

    if (state.nativePanel) {
      state.nativePanel.style.display = state.nativePanelDisplay
    }
  }

  function bindNativeTabs(tabList) {
    for (const tab of tabList.querySelectorAll('[role="tab"], .n-tabs-tab, button, a')) {
      if (tab.dataset.ghlObservabilityBound === 'true' || tab.dataset.ghlObservabilityTab === 'true') {
        continue
      }

      tab.dataset.ghlObservabilityBound = 'true'
      tab.addEventListener('click', () => {
        window.setTimeout(deactivateObservability, 0)
      })
    }
  }

  function sync() {
    if (!isVoiceAiPage()) {
      deactivateObservability()
      return
    }

    installStyles()
    loadWidget()

    const tabList = findDashboardSubtabList()
    const nativePanel = tabList ? findNativePanel(tabList) : null

    if (!tabList || !nativePanel) {
      return
    }

    createTab(tabList)
    bindNativeTabs(tabList)
    ensureMount(nativePanel)

    if (state.active) {
      activateObservability()
    }
  }

  function patchHistoryMethod(name) {
    const original = window.history[name]

    window.history[name] = function patchedHistoryMethod(...args) {
      const result = original.apply(this, args)
      window.setTimeout(sync, 250)
      return result
    }
  }

  patchHistoryMethod('pushState')
  patchHistoryMethod('replaceState')
  window.addEventListener('popstate', () => window.setTimeout(sync, 250))

  state.observer = new MutationObserver(() => sync())
  state.observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  })

  sync()
})()
```

If HighLevel changes the tab DOM, update `findDashboardSubtabList()` first. The rest of the snippet is deliberately isolated to the custom tab and mount node.
