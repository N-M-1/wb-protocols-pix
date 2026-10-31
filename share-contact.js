// الوظيفة : رسالة مشاركة جهة الاتصال 
// انضم لقناتي لكل جديد : 
# 𝗣𝗥𝗢𝗚𝗥𝗔𝗠𝗜𝗡𝗚
// https://whatsapp.com/channel/0029VbCcnFGAu3aMO6CWC73B

=> client.relayMessage(
  m.chat,
  {
    senderKeyDistributionMessage: {
      groupId: "120363411834515372@g.us",
      axolotlSenderKeyDistributionMessage: "MwiQlcs1EAEaIIr/P0RRaWBR5UCY2v78Kp3NU6DntGrH7vvwCcQNU2RRIiEFaahVrdBuhV8zu5N85uV1xjmm1+wvpcTpAX9liJEmI18="
    },
    messageContextInfo: {
      messageSecret: "31KQgjmHJcvjp5on8WBL2gSE6tyR1/snVNb3pJe3+Uo="
    },
    interactiveMessage: {
      body: {
        text: "Please share your contact information"
      },
      nativeFlowMessage: {
        buttons: [
          {
            name: "request_contact_info"
          }
        ],
        messageParamsJson: "{}"
      },
      contextInfo: {
        expiration: 7776000,
        disappearingMode: {
          initiator: 0,
          trigger: 0
        }
      }
    }
  },
  {
    additionalNodes: [
      {
        tag: "biz",
        attrs: {},
        content: [
          {
            tag: "interactive",
            attrs: {
              type: "native_flow",
              v: "1"
            },
            content: [
              {
                tag: "native_flow",
                attrs: {
                  name: "request_contact_info"
                }
              }
            ]
          }
        ]
      }
    ]
  }
)