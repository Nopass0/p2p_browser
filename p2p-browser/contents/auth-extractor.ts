import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://web.telegram.org/*"],
  all_frames: true
}

// Function to intercept and log XHR responses
function interceptXHR() {
  const XHR = XMLHttpRequest.prototype
  const open = XHR.open
  const send = XHR.send

  XHR.open = function (this: XMLHttpRequest, method: string, url: string) {
    this._url = url
    return open.apply(this, arguments as any)
  }

  XHR.send = function (
    this: XMLHttpRequest,
    postData: Document | XMLHttpRequestBodyInit | null
  ) {
    this.addEventListener("load", function () {
      if (this._url.includes("walletbot.me/api/v1/users/auth")) {
        console.log("Auth response intercepted:", this.responseText)
        try {
          const responseData = JSON.parse(this.responseText)
          if (responseData && responseData.value) {
            chrome.runtime.sendMessage({
              action: "authResponseExtracted",
              token: responseData.value
            })
          } else {
            console.error("Token not found in response:", responseData)
            chrome.runtime.sendMessage({
              action: "authResponseExtracted",
              error: "Token not found in response"
            })
          }
        } catch (error) {
          console.error("Error parsing auth response:", error)
          chrome.runtime.sendMessage({
            action: "authResponseExtracted",
            error: "Error parsing auth response"
          })
        }
      }
    })
    return send.apply(this, arguments as any)
  }
}

// Inject the interception code
const script = document.createElement("script")
script.textContent = `(${interceptXHR.toString()})();`
;(document.head || document.documentElement).appendChild(script)
script.remove()

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "extractAuthResponse") {
    // The response will be sent via the interceptXHR function
    sendResponse({ success: true })
  }
})

console.log("Auth extractor content script loaded")
