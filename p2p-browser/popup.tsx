import { useEffect, useState } from "react"
import { Storage } from "@plasmohq/storage"
import "./style.css"

interface GateCookie {
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  httpOnly: boolean
  sameSite: string
  expirationDate?: number
}

interface DeviceToken {
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  httpOnly: boolean
  sameSite: string
  expirationDate?: number
}

function IndexPopup() {
  const [telegramToken, setTelegramToken] = useState<string>("")
  const [gateCookies, setGateCookies] = useState<GateCookie[]>([])
  const [deviceToken, setDeviceToken] = useState<DeviceToken | null>(null)
  const [customDeviceToken, setCustomDeviceToken] = useState<string>("")
  const [phoneNumber, setPhoneNumber] = useState<string>("")
  const [idexId, setIdexId] = useState<string>("")
  const [updateInterval, setUpdateInterval] = useState<string>("none")
  const [isUpdating, setIsUpdating] = useState<boolean>(false)
  const [updateStatus, setUpdateStatus] = useState<string>("")
  const storage = new Storage()

  useEffect(() => {
    // Load saved values
    storage.get("phoneNumber").then((phone) => {
      if (phone) setPhoneNumber(phone)
    })
    storage.get("idexId").then((id) => {
      if (id) setIdexId(id)
    })
    storage.get("updateInterval").then((interval) => {
      if (interval) setUpdateInterval(interval)
    })
    storage.get("customDeviceToken").then((token) => {
      if (token) setCustomDeviceToken(token)
    })

    // Get initial token previews
    chrome.runtime.sendMessage(
      { action: "getTokens" },
      (response) => {
        if (response?.telegramToken) {
          setTelegramToken(response.telegramToken)
        }
        if (response?.gateCookies) {
          setGateCookies(response.gateCookies)
        }
        if (response?.deviceToken) {
          setDeviceToken(response.deviceToken)
        }
      }
    )
  }, [])

  const handleOpenWallet = () => {
    setUpdateStatus("Открываем кошелек и получаем новый токен...")
    chrome.runtime.sendMessage(
      { action: "initiateWalletProcess" },
      (response) => {
        if (response?.success) {
          if (response.telegramToken) {
            setTelegramToken(response.telegramToken)
          }
          if (response.gateCookies) {
            setGateCookies(response.gateCookies)
          }
          if (response.deviceToken) {
            setDeviceToken(response.deviceToken)
          }
          setUpdateStatus("Новый токен получен!")
          
          // Send data to endpoints
          sendDataToEndpoints()
          
          setTimeout(() => setUpdateStatus(""), 2000)
        } else {
          setUpdateStatus("Ошибка получения токена: " + (response?.error || "Неизвестная ошибка"))
          setTimeout(() => setUpdateStatus(""), 5000)
        }
      }
    )
  }

  const sendDataToEndpoints = async () => {
    try {
      const data = {
        telegramToken,
        gateCookies,
        deviceToken,
        phoneNumber,
        idexId,
        customDeviceToken
      }

      // Send to localhost
      await fetch('http://localhost:3000/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      // Send to p2p vercel
      await fetch('https://p2p-vercel.vercel.app/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
    } catch (error) {
      console.error('Ошибка отправки данных:', error)
    }
  }

  const handleSaveSettings = async () => {
    await storage.set("phoneNumber", phoneNumber)
    await storage.set("idexId", idexId)
    await storage.set("updateInterval", updateInterval)
    await storage.set("customDeviceToken", customDeviceToken)
    setUpdateStatus("Настройки сохранены!")
    setTimeout(() => setUpdateStatus(""), 2000)
    
    if (updateInterval !== "none") {
      const minutes = updateInterval === "30sec" ? 0.5 : 15
      chrome.runtime.sendMessage(
        { 
          action: "startPeriodicUpdates",
          minutes
        }
      )
      setIsUpdating(true)
    } else {
      chrome.runtime.sendMessage({ action: "stopPeriodicUpdates" })
      setIsUpdating(false)
    }
  }

  const formatTokenPreview = (token: string | undefined | null) => {
    if (!token) return "Не установлен"
    return token.length > 15 ? token.substring(0, 15) + "..." : token
  }

  const getDeviceTokenPreview = () => {
    if (customDeviceToken) {
      return formatTokenPreview(customDeviceToken)
    }
    if (deviceToken && deviceToken.value) {
      return formatTokenPreview(deviceToken.value)
    }
    return "Не установлен"
  }

  return (
    <div className="popup-container">
      <h1 className="title">P2P Менеджер Токенов</h1>
      
      <div className="section">
        <h2>Текущие Токены</h2>
        <div className="token-display">
          <div className="token-item">
            <span>Telegram Токен:</span>
            <code>{formatTokenPreview(telegramToken)}</code>
          </div>
          <div className="token-item">
            <span>Gate Cookies ({gateCookies.length}):</span>
            <code>{gateCookies.length > 0 ? `${gateCookies.length} cookies` : "Не найдены"}</code>
          </div>
          <div className="token-item">
            <span>Device Токен:</span>
            <code>{getDeviceTokenPreview()}</code>
          </div>
        </div>
      </div>

      <div className="section">
        <h2>Настройки</h2>
        <div className="input-group">
          <label>
            Номер телефона:
            <input
              type="text"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="Введите Telegram номер"
            />
          </label>
        </div>
        <div className="input-group">
          <label>
            IDEX ID:
            <input
              type="text"
              value={idexId}
              onChange={(e) => setIdexId(e.target.value)}
              placeholder="Введите IDEX ID"
            />
          </label>
        </div>
        <div className="input-group">
          <label>
            Device Token:
            <input
              type="text"
              value={customDeviceToken}
              onChange={(e) => setCustomDeviceToken(e.target.value)}
              placeholder="Введите Device Token"
            />
          </label>
        </div>
        <div className="input-group">
          <label>
            Интервал обновления:
            <select
              value={updateInterval}
              onChange={(e) => setUpdateInterval(e.target.value)}
            >
              <option value="none">Ручное обновление</option>
              <option value="30sec">Каждые 30 секунд</option>
              <option value="15min">Каждые 15 минут</option>
            </select>
          </label>
        </div>
        <button className="button save-button" onClick={handleSaveSettings}>
          Сохранить настройки
        </button>
      </div>

      <div className="section">
        <h2>Действия</h2>
        <div className="button-group">
          <button
            className={`button update-button ${isUpdating ? 'active' : ''}`}
            onClick={handleOpenWallet}
          >
            Обновить сейчас
          </button>
        </div>
      </div>

      {updateStatus && (
        <div className="status-message">
          {updateStatus}
        </div>
      )}
    </div>
  )
}

export default IndexPopup
