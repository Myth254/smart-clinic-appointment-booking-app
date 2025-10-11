import nodemailer from 'nodemailer'

const sendEmail = async (to, subject, html) => {
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true, // true for port 465, false for 587
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: {
        rejectUnauthorized: false, // ignore self-signed certificates
      },
    })

    const mailOptions = {
      from: `"MediBook" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    }

    await transporter.sendMail(mailOptions)
    console.log(`📧 Email sent successfully to ${to}`)
  } catch (error) {
    console.error('❌ Email sending failed:', error.message)
  }
}

export default sendEmail