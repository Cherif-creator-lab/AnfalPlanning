require('dotenv').config();
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');

const EMAIL_ENABLED = process.env.EMAIL_ENABLED === 'true';
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

/**
 * Formate la date en français : "Jeudi 3 septembre 2026"
 */
function formatFrenchDate(dateStr) {
  try {
    const date = new Date(dateStr + 'T12:00:00');
    const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    let formatted = new Intl.DateTimeFormat('fr-FR', options).format(date);
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  } catch (e) {
    return dateStr;
  }
}

/**
 * Envoie un e-mail de notification de validation aux deux parents
 * @param {Object} slot - Le créneau validé
 * @param {Object} settings - Les e-mails des parents { pereEmail, mereEmail }
 */
async function sendValidationEmail(slot, settings) {
  const { pereEmail, mereEmail } = settings;
  
  if (!pereEmail && !mereEmail) {
    console.warn("⚠️ Aucun e-mail de parent configuré dans l'IHM. Envoi d'e-mail annulé.");
    return;
  }

  const pickupDateFr = formatFrenchDate(slot.pickupDate);
  const sameDay = slot.pickupDate === slot.dropoffDate;
  const dropoffDateFr = sameDay ? 'Même jour' : formatFrenchDate(slot.dropoffDate);
  const dashboardUrl = `http://localhost:${process.env.PORT || 3000}/`;

  // Construction du corps HTML
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Validation Planning Garde Anfal</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f3f4f6;
      color: #1f2937;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #f3f4f6;
      padding: 30px 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
      border: 1px solid #e5e7eb;
    }
    .header {
      background: linear-gradient(135deg, #0b0f19 0%, #131b2e 100%);
      padding: 40px 30px;
      text-align: center;
      position: relative;
    }
    .logo-container {
      display: inline-block;
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.3);
      padding: 12px;
      border-radius: 12px;
      margin-bottom: 15px;
    }
    .logo-icon {
      font-size: 32px;
      line-height: 1;
    }
    .header h1 {
      color: #ffffff;
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    .header p {
      color: #9ca3af;
      margin: 5px 0 0 0;
      font-size: 14px;
    }
    .content {
      padding: 40px 30px;
    }
    .alert-banner {
      background-color: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.2);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 30px;
      text-align: center;
    }
    .alert-icon {
      font-size: 24px;
      line-height: 1;
      display: block;
      margin-bottom: 4px;
    }
    .alert-text {
      color: #065f46;
      font-weight: 600;
      font-size: 15px;
      margin: 0;
    }
    .details-card {
      background-color: #f9fafb;
      border: 1px solid #f3f4f6;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 30px;
    }
    .details-title {
      font-size: 14px;
      font-weight: 700;
      color: #111827;
      margin-top: 0;
      margin-bottom: 20px;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .journey-row {
      margin-bottom: 20px;
    }
    .journey-row:last-child {
      margin-bottom: 0;
    }
    .journey-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: #6b7280;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }
    .journey-value {
      font-size: 16px;
      color: #1f2937;
      font-weight: 500;
    }
    .journey-time {
      display: inline-block;
      background-color: rgba(99, 102, 241, 0.1);
      color: #4f46e5;
      font-weight: 600;
      font-size: 13px;
      padding: 2px 8px;
      border-radius: 6px;
      margin-left: 8px;
    }
    .journey-arrow {
      height: 20px;
      border-left: 2px dashed #e5e7eb;
      margin-left: 12px;
      margin-top: 4px;
      margin-bottom: 4px;
    }
    .footer {
      background-color: #f9fafb;
      padding: 24px 30px;
      text-align: center;
      border-top: 1px solid #e5e7eb;
    }
    .footer p {
      color: #9ca3af;
      font-size: 12px;
      margin: 0 0 8px 0;
    }
    .footer a {
      color: #6366f1;
      text-decoration: none;
      font-weight: 600;
    }
    .footer a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="logo-container">
          <span class="logo-icon">✨</span>
        </div>
        <h1>Anfal Planning</h1>
        <p>Système de Garde d'Enfant Factuel</p>
      </div>
      <div class="content">
        <div class="alert-banner">
          <span class="alert-icon">✅</span>
          <p class="alert-text">Le planning de garde d'Anfal a été validé !</p>
        </div>
        
        <p style="font-size: 15px; line-height: 1.6; color: #4b5563; margin-bottom: 24px;">
          Bonjour,<br><br>
          Nous vous informons que le créneau de garde de la petite <b>Anfal (7 ans)</b> a été validé par la maman (Samira) depuis son interface Telegram.
        </p>

        <div class="details-card">
          <div class="details-title">🗓️ Détails du planning</div>
          
          <div class="journey-row">
            <div class="journey-label">🏫 Récupération École</div>
            <div class="journey-value">
              ${pickupDateFr} <span class="journey-time">à ${slot.pickupTime}</span>
            </div>
          </div>
          
          <div class="journey-arrow"></div>
          
          <div class="journey-row">
            <div class="journey-label">🏠 Dépôt Garderie</div>
            <div class="journey-value">
              ${dropoffDateFr} <span class="journey-time">à ${slot.dropoffTime}</span>
            </div>
          </div>
        </div>
        
        <p style="font-size: 13px; line-height: 1.5; color: #9ca3af; margin-top: 30px;">
          Cet e-mail automatique a été envoyé aux adresses enregistrées dans le tableau de bord.
        </p>
      </div>
      <div class="footer">
        <p>Anfal Planning Bot &copy; 2026 - Communication sereine et objective.</p>
        <p><a href="${dashboardUrl}">Accéder au Tableau de Bord</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;

  // Construire la liste des destinataires
  const recipients = [];
  if (pereEmail) recipients.push(pereEmail);
  if (mereEmail) recipients.push(mereEmail);
  
  const toHeader = recipients.join(', ');

  // Vérifier si la configuration SMTP est complète
  const useRealSmtp = EMAIL_ENABLED && SMTP_HOST && SMTP_USER && SMTP_PASS;

  if (useRealSmtp) {
    console.log(`✉️ Tentative d'envoi d'e-mail réel à : ${toHeader}`);
    try {
      let transportOpts;
      
      // Si c'est Gmail, on utilise le raccourci Nodemailer 100% robuste
      if (SMTP_HOST && SMTP_HOST.toLowerCase().includes('gmail.com')) {
        console.log("💡 Utilisation du service raccourci Gmail.");
        transportOpts = {
          service: 'gmail',
          auth: {
            user: SMTP_USER,
            pass: SMTP_PASS
          },
          connectionTimeout: 10000, // Timeout de 10s pour éviter de figer
          greetingTimeout: 10000,
          socketTimeout: 10000
        };
      } else {
        // Détection automatique du SSL/TLS sécurisé sur le port 465
        const isSecure = SMTP_PORT === 465 || SMTP_SECURE;
        console.log(`💡 SMTP Config - Hôte: ${SMTP_HOST}, Port: ${SMTP_PORT}, Sécurisé: ${isSecure}`);
        transportOpts = {
          host: SMTP_HOST,
          port: SMTP_PORT,
          secure: isSecure,
          auth: {
            user: SMTP_USER,
            pass: SMTP_PASS
          },
          connectionTimeout: 10000, // Timeout de 10s pour éviter de figer
          greetingTimeout: 10000,
          socketTimeout: 10000
        };
      }

      const transporter = nodemailer.createTransport(transportOpts);

      const info = await transporter.sendMail({
        from: `"Anfal Planning" <${SMTP_USER}>`,
        to: toHeader,
        subject: `✅ Créneau validé : Anfal le ${pickupDateFr}`,
        html: htmlContent
      });

      console.log(`✅ E-mail envoyé avec succès ! Message ID: ${info.messageId}`);
      return info;
    } catch (error) {
      console.error("❌ Erreur lors de l'envoi SMTP réel :", error.message);
      console.log("✏️ Basculement automatique en mode simulation.");
      await writeToSimulation(toHeader, htmlContent, slot.id);
    }
  } else {
    // Mode simulation
    console.log(`✉️ [SIMULATION E-MAIL] SMTP désactivé ou non configuré dans .env`);
    await writeToSimulation(toHeader, htmlContent, slot.id);
  }
}

/**
 * Écrit l'e-mail de simulation dans le dossier scratch
 */
async function writeToSimulation(toHeader, htmlContent, slotId) {
  try {
    const scratchDir = path.join(__dirname, 'scratch');
    await fs.mkdir(scratchDir, { recursive: true });
    
    const simulationFile = path.join(scratchDir, `email_validation_${slotId}.html`);
    const simulationMeta = `<!-- \nDESTINATAIRES: ${toHeader}\nDATE D'ENVOI SIMULÉE: ${new Date().toISOString()}\n-->\n${htmlContent}`;
    
    await fs.writeFile(simulationFile, simulationMeta, 'utf8');
    
    console.log(`💾 E-mail simulé enregistré dans : ${simulationFile}`);
    console.log(`👉 Ouvrez ce fichier dans votre navigateur pour voir le magnifique résultat visuel !`);
  } catch (err) {
    console.error("⚠️ Impossible d'écrire l'e-mail de simulation :", err.message);
  }
}

module.exports = {
  sendValidationEmail
};
