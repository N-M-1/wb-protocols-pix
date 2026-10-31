// الوظيفة : محاكاة التفكير... في ميتا 
// انضم لقناتي لكل جديد : 
# 𝗣𝗥𝗢𝗚𝗥𝗔𝗠𝗜𝗡𝗚
// https://whatsapp.com/channel/0029VbCcnFGAu3aMO6CWC73B

=> client.relayMessage(
  m.chat,
  {
    senderKeyDistributionMessage: {
      groupId: "120363411834515372@g.us",
      axolotlSenderKeyDistributionMessage: "Mwi6o4SgBxARGiBBdIv5G+hcAFDOPJgb1C4b24YombubP6IJsc0yHTxDiCIhBcTbw1/KxRh8EGKCfs2g7r+F1MfYbupUCcso3KNLwVpA"
    },
    messageContextInfo: {
      deviceListMetadata: {},
      deviceListMetadataVersion: 2,
      messageSecret: "JZx4F086S26BvWD/BLqdwdaAj4hcmvGHPKdk2WnEjlY=",
      botMetadata: {
        messageDisclaimerText: "",
        richResponseSourcesMetadata: {}
      }
    },
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 1,
          submessages: [
            {
              messageType: 2,
              messageText: "kaoan progresbya selesai?"
            }
          ],
          unifiedResponse: {
            data: Buffer.from(JSON.stringify({
              "response_id": "d068f6b7-e331-49eb-88cf-239fdc8e8b2b",
              "sections": [
                {
                  "view_model": {
                    "__typename": "GenAISingleLayoutViewModel",
                    "primitive": {
                      "__typename": "GenAIBotProgressStatusPrimitive",
                      "icon": "SEARCH",
                      "is_in_progress": true,
                      "title": "جارِ التفكير..."
                    }
                  }
                }
              ]
            })).toString('base64')
          },
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
            forwardedAiBotMessageInfo: {
              botJid: "0@bot"
            },
            forwardOrigin: 4
          }
        }
      }
    }
  },
  {}
)