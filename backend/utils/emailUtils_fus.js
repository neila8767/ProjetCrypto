

// services/emailService.js
const nodemailer = require('nodemailer');

// Configuration du transporteur Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER, // ton email@gmail.com
    pass: process.env.GMAIL_APP_PASSWORD // le mot de passe d'application
  }
});



// Fonction pour envoyer un email d'activation
async function sendActivationEmail(email, activationToken) {
    
  const activationLink = `http://localhost:3000/api/fus/activate?token=${activationToken}`;
  
  const mailOptions = {
    from: `"DriveSECURE" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: '🔐 Active ton compte DriveSECURE',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Activation DriveSECURE</title>
        <style>
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background: white;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px;
            text-align: center;
          }
          .header h1 {
            color: white;
            margin: 0;
            font-size: 28px;
          }
          .content {
            padding: 40px;
            text-align: center;
          }
          .content p {
            color: #666;
            line-height: 1.6;
            margin-bottom: 30px;
          }
          .button {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white !important;
            text-decoration: none;
            padding: 14px 32px;
            border-radius: 50px;
            font-weight: 600;
            margin: 20px 0;
            transition: transform 0.2s;
          }
          .button:hover {
            transform: translateY(-2px);
          }
          .footer {
            background: #f8f9fa;
            padding: 20px;
            text-align: center;
            font-size: 12px;
            color: #999;
          }
          .warning {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 12px;
            margin: 20px 0;
            font-size: 12px;
            color: #856404;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 DriveSECURE</h1>
          </div>
          <div class="content">
            <h2>Bienvenue sur DriveSECURE !</h2>
            <p>
              Merci de vous être inscrit. Pour commencer à utiliser DriveSECURE 
              et profiter du chiffrement de bout en bout, veuillez activer votre compte.
            </p>
            <a href="${activationLink}" class="button">✅ Activer mon compte</a>
            <p style="font-size: 14px; color: #888;">
              Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
              <a href="${activationLink}" style="color: #667eea;">${activationLink}</a>
            </p>
            <div class="warning">
              ⚠️ Ce lien expirera dans 24 heures.
            </div>
          </div>
          <div class="footer">
            <p>DriveSECURE - Chiffrement de bout en bout pour vos fichiers</p>
            <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Bienvenue sur DriveSECURE ! Active ton compte : ${activationLink}`
  };
  
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email envoyé:', info.messageId);
    return info;
  } catch (error) {
    console.error('Erreur envoi email:', error);
    throw error;
  }
}

// Email de confirmation après activation
async function sendConfirmationEmail(email) {
  const mailOptions = {
    from: `"DriveSECURE" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: '✅ Compte DriveSECURE activé !',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
        <h2>🎉 Félicitations !</h2>
        <p>Votre compte DriveSECURE a été activé avec succès.</p>
        <p>Vos certificats ont été générés et sont prêts à être utilisés.</p>
        <p>Vous pouvez maintenant vous connecter et profiter du stockage chiffré de bout en bout.</p>
        <a href="http://localhost:5173/login" style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">Se connecter</a>
      </div>
    `
  };
  
  await transporter.sendMail(mailOptions);
}


// Fonction pour envoyer un OTP (2FA)
async function sendOTPEmail(email, otp) {
  const mailOptions = {
    from: `"DriveSECURE" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: '🔐 Code de vérification DriveSECURE',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Code de vérification</title>
        <style>
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background: white;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 30px;
            text-align: center;
          }
          .code {
            font-size: 36px;
            font-weight: bold;
            letter-spacing: 5px;
            background: #f0f0f0;
            padding: 20px;
            border-radius: 10px;
            display: inline-block;
            margin: 20px 0;
            font-family: monospace;
          }
          .content {
            padding: 40px;
            text-align: center;
          }
          .footer {
            background: #f8f9fa;
            padding: 20px;
            text-align: center;
            font-size: 12px;
            color: #999;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="color: white;">🔐 DriveSECURE</h1>
          </div>
          <div class="content">
            <h2>Code de vérification</h2>
            <p>Votre code de connexion à deux facteurs est :</p>
            <div class="code">${otp}</div>
            <p>Ce code expirera dans 10 minutes.</p>
            <p style="font-size: 14px; color: #888;">
              Si vous n'avez pas demandé ce code, ignorez cet email.
            </p>
          </div>
          <div class="footer">
            <p>DriveSECURE - Sécurisez vos données avec le chiffrement de bout en bout</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Votre code de vérification DriveSECURE est : ${otp}. Valable 10 minutes.`
  };
  
  return transporter.sendMail(mailOptions);
}

