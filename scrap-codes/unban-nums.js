// الوظيفة : فك حظر ارقام  
// انضم لقناتي لكل جديد : 
# 𝗣𝗥𝗢𝗚𝗥𝗔𝗠𝗜𝗡𝗚
// https://whatsapp.com/channel/0029VbCcnFGAu3aMO6CWC73B

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { 
    user: "هنا+ايمايلك", 
    pass: "هنا+باسوورد+الاعمال+ليس+باسوورد+ايمايلك"
  }
});

function generateReportId() {
  return 'WA-APL-' + Date.now().toString().slice(-10);
}

function generateAppealText(phone, reportId) {
  return `
Subject: Urgent Account Ban Appeal - ${phone} - Request ID: ${reportId}

Dear WhatsApp Support Team,

I am writing to formally appeal the restriction placed on my WhatsApp account: ${phone}

Request Reference ID: ${reportId}
Date: ${new Date().toUTCString()}

---
[ENGLISH APPEAL]

Hello WhatsApp Team,

I believe my account ${phone} was banned by mistake. I only use WhatsApp for personal and business communication and I follow all Terms of Service.

Possible reasons: New device login, high message volume, or false report.

Please do a manual review and restore my account. This is impacting my work.

Thank you.

Sincerely,
${phone}

---
[TECHNICAL NOTE FOR ANTI-SPAM TEAM]

Phone: ${phone}
Issue: False Positive Ban
Client: Official WhatsApp
Ban Type: Heuristic Spam Detection
Request: Please clear spam_score and ban flag for this number.
No unofficial clients used. No automation.

Report ID: ${reportId}
  `;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  let { number } = req.query;

  if (!number) {
    return res.status(400).json({ 
      success: false, 
      message: "الاستخدام: ?number=201157009451 او ?number=%2B201157009451" 
    });
  }

  // نضيف + لو مش موجود
  if (!number.startsWith('+')) {
    number = '+' + number;
  }

  const reportId = generateReportId();
  const appealText = generateAppealText(number, reportId);

  try {
    await transporter.sendMail({
      from: `"WhatsApp User" <mrshawdev@gmail.com>`,
      to: "support@support.whatsapp.com",
      subject: `Ban Appeal - ${number} - ${reportId}`,
      text: appealText
    });

    return res.status(200).json({
      success: true,
      result: {
        phone: number,
        report_id: reportId,
        sent_to: "support@support.whatsapp.com",
        message: "تم ارسال طلب فك الحظر بنجاح ✅"
      }
    });

  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}