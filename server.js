require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./db');
const telegram = require('./telegram');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Credentials ──────────────────────────────────────────────────────────────
const APP_USERNAME   = process.env.APP_USERNAME   || 'cherif';
const APP_PASSWORD   = process.env.APP_PASSWORD   || 'Anfal2026!';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-in-env';

let SAMIRA_CHAT_ID = process.env.TELEGRAM_SAMIRA_CHAT_ID || '';

// Contre-propositions en attente
const waitingForCounterProposal = new Map();

// ── Anti brute-force ─────────────────────────────────────────────────────────
const loginAttempts = new Map();
const MAX_ATTEMPTS  = 5;
const LOCK_DURATION = 15 * 60 * 1000;

function checkBruteForce(ip) {
  const now = Date.now();
  const r = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  if (r.lockedUntil > now) return { locked: true };
  return { locked: false };
}
function registerFailedAttempt(ip) {
  const r = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  r.count += 1;
  if (r.count >= MAX_ATTEMPTS) {
    r.lockedUntil = Date.now() + LOCK_DURATION;
    r.count = 0;
    console.warn(`🔒 IP ${ip} bloquée 15 min`);
  }
  loginAttempts.set(ip, r);
}
function resetAttempts(ip) { loginAttempts.delete(ip); }

// ── Middlewares ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: false, maxAge: 8 * 3600000 }
}));

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Non authentifié.' });
  res.redirect('/login.html');
}

// ── Login / Logout ───────────────────────────────────────────────────────────
app.get('/login.html', (req, res) => {
  if (req.session && req.session.authenticated) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  const ip = req.ip;
  const { username, password } = req.body;
  if (checkBruteForce(ip).locked) return res.redirect('/login.html?error=locked');
  if (username === APP_USERNAME && password === APP_PASSWORD) {
    resetAttempts(ip);
    req.session.authenticated = true;
    req.session.username = username;
    console.log(`✅ Connexion réussie : "${username}"`);
    return res.redirect('/');
  }
  registerFailedAttempt(ip);
  console.warn(`❌ Échec connexion : "${username}"`);
  res.redirect('/login.html?error=1');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login.html'));
});

// ── Fichiers statiques protégés ──────────────────────────────────────────────
app.use(requireAuth, express.static(path.join(__dirname, 'public')));

// ── API protégées ────────────────────────────────────────────────────────────
app.get('/api/status', requireAuth, (req, res) => {
  res.json({
    samiraRegistered: !!SAMIRA_CHAT_ID,
    user: req.session.username
  });
});

app.get('/api/slots', requireAuth, async (req, res) => {
  try {
    const slots = await db.getSlots();
    slots.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(slots);
  } catch (e) {
    res.status(500).json({ error: "Erreur récupération créneaux" });
  }
});

app.post('/api/slots', requireAuth, async (req, res) => {
  try {
    const { pickupDate, pickupTime, dropoffDate, dropoffTime } = req.body;
    if (!pickupDate || !pickupTime || !dropoffDate || !dropoffTime) {
      return res.status(400).json({ error: "Tous les champs sont requis." });
    }

    // Charger dynamiquement l'ID Telegram de destination depuis la configuration IHM
    const settings = await db.getSettings();
    const targetChatId = settings.samiraChatId || SAMIRA_CHAT_ID;

    const slot = await db.addSlot({ pickupDate, pickupTime, dropoffDate, dropoffTime });

    let msgSent = false;
    if (targetChatId) {
      try {
        const result = await telegram.sendPlanningButtons(targetChatId, slot);
        if (result && result.message_id) {
          await db.updateSlotStatus(slot.id, 'PENDING', `tg_${result.message_id}`);
          slot.telegramMsgId = result.message_id;
          msgSent = true;
        }
      } catch (tgErr) {
        console.error("⚠️ Envoi Telegram échoué:", tgErr.message);
      }
    } else {
      console.warn("⚠️ Impossible d'envoyer sur Telegram : aucun ID Mère configuré dans l'IHM.");
    }
    res.status(201).json({ message: "Créneau planifié", slot, telegramSent: msgSent });
  } catch (e) {
    console.error("Erreur création:", e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.get('/api/settings', requireAuth, async (req, res) => {
  try {
    const settings = await db.getSettings();
    res.json(settings);
  } catch (e) {
    res.status(500).json({ error: "Erreur récupération paramètres" });
  }
});

app.post('/api/settings', requireAuth, async (req, res) => {
  try {
    const { pereEmail, mereEmail, cherifChatId, samiraChatId } = req.body;
    const settings = await db.saveSettings({ pereEmail, mereEmail, cherifChatId, samiraChatId });
    res.json({ message: "Paramètres sauvegardés", settings });
  } catch (e) {
    res.status(500).json({ error: "Erreur enregistrement paramètres" });
  }
});


// ══════════════════════════════════════════════════════════════════════════════
//  TELEGRAM — Handlers (appelés par le polling, PAS par un webhook)
// ══════════════════════════════════════════════════════════════════════════════

async function handleTelegramMessage(msg) {
  const chatId = String(msg.chat.id);
  const text = msg.text || '';
  const firstName = msg.from.first_name || 'Utilisateur';

  console.log(`📨 Message Telegram de ${firstName} (${chatId}) : "${text}"`);

  // Charger les paramètres actuels
  const settings = await db.getSettings();
  const isSamira = settings.samiraChatId && chatId === String(settings.samiraChatId);
  const isCherif = settings.cherifChatId && chatId === String(settings.cherifChatId);

  // /start → Permet de connaître son identifiant
  if (text === '/start') {
    if (isSamira || isCherif) {
      await telegram.sendTextMessage(chatId,
        `✅ <b>Bonjour ${firstName} !</b>\n\n` +
        `Votre accès est autorisé dans le système de planning d'Anfal.\n\n` +
        `Vous recevrez ici les notifications de planning.\n\n` +
        `<i>Robot-Planning Anfal</i>`
      );
    } else {
      await telegram.sendTextMessage(chatId,
        `🔒 <b>Accès Privé - Robot-Planning Anfal</b>\n\n` +
        `Bonjour ${firstName}. Pour des raisons de sécurité, ce bot est privé.\n\n` +
        `Votre identifiant Telegram (Chat ID) est :\n` +
        `<code>${chatId}</code>\n\n` +
        `👉 Veuillez copier cet identifiant et le renseigner sur votre tableau de bord web dans la section <b>Emails & Sécurité Telegram</b> pour autoriser votre accès.`
      );
    }
    return;
  }

  // Filtrage d'accès strict pour tous les autres messages
  if (!isSamira && !isCherif) {
    console.warn(`🔒 Message de l'utilisateur non autorisé ignoré : ${firstName} (${chatId})`);
    return;
  }

  // Contre-proposition en attente
  if (waitingForCounterProposal.has(chatId)) {
    const slotId = waitingForCounterProposal.get(chatId);
    waitingForCounterProposal.delete(chatId);

    const slot = await db.getSlot(slotId);
    if (!slot) {
      await telegram.sendTextMessage(chatId, "⚠️ Créneau introuvable.");
      return;
    }

    await db.saveCounterProposal(slotId, text);
    await telegram.sendTextMessage(chatId,
      `✅ <b>Contre-proposition enregistrée !</b>\n\n` +
      `📝 "<i>${text}</i>"\n\n` +
      `Chérif la verra sur son tableau de bord.\n\n` +
      `<i>Robot-Planning Anfal</i>`
    );
    console.log(`💬 Contre-proposition créneau ${slotId} : "${text}"`);
    return;
  }
}

async function handleTelegramCallback(query) {
  const chatId = String(query.from.id); // Utilisateur qui a cliqué
  const messageChatId = String(query.message.chat.id); // Chat (groupe ou privé) contenant le message
  const callbackData = query.data;
  const msgId = query.message.message_id;

  console.log(`🔘 Callback : "${callbackData}" de ${chatId}`);

  // Vérifier la sécurité et l'autorisation de l'utilisateur
  const settings = await db.getSettings();
  const isSamira = settings.samiraChatId && chatId === String(settings.samiraChatId);
  const isCherif = settings.cherifChatId && chatId === String(settings.cherifChatId);

  if (!isSamira && !isCherif) {
    console.warn(`🔒 Clic Telegram Callback rejeté de l'utilisateur non autorisé : ${chatId}`);
    await telegram.answerCallbackQuery(query.id, '⚠️ Accès non autorisé !');
    return;
  }

  const parts = callbackData.split('_');
  if (parts.length < 2) return;

  const action = parts[0];
  const slotId = parts.slice(1).join('_');

  // ── Bouton "Proposer un nouveau créneau" ────────────────────────────────
  if (action === 'proposer') {
    waitingForCounterProposal.set(chatId, slotId);
    await telegram.answerCallbackQuery(query.id, '📝 Tapez votre proposition...');
    await telegram.sendTextMessage(chatId,
      `📝 <b>Proposez un nouveau créneau</b>\n\n` +
      `Décrivez votre disponibilité librement :\n` +
      `<i>Ex : "Je peux le vendredi 30 mai, récupération à 16h30 et dépôt à 18h"</i>\n\n` +
      `Tapez votre message ci-dessous :`
    );
    return;
  }

  // ── Valider / Refuser ───────────────────────────────────────────────────
  const slot = await db.getSlot(slotId);
  if (!slot) {
    await telegram.answerCallbackQuery(query.id, "⚠️ Créneau introuvable.");
    return;
  }
  if (slot.status !== 'PENDING') {
    await telegram.answerCallbackQuery(query.id, "ℹ️ Déjà traité.");
    return;
  }

  const newStatus = action === 'valider' ? 'CONFIRMED' : 'REJECTED';
  const updatedSlot = await db.updateSlotStatus(slotId, newStatus);

  // Envoi de l'e-mail de notification de validation aux deux parents
  if (newStatus === 'CONFIRMED' && updatedSlot) {
    const mailer = require('./mailer');
    db.getSettings().then(settings => {
      return mailer.sendValidationEmail(updatedSlot, settings);
    }).catch(err => {
      console.error("⚠️ Échec lors de la notification e-mail :", err.message);
    });
  }


  const pickupDateFr  = telegram.formatFrenchDate(slot.pickupDate);
  const dropoffDateFr = telegram.formatFrenchDate(slot.dropoffDate);
  const sameDay = slot.pickupDate === slot.dropoffDate;

  const emoji = newStatus === 'CONFIRMED' ? '✅' : '❌';
  await telegram.answerCallbackQuery(query.id, `${emoji} ${newStatus === 'CONFIRMED' ? 'Validé !' : 'Refusé.'}`);

  if (newStatus === 'CONFIRMED') {
    const text =
      `✅ <b>Créneau VALIDÉ</b>\n\n` +
      `🏫 Récupération : <b>${pickupDateFr}</b> à <b>${slot.pickupTime}</b>\n` +
      `🏠 Dépôt : <b>${sameDay ? 'Même jour' : dropoffDateFr}</b> à <b>${slot.dropoffTime}</b>\n\n` +
      `<i>Confirmé — Robot-Planning Anfal</i>`;
    await telegram.editMessage(messageChatId, msgId, text);
  } else {
    const text =
      `❌ <b>Créneau REFUSÉ</b>\n\n` +
      `🏫 Récupération : <b>${pickupDateFr}</b> à <b>${slot.pickupTime}</b>\n` +
      `🏠 Dépôt : <b>${sameDay ? 'Même jour' : dropoffDateFr}</b> à <b>${slot.dropoffTime}</b>\n\n` +
      `Souhaitez-vous proposer un autre créneau ?`;
    await telegram.editMessageWithButtons(messageChatId, msgId, text, [
      [{ text: '📅 Proposer un nouveau créneau', callback_data: `proposer_${slotId}` }]
    ]);
  }

  console.log(`💾 Créneau ${slotId} → ${newStatus}`);
}

// ══════════════════════════════════════════════════════════════════════════════
//  DÉMARRAGE
// ══════════════════════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`🚀 Anfal Planning démarré sur http://localhost:${PORT}`);
  console.log(`🔐 Login : ${APP_USERNAME} / [configuré]`);

  // Démarrer le bot Telegram en mode polling
  telegram.initBot(handleTelegramMessage, handleTelegramCallback);

  if (SAMIRA_CHAT_ID) {
    console.log(`📱 Chat ID enregistré : ${SAMIRA_CHAT_ID}`);
  } else {
    console.log(`⏳ En attente de /start sur @AnfalPlanningBot`);
  }
});
