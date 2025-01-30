import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://web.telegram.org/*", "https://walletbot.me/*"]
}

function openWallet(username: string = "wallet") {
  const currentUrl = window.location.href
  const walletUrl = `https://web.telegram.org/k/#?tgaddr=tg%3A%2F%2Fresolve%3Fdomain%3D${username}%26attach%3Dwallet`

  if (currentUrl !== walletUrl) {
    window.location.href = walletUrl
  }

  // Wait for and click the popup button if it appears
  const popupButtonObserver = new MutationObserver((mutations, observer) => {
    const popupButton = document.querySelector(".popup-button") as HTMLElement
    if (popupButton) {
      popupButton.click()
      observer.disconnect()
    }
  })

  popupButtonObserver.observe(document.body, {
    childList: true,
    subtree: true
  })
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "openWallet") {
    openWallet(message.username)
    sendResponse({ success: true })
  }
})

console.log("Wallet opener content script loaded")
