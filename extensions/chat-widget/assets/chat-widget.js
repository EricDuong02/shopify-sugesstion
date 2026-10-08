(function () {
  'use strict'

  // Defensive guard: never build the widget twice on the same page.
  if (window.__aiChatWidgetLoaded) return
  window.__aiChatWidgetLoaded = true

  var root = document.getElementById('ai-chat-widget-root')
  if (!root) return

  var shop = root.getAttribute('data-shop')
  var apiBase = (root.getAttribute('data-api-base') || '').replace(/\/+$/, '')
  var position = root.getAttribute('data-position') || 'bottom-right'
  var primaryColor = root.getAttribute('data-primary-color') || '#008060'
  var greeting =
    root.getAttribute('data-greeting') || 'Hi! How can I help you?'

  // Not configured yet (merchant has not set the API base URL): render nothing.
  if (!shop || !apiBase) return

  var sessionKey = 'ai-chat-session-' + shop
  var sessionId = null
  try {
    sessionId = localStorage.getItem(sessionKey)
  } catch (e) {
    /* localStorage unavailable */
  }

  var publicToken = null
  var isStreaming = false

  var container, fab, panel, messagesEl, inputEl, sendBtn

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight
  }

  function buildWidget() {
    container = document.createElement('div')
    container.className = 'ai-chat-widget ai-chat-' + position
    container.style.setProperty('--ai-chat-primary', primaryColor)

    fab = document.createElement('button')
    fab.type = 'button'
    fab.className = 'ai-chat-fab'
    fab.setAttribute('aria-label', 'Open chat')
    fab.textContent = '💬'

    panel = document.createElement('div')
    panel.className = 'ai-chat-panel'
    panel.hidden = true

    var header = document.createElement('div')
    header.className = 'ai-chat-header'

    var title = document.createElement('span')
    title.className = 'ai-chat-title'
    title.textContent = 'Shopping assistant'

    var closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.className = 'ai-chat-close'
    closeBtn.setAttribute('aria-label', 'Close chat')
    closeBtn.textContent = '×'

    header.appendChild(title)
    header.appendChild(closeBtn)

    messagesEl = document.createElement('div')
    messagesEl.className = 'ai-chat-messages'
    messagesEl.setAttribute('role', 'log')
    messagesEl.setAttribute('aria-live', 'polite')

    var form = document.createElement('form')
    form.className = 'ai-chat-form'

    inputEl = document.createElement('input')
    inputEl.type = 'text'
    inputEl.className = 'ai-chat-input'
    inputEl.placeholder = 'Ask about a product…'
    inputEl.setAttribute('aria-label', 'Message')

    sendBtn = document.createElement('button')
    sendBtn.type = 'submit'
    sendBtn.className = 'ai-chat-send'
    sendBtn.textContent = 'Send'

    form.appendChild(inputEl)
    form.appendChild(sendBtn)

    panel.appendChild(header)
    panel.appendChild(messagesEl)
    panel.appendChild(form)

    container.appendChild(fab)
    container.appendChild(panel)
    document.body.appendChild(container)

    fab.addEventListener('click', togglePanel)
    closeBtn.addEventListener('click', togglePanel)
    form.addEventListener('submit', function (e) {
      e.preventDefault()
      sendMessage(inputEl.value)
    })
  }

  function togglePanel() {
    const isOpen = panel.hidden
    panel.hidden = !isOpen
    fab.setAttribute('aria-label', isOpen ? 'Close chat' : 'Open chat')
    if (isOpen) inputEl.focus()
  }

  function addUserMessage(text) {
    const el = document.createElement('div')
    el.className = 'ai-chat-msg ai-chat-user'
    const bubble = document.createElement('div')
    bubble.className = 'ai-chat-text'
    bubble.textContent = text
    el.appendChild(bubble)
    messagesEl.appendChild(el)
    scrollToBottom()
  }

  function addAssistantShell() {
    const el = document.createElement('div')
    el.className = 'ai-chat-msg ai-chat-assistant'
    const bubble = document.createElement('div')
    bubble.className = 'ai-chat-text'
    el.appendChild(bubble)
    messagesEl.appendChild(el)
    scrollToBottom()
    return { root: el, textEl: bubble, text: '' }
  }

  function addAssistantText(text) {
    const shell = addAssistantShell()
    shell.text = text
    shell.textEl.textContent = text
  }

  function renderProducts(shell, products) {
    if (!products || !products.length) return

    const wrap = document.createElement('div')
    wrap.className = 'ai-chat-products'

    products.forEach(function (p) {
      const card = document.createElement('a')
      card.className = 'ai-chat-product-card'
      card.href = p.url || '#'
      card.target = '_blank'
      card.rel = 'noopener'

      if (p.imageUrl) {
        const img = document.createElement('img')
        img.src = p.imageUrl
        img.alt = p.title || ''
        img.loading = 'lazy'
        card.appendChild(img)
      }

      const info = document.createElement('div')
      info.className = 'ai-chat-product-info'

      const title = document.createElement('div')
      title.className = 'ai-chat-product-title'
      title.textContent = p.title || 'Product'
      info.appendChild(title)

      if (p.price != null) {
        const price = document.createElement('div')
        price.className = 'ai-chat-product-price'
        price.textContent = String(p.price)
        info.appendChild(price)
      }

      card.appendChild(info)
      wrap.appendChild(card)
    })

    shell.root.insertBefore(wrap, shell.textEl)
    scrollToBottom()
  }

  function streamChat(message, onEvent) {
    return fetch(apiBase + '/api/v1/chat/messages/stream', {
      method: 'POST',
      // text/plain is a CORS-safelisted content type, so the browser
      // sends this as a simple request with no preflight probe. The dev
      // proxy of `shopify app dev` answers OPTIONS itself and drops the
      // CORS headers, which would otherwise block every storefront call.
      // The body is still JSON; the server parses it manually.
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({
        shop: shop,
        publicToken: publicToken,
        sessionId: sessionId,
        message: message,
      }),
    }).then(function (res) {
      if (!res.ok || !res.body) throw new Error('stream failed')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      function pump() {
        return reader.read().then(function (result) {
          if (result.done) return
          buffer += decoder.decode(result.value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop()
          parts.forEach(function (part) {
            const line = part.trim()
            if (line.indexOf('data: ') === 0) {
              try {
                onEvent(JSON.parse(line.slice(6)))
              } catch (e) {
                /* ignore malformed frame */
              }
            }
          })
          return pump()
        })
      }

      return pump()
    })
  }

  function sendMessage(rawText) {
    const text = (rawText || '').trim()
    if (isStreaming || !text || !publicToken) return

    addUserMessage(text)
    inputEl.value = ''
    isStreaming = true
    sendBtn.disabled = true

    const shell = addAssistantShell()
    let gotToken = false

    function finish() {
      isStreaming = false
      sendBtn.disabled = false
      scrollToBottom()
    }

    streamChat(text, function (event) {
      if (event.type === 'products') {
        renderProducts(shell, event.products)
      } else if (event.type === 'token') {
        gotToken = true
        shell.text += event.text
        shell.textEl.textContent = shell.text
        scrollToBottom()
      } else if (event.type === 'done') {
        if (event.sessionId) {
          sessionId = event.sessionId
          try {
            localStorage.setItem(sessionKey, sessionId)
          } catch (e) {
            /* localStorage unavailable */
          }
        }
        if (!gotToken && !shell.text) {
          shell.textEl.textContent = '...'
        }
        finish()
      } else if (event.type === 'error') {
        shell.textEl.textContent =
          event.message || 'Something went wrong. Please try again.'
        finish()
      }
    }).catch(function () {
      shell.textEl.textContent = 'Connection failed. Please try again.'
      finish()
    })
  }

  // Bootstrap: only render the widget when the shop has chat enabled.
  fetch(apiBase + '/api/v1/chat/config?shop=' + encodeURIComponent(shop))
    .then(function (res) {
      if (!res.ok) throw new Error('chat not enabled')
      return res.json()
    })
    .then(function (cfg) {
      publicToken = cfg.publicToken
      buildWidget()
      addAssistantText(greeting)
    })
    .catch(function () {
      // Chat is disabled or misconfigured for this shop: render nothing.
    })
})()
