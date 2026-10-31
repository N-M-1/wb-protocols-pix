//  الوظيفة :  رسائل لاتيكس الخاصة بميتا للمعادلات الرياضية
// انضم لقناتي لكل جديد : 
# 𝗣𝗥𝗢𝗚𝗥𝗔𝗠𝗜𝗡𝗚
// https://whatsapp.com/channel/0029VbCcnFGAu3aMO6CWC73B

> (async () =>  {
const submessages = [
    {
    	messageType: 2,
	    messageText: "Shiroko is my bini:\n- Model 1: {{PIXEL_0}}PIXCODE{{/PIXEL_0}}\n- Model 2: {{PIXEL_1}}PIXCODE{{/PIXEL_1}}"
	}
];

const unified = {
  "response_id": "57be79cf-d384-4122-87cc-5f76d8f32f47",
  "sections": [
    {
      "view_model": {
        "primitive": {
          "text": "Shiroko is my bini:\n- Model 1: {{PIXEL_0}}PIXCODE{{/PIXEL_0}}\n- Model 2: {{PIXEL_1}}PIXCODE{{/PIXEL_1}}",
          "inline_entities": [
            {
              "key": "PIXEL_0",
              "metadata": {
                "latex_expression": "PIXCODE",
                "latex_image": {
                  "url": "https://cdn.ornzora.eu.cc/1ca0f9a4-a81f-498e-92e8-8a4c76abf1ef-FIORA.png",
                  "width": 1279,
                  "height": 825
                },
                "font_height": 83.333333333333,
                "padding": 15,
                "__typename": "GenAILatexItem"
              }
            },
            {
              "key": "PIXEL_1",
              "metadata": {
                "latex_expression": "PIXCODE",
                "latex_image": {
                  "url": "https://cdn.ornzora.eu.cc/a3a756f2-6bb8-4814-a024-c325524a2308-FIORA.png",
                  "width": 1429,
                  "height": 1897
                },
                "font_height": 83.333333333333,
                "padding": 15,
                "__typename": "GenAILatexItem"
              }
            }
          ],
          "__typename": "GenAIMarkdownTextUXPrimitive"
        },
        "__typename": "GenAISingleLayoutViewModel"
      }
    }
  ]
}

const content = {
    messageContextInfo: {
        deviceListMetadata: {},
        deviceListMetadataVersion: 2,
        botMetadata: {
            pluginMetadata: {},
            richResponseSourcesMetadata: {}
        }
    },
    botForwardedMessage: {
        message: {
            richResponseMessage: {
                messageType: 1,
                submessages: submessages, 
                unifiedResponse: {
                    data: Buffer.from(JSON.stringify(unified), 'utf-8').toString('base64') 
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
};

await client.relayMessage(m.chat, content, {});
})()