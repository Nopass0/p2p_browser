import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://web.telegram.org/*", "https://walletbot.me/*"],
  world: "MAIN"
}

const removeCSP = () => {
  const meta = document.createElement("meta")
  meta.httpEquiv = "Content-Security-Policy"
  meta.content = "default-src * 'unsafe-inline' 'unsafe-eval'"
  document.head.appendChild(meta)
}

removeCSP()

// Intercept and log Telegram Web App events
const originalPostMessage = window.postMessage
window.postMessage = function (message, targetOrigin, transfer) {
  if (
    typeof message === "object" &&
    message.eventType &&
    message.eventType.startsWith("web_app_")
  ) {
    console.log("[Telegram.WebView] >", message.eventType, message.eventData)
  }
  return originalPostMessage.call(this, message, targetOrigin, transfer)
}

console.log("CSP bypasser and event logger loaded")
