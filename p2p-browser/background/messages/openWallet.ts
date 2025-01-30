import type { PlasmoMessaging } from "@plasmohq/messaging"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  console.log("Received openWallet message")
  res.send({ status: "Message received" })
}

export default handler
