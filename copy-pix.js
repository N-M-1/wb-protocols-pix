// الوظيفة : زر نسخ الإيميل  
// انضم لقناتي لكل جديد : 
# 𝗣𝗥𝗢𝗚𝗥𝗔𝗠𝗜𝗡𝗚
// https://whatsapp.com/channel/0029VbCcnFGAu3aMO6CWC73B

=> client.relayMessage(
  m.chat,
  {
    interactiveMessage: {
      body: {
        text: "pixel love you"
      },
      footer: {
        text: "pixel love you"
      },
      nativeFlowMessage: {
        buttons: [
          {
            name: "payment_info",
            buttonParamsJson: JSON.stringify({
              "payment_settings": [
                {
                  "type": "pix_static_code",
                  "pix_static_code": {
                    "merchant_name": "pixel love you",
                    "key": "elynn@ampox.com",
                    "key_type": "EMAIL"
                  }
                }
              ],
              "additional_note": "inpox",
              "native_payment_methods": [],
              "share_payment_status": false
            })
          }
        ],
        messageParamsJson: ""
      }
    }
  },
  {
    additionalAttributes: {
      expiration: "7776000"
    },
    additionalNodes: [
      {
        tag: "biz",
        attrs: {
          actual_actors: "2",
          host_storage: "2",
          privacy_mode_ts: "1791287336",
          native_flow_name: "payment_info"
        },
        content: [
          {
            tag: "quality_control",
            attrs: {
              decision_id: "aa0a73becf512dbc7d864220e6fb6c89481a0050",
              source_type: "third_party"
            },
            content: [
              {
                tag: "decision_source",
                attrs: {
                  value: "df"
                }
              }
            ]
          }
        ]
      }
    ]
  }
)