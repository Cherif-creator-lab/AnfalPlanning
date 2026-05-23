require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
let bot = null;

/**
 * Crée le bot en mode POLLING.
 * Le polling = le serveur va CHERCHER les messages chez Telegram toutes les 2s.
 * Aucun webhook, aucun tunnel, aucune URL publique nécessaire.
 * Fonctionne derrière firewall, NAT, réseau mobile — TOUJOURS.
 */
function initBot(onMessage, onCallbackQuery) {
  if (bot) return bot;
  if (!BOT_TOKEN) {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN manquant. Bot non démarré.');
    return null;
  }

  // Supprimer tout ancien webhook (obligatoire avant de passer en polling)
  const TelegramBotApi = require('node-telegram-bot-api');
  const tempBot = new TelegramBotApi(BOT_TOKEN);
  tempBot.deleteWebHook().then(() => {
    console.log('🧹 Ancien webhook Telegram supprimé.');
  }).catch(() => {});

  // Créer le bot en mode polling
  bot = new TelegramBot(BOT_TOKEN, {
    polling: {
      interval: 2000,      // Vérifie toutes les 2 secondes
      autoStart: true,
      params: { timeout: 30 } // Long polling 30s (économise les requêtes)
    }
  });

  // ── Gestion des messages texte (/start, contre-propositions) ──────────
  bot.on('message', (msg) => {
    if (onMessage) onMessage(msg);
  });

  // ── Gestion des clics sur boutons inline (Valider / Refuser / Proposer)
  bot.on('callback_query', (query) => {
    if (onCallbackQuery) onCallbackQuery(query);
  });

  // ── Gestion des erreurs de polling ─────────────────────────────────────
  bot.on('polling_error', (error) => {
    // Ne pas spammer les logs pour les erreurs réseau temporaires
    if (error.code === 'ETELEGRAM' && error.response && error.response.statusCode === 409) {
      console.warn('⚠️ Conflit polling (une autre instance du bot tourne ?)');
    } else if (error.code === 'EFATAL') {
      console.error('❌ Erreur fatale polling Telegram:', error.message);
    } else {
      console.warn('⚠️ Erreur polling Telegram:', error.message || error.code);
    }
  });

  console.log('✅ Bot Telegram démarré en mode POLLING (pas de tunnel requis)');
  return bot;
}

function getBot() {
  return bot;
}

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
 * Envoie un message texte simple
 */
async function sendTextMessage(chatId, text) {
  if (!bot) { console.warn('⚠️ Bot non démarré.'); return null; }
  try {
    return await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('❌ Erreur envoi message Telegram :', error.message);
    throw error;
  }
}

/**
 * Envoie le message de planification avec les boutons Valider / Refuser
 */
async function sendPlanningButtons(chatId, slot) {
  if (!bot) { console.warn('⚠️ Bot non démarré.'); return null; }

  const pickupDateFr  = formatFrenchDate(slot.pickupDate);
  const dropoffDateFr = formatFrenchDate(slot.dropoffDate);
  const sameDay = slot.pickupDate === slot.dropoffDate;

  const text =
    `🗓️ <b>Planning Garde d'Anfal</b>\n\n` +
    `Bonjour. Chérif a planifié la garde d'Anfal.\n\n` +
    `🏫 <b>Récupération école</b>\n` +
    `   📅 ${pickupDateFr}\n` +
    `   🕒 ${slot.pickupTime}\n\n` +
    `🏠 <b>Dépôt garderie</b>\n` +
    `   📅 ${sameDay ? 'Même jour' : dropoffDateFr}\n` +
    `   🕒 ${slot.dropoffTime}\n\n` +
    `Veuillez valider ou refuser ce créneau :`;

  const opts = {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Valider', callback_data: `valider_${slot.id}` },
        { text: '❌ Refuser', callback_data: `refuser_${slot.id}` }
      ]]
    }
  };

  try {
    const result = await bot.sendMessage(chatId, text, opts);
    console.log(`✅ Message Telegram envoyé à ${chatId}, message_id: ${result.message_id}`);
    return result;
  } catch (error) {
    console.error('❌ Erreur envoi boutons Telegram :', error.message);
    throw error;
  }
}

/**
 * Répond à un callback_query (toast)
 */
async function answerCallbackQuery(callbackQueryId, text) {
  if (!bot) return;
  try {
    await bot.answerCallbackQuery(callbackQueryId, { text, show_alert: false });
  } catch (e) {
    console.warn('⚠️ answerCallbackQuery:', e.message);
  }
}

/**
 * Édite un message — supprime les boutons, affiche le statut final
 */
async function editMessage(chatId, messageId, text) {
  if (!bot) return;
  try {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [] }
    });
    console.log(`✏️ Message ${messageId} édité (boutons supprimés)`);
  } catch (e) {
    console.warn('⚠️ editMessage:', e.message);
  }
}

/**
 * Édite un message avec de nouveaux boutons (pour "Proposer un nouveau créneau")
 */
async function editMessageWithButtons(chatId, messageId, text, buttons) {
  if (!bot) return;
  try {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons }
    });
    console.log(`✏️ Message ${messageId} édité avec nouveaux boutons`);
  } catch (e) {
    console.warn('⚠️ editMessageWithButtons:', e.message);
  }
}

module.exports = {
  initBot,
  getBot,
  sendTextMessage,
  sendPlanningButtons,
  answerCallbackQuery,
  editMessage,
  editMessageWithButtons,
  formatFrenchDate
};
