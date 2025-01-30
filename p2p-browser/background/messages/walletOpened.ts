import type { PlasmoMessaging } from "@plasmohq/messaging"

import { sendTokensToRoute } from "../api"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  console.log("Received walletOpened message")
  if (req.body.success) {
    console.log("Wallet opened successfully")
    await sendTokensToRoute()
    res.send({ status: "Tokens sent" })
  } else {
    console.error("Failed to open wallet:", req.body.error)
    res.send({ status: "Failed to open wallet" })
  }
}

export default handler