// Fonction pour envoyer un email de réinitialisation de mot de passe
async function sendResetPasswordEmail(email, resetToken) {
  const resetLink = `http://localhost:3000/reset-password?token=${resetToken}`;
  
  const mailOptions = {
    from: `"DriveSECURE" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: '🔐 Réinitialisation de votre mot de passe DriveSECURE',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Réinitialisation mot de passe</title>
        <style>
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background: white;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px;
            text-align: center;
          }
          .content {
            padding: 40px;
            text-align: center;
          }
          .button {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white !important;
            text-decoration: none;
            padding: 14px 32px;
            border-radius: 50px;
            font-weight: 600;
            margin: 20px 0;
          }
          .warning {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 12px;
            margin: 20px 0;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="color: white;">🔐 DriveSECURE</h1>
          </div>
          <div class="content">
            <h2>Réinitialisation du mot de passe</h2>
            <p>Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous :</p>
            <a href="${resetLink}" class="button">🔄 Réinitialiser mon mot de passe</a>
            <div class="warning">
              ⚠️ Ce lien expirera dans 1 heure.
            </div>
            <p style="font-size: 14px; color: #888;">
              Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
            </p>
          </div>
          <div class="footer">
            <p>DriveSECURE - Sécurisez vos données avec le chiffrement de bout en bout</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Réinitialisez votre mot de passe DriveSECURE : ${resetLink}`
  };
  
  return transporter.sendMail(mailOptions);
}

// Fonction pour envoyer un email de partage de fichier
async function sendShareFileEmail(email, filename, sharedBy, shareLink) {
  const mailOptions = {
    from: `"DriveSECURE" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: `📁 ${sharedBy} a partagé un fichier avec vous`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Partage de fichier - DriveSECURE</title>
        <style>
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background: white;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 30px;
            text-align: center;
          }
          .header h1 {
            color: white;
            margin: 0;
            font-size: 28px;
          }
          .content {
            padding: 40px;
            text-align: center;
          }
          .file-info {
            background: #f0f0f0;
            border-radius: 10px;
            padding: 15px;
            margin: 20px 0;
            text-align: left;
          }
          .file-info p {
            margin: 8px 0;
          }
          .button {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white !important;
            text-decoration: none;
            padding: 14px 32px;
            border-radius: 50px;
            font-weight: 600;
            margin: 20px 0;
            transition: transform 0.2s;
          }
          .button:hover {
            transform: translateY(-2px);
          }
          .footer {
            background: #f8f9fa;
            padding: 20px;
            text-align: center;
            font-size: 12px;
            color: #999;
          }
          .warning {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 12px;
            margin: 20px 0;
            font-size: 12px;
            color: #856404;
            text-align: left;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 DriveSECURE</h1>
          </div>
          <div class="content">
            <h2>📁 Fichier partagé</h2>
            <p><strong>${sharedBy}</strong> a partagé un fichier avec vous sur DriveSECURE.</p>
            
            <div class="file-info">
              <p><strong>📄 Fichier :</strong> ${filename}</p>
              <p><strong>👤 Partagé par :</strong> ${sharedBy}</p>
              <p><strong>🔒 Chiffrement :</strong> Bout en bout</p>
            </div>
            
            <a href="${shareLink}" class="button">📥 Accepter et télécharger</a>
            
            <div class="warning">
              ⚠️ Ce lien expirera dans 7 jours. Une fois accepté, le fichier sera ajouté à votre espace DriveSECURE.
            </div>
            
            <p style="font-size: 14px; color: #888; margin-top: 20px;">
              Si vous n'avez pas de compte DriveSECURE, vous devrez en créer un avec cette adresse email pour accepter le partage.
            </p>
          </div>
          <div class="footer">
            <p>DriveSECURE - Chiffrement de bout en bout pour vos fichiers</p>
            <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `${sharedBy} a partagé le fichier "${filename}" avec vous. Acceptez le partage ici : ${shareLink}`
  };
  
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('📧 Email de partage envoyé:', info.messageId);
    return info;
  } catch (error) {
    console.error('❌ Erreur envoi email de partage:', error);
    throw error;
  }
}

module.exports = {
  sendShareFileEmail,
  sendActivationEmail,
  sendOTPEmail,
  sendResetPasswordEmail,
  sendConfirmationEmail
};