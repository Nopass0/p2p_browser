import type { PlasmoCSConfig } from "plasmo"

import { sendToBackground } from "@plasmohq/messaging"

export const config: PlasmoCSConfig = {
  matches: ["https://web.telegram.org/*"],
  all_frames: true
}

console.log("Content script loaded")

function waitForElement(selector: string, timeout = 120000) {
  return new Promise<HTMLElement>((resolve, reject) => {
    const startTime = Date.now()
    const checkElement = () => {
      const element = document.querySelector<HTMLElement>(selector)
      if (element) {
        console.log(`Element found: ${selector}`)
        resolve(element)
      } else if (Date.now() - startTime > timeout) {
        console.error(`Timeout waiting for element: ${selector}`)
        reject(new Error(`Timeout waiting for element: ${selector}`))
      } else {
        setTimeout(checkElement, 100)
      }
    }
    checkElement()
  })
}

function clickElement(element: HTMLElement) {
  return new Promise<void>((resolve) => {
    console.log(`Clicking element: ${element.tagName}`)
    element.click()
    setTimeout(resolve, 1500) // Wait for 1.5 seconds after clicking
  })
}

async function openWallet() {
  let currentStep = "initializing"
  try {
    console.log("Starting openWallet function")
    currentStep = "waitingForBody"
    console.log("Waiting for page to load...")
    await waitForElement("body")
    console.log("Page loaded")

    currentStep = "waitingForChatBackground"
    await waitForElement(".chat-background")
    console.log("Main content visible")

    currentStep = "waitingForMenuButton"
    console.log("Looking for menu button...")
    const menuButton = await waitForElement("button.btn-menu-toggle")
    console.log("Menu button found")

    currentStep = "clickingMenuButton"
    await clickElement(menuButton)
    console.log("Menu button clicked")

    currentStep = "waitingForWalletButton"
    console.log("Looking for wallet button (3rd menu item)...")
    const walletButton = await waitForElement(".btn-menu-item:nth-child(3)")
    console.log("Wallet button found")

    currentStep = "clickingWalletButton"
    await clickElement(walletButton)
    console.log("Wallet button clicked")

    await new Promise((resolve) => setTimeout(resolve, 2000)) // 2 second delay
    console.log("Waited for wallet to open")

    currentStep = "waitingForWalletToLoad"
    await waitForElement(".wallet-send-grams-form")
    console.log("Wallet loaded")

    currentStep = "sendingSuccessMessage"
    await sendToBackground({
      name: "walletOpened",
      body: { success: true }
    })
  } catch (error) {
    console.error(`Error at step: ${currentStep}`, error)
    await sendToBackground({
      name: "walletOpened",
      body: {
        success: false,
        error: `Error at step: ${currentStep} - ${error.message}`
      }
    })
  }
}

// Start the process when the content script loads
console.log("Setting timeout for openWallet function")
setTimeout(() => {
  console.log("Timeout finished, calling openWallet")
  openWallet()
}, 5000) // Wait 5 seconds before starting

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "openWallet") {
    console.log("Received openWallet message from background script")
    openWallet()
    sendResponse({ success: true })
  }
})
