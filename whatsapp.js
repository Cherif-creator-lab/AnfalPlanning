require('dotenv').config();
const axios = require('axios');

const ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID;
const RECIPIENT_PHONE = process.env.WA_RECIPIENT_PHONE_NUMBER;

// URL de base pour l'API Graph de Meta (version v18.0 ou supérieure)
const WA_API_URL = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;

// Formatage de la date en français (ex: 2026-05-25 -> Lundi 25 Mai 2026)
function formatFrenchDate(dateStr) {
  try {
    const date = new Date(dateStr);
    const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    let formatted = new Intl.DateTimeFormat('fr-FR', options).format(date);
    // Capitaliser la première lettre
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  } catch (e) {
    return dateStr;
  }
}

/**
 * Envoie un message texte simple
 */
async function sendTextMessage(to, text) {
  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    console.warn("⚠️ API WhatsApp non configurée. Envoi simulé de message texte.");
    console.log(`[SIMULATION WA MESSAGE] À: ${to} | Contenu: "${text}"`);
    return { id: `sim_msg_${Math.random().toString(36).substring(2, 9)}` };
  }

  try {
    const response = await axios.post(
      WA_API_URL,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "text",
        text: { body: text }
      },
      {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data.messages[0];
  } catch (error) {
    console.error("❌ Erreur lors de l'envoi du message WhatsApp texte :", error.response?.data || error.message);
    throw error;
  }
}

/**
 * Envoie le message interactif de planification avec les boutons "Valider" et "Refuser"
 */
async function sendInteractiveButtons(slot) {
  const to = RECIPIENT_PHONE;
  
  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID || !to) {
    console.warn("⚠️ API WhatsApp non configurée. Envoi simulé du message interactif.");
    const simMsgId = `sim_msg_${Math.random().toString(36).substring(2, 9)}`;
    console.log(`[SIMULATION WA BUTTONS] À: ${to}`);
    console.log(`Bonjour Samira. Robot-Planning Info : Chérif a planifié la garde d'Anfal pour le ${formatFrenchDate(slot.date)}.`);
    console.log(`Trajet : École -> Garderie.`);
    console.log(`Récupération à la garderie à ${slot.daycarePickupTime}.`);
    console.log(`[Bouton 1: Valider (id: btn_valider_${slot.id})] [Bouton 2: Refuser (id: btn_refuser_${slot.id})]`);
    return { id: simMsgId };
  }

  const dateFormatted = formatFrenchDate(slot.date);
  const bodyText = `Bonjour Samira. Robot-Planning Info : Chérif a planifié la garde d'Anfal pour le ${dateFormatted}.\n\n` +
                   `📍 Trajet : École -> Garderie\n` +
                   `🕒 Récupération à la garderie : ${slot.daycarePickupTime}\n\n` +
                   `Veuillez valider ou refuser ce créneau via les boutons ci-dessous.`;

  try {
    const response = await axios.post(
      WA_API_URL,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "interactive",
        interactive: {
          type: "button",
          header: {
            type: "text",
            text: "Planning Garde d'Anfal"
          },
          body: {
            text: bodyText
          },
          footer: {
            text: "Robot-Planning - Sans contact direct"
          },
          action: {
            buttons: [
              {
                type: "reply",
                reply: {
                  id: `btn_valider_${slot.id}`,
                  title: "Valider"
                }
              },
              {
                type: "reply",
                reply: {
                  id: `btn_refuser_${slot.id}`,
                  title: "Refuser"
                }
              }
            ]
          }
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data.messages[0];
  } catch (error) {
    console.error("❌ Erreur lors de l'envoi du message interactif WhatsApp :", error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  sendTextMessage,
  sendInteractiveButtons,
  formatFrenchDate
};
