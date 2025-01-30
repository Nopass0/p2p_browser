import { useEffect, useState } from "react"

import { Storage } from "@plasmohq/storage"

function IndexPopup() {
  const [tokenData, setTokenData] = useState<string>("")
  const [deviceToken, setDeviceToken] = useState<string>("")
  const [tokenPreview, setTokenPreview] = useState<string>("")
  const [isUpdating, setIsUpdating] = useState<boolean>(false)
  const [updateStatus, setUpdateStatus] = useState<string>("")
  const storage = new Storage()

  useEffect(() => {
    storage.get("deviceToken").then((token) => {
      if (token) setDeviceToken(token)
    })

    chrome.runtime.sendMessage(
      { action: "getTokenFromLocalStorage" },
      (response) => {
        if (response && response.tokenPreview) {
          setTokenPreview(response.tokenPreview)
        }
      }
    )
  }, [])

  const handleOpenWallet = () => {
    setUpdateStatus("Opening wallet and getting new token...")
    chrome.runtime.sendMessage(
      { action: "initiateWalletProcess" },
      (response) => {
        if (response.success) {
          setUpdateStatus("New token received!")
          setTokenPreview(response.token.substring(0, 15) + "...")
          setTimeout(() => setUpdateStatus(""), 2000)
        } else {
          setUpdateStatus("Failed to get new token: " + response.error)
          setTimeout(() => setUpdateStatus(""), 5000)
        }
      }
    )
  }

  const handleSaveDeviceToken = async () => {
    await storage.set("deviceToken", deviceToken)
    setUpdateStatus("Device token saved!")
    setTimeout(() => setUpdateStatus(""), 2000)
  }

  const handleGetToken = () => {
    chrome.runtime.sendMessage(
      { action: "getTokenFromLocalStorage" },
      (response) => {
        if (response) {
          let dataToken = ""
          if (response.accessToken) {
            dataToken += `<span style="color: red; font-size: 15px;">accessToken:</span> <span style="color: #00ab00;">${response.tokenPreview}</span><br>`
          }

          chrome.runtime.sendMessage(
            { action: "getRecordedRequests" },
            (requests) => {
              if (requests && requests.length) {
                requests.forEach((request) => {
                  dataToken += `<span style="color: red; font-size: 15px;">URL:</span> <span style="color: blue;">${request.topLevelUrl}</span><br>`
                })
              }

              setTokenData(dataToken)
              setTokenPreview(response.tokenPreview || "")

              const tokenToCopy =
                response.accessToken || requests[0]?.authorization || ""
              navigator.clipboard
                .writeText(tokenToCopy)
                .then(() => {
                  console.log("Token copied to clipboard")
                })
                .catch((err) => {
                  console.error("Error copying token to clipboard: ", err)
                })
            }
          )
        }
      }
    )
  }

  const handleStartUpdates = () => {
    chrome.runtime.sendMessage(
      { action: "startPeriodicUpdates" },
      (response) => {
        if (response.success) {
          setIsUpdating(true)
          setUpdateStatus("Periodic updates started (every 5 minutes)")
          setTimeout(() => setUpdateStatus(""), 2000)
        }
      }
    )
  }

  const handleStopUpdates = () => {
    chrome.runtime.sendMessage(
      { action: "stopPeriodicUpdates" },
      (response) => {
        if (response.success) {
          setIsUpdating(false)
          setUpdateStatus("Periodic updates stopped")
          setTimeout(() => setUpdateStatus(""), 2000)
        }
      }
    )
  }

  const handleImmediateUpdate = () => {
    setUpdateStatus("Sending immediate update...")
    chrome.runtime.sendMessage(
      { action: "sendImmediateUpdate" },
      (response) => {
        if (response.success) {
          setUpdateStatus("Immediate update sent successfully!")
        } else {
          setUpdateStatus(
            "Update failed: " + (response.error || "Unknown error")
          )
        }
        setTimeout(() => setUpdateStatus(""), 2000)
      }
    )
  }

  return (
    <div style={{ padding: 16, width: 400 }}>
      <h2>Telegram Wallet Token Interceptor</h2>

      <div style={{ marginBottom: 16 }}>
        <button onClick={handleOpenWallet}>Open Wallet & Get New Token</button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          value={deviceToken}
          onChange={(e) => setDeviceToken(e.target.value)}
          placeholder="Device Token"
          style={{ marginRight: 8 }}
        />
        <button onClick={handleSaveDeviceToken}>Save Device Token</button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <button id="getAuth" onClick={handleGetToken}>
          Get and Copy Current Token
        </button>
      </div>

      {tokenPreview && (
        <div style={{ marginBottom: 16 }}>
          <h3>Current Token Preview:</h3>
          <div
            style={{
              backgroundColor: "#f5f5f5",
              padding: 8,
              borderRadius: 4,
              fontFamily: "monospace"
            }}>
            {tokenPreview}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <button
          onClick={isUpdating ? handleStopUpdates : handleStartUpdates}
          style={{ marginRight: 8 }}>
          {isUpdating ? "Stop 5min Updates" : "Start 5min Updates"}
        </button>
        <button onClick={handleImmediateUpdate}>Send Update Now</button>
      </div>

      {updateStatus && (
        <div
          style={{
            marginBottom: 16,
            padding: 8,
            backgroundColor: "#e6ffe6",
            borderRadius: 4
          }}>
          {updateStatus}
        </div>
      )}

      <div>
        <label htmlFor="autoUpdate">
          Enable Automatic Updates:
          <input type="checkbox" id="autoUpdate" />
        </label>
        <p className="text-sm text-gray-600 mt-2">
          Automatic updates occur every 15 minutes when enabled.
        </p>
      </div>

      {tokenData && (
        <div style={{ marginBottom: 16 }}>
          <h3>Token Data:</h3>
          <div dangerouslySetInnerHTML={{ __html: tokenData }} />
        </div>
      )}
    </div>
  )
}

export default IndexPopup
