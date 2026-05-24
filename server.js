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

    // Charger dynamiquement l'ID Telegram de destination depuis la configuration IHM (priorité au groupe)
    const settings = await db.getSettings();
    const targetChatId = settings.groupeChatId || settings.samiraChatId || SAMIRA_CHAT_ID;

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
    const { pereEmail, mereEmail, cherifChatId, samiraChatId, groupeChatId } = req.body;
    const settings = await db.saveSettings({ pereEmail, mereEmail, cherifChatId, samiraChatId, groupeChatId });
    res.json({ message: "Paramètres sauvegardés", settings });
  } catch (e) {
    res.status(500).json({ error: "Erreur enregistrement paramètres" });
  }
});

app.post('/api/broadcast', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Le message ne peut pas être vide." });
    }

    const users = await db.getRegisteredUsers();
    if (users.length === 0) {
      return res.json({ success: true, sentCount: 0, message: "Aucun utilisateur Telegram n'a encore fait /start." });
    }

    let successCount = 0;
    let failCount = 0;

    for (const user of users) {
      try {
        await telegram.sendTextMessage(user.chatId, message);
        successCount++;
      } catch (err) {
        console.error(`❌ Échec envoi de la diffusion à ${user.firstName} (${user.chatId}) :`, err.message);
        failCount++;
      }
    }

    res.json({
      success: true,
      sentCount: successCount,
      failCount: failCount,
      message: `Message diffusé avec succès à ${successCount} utilisateur(s).${failCount > 0 ? ` (Échec pour ${failCount})` : ''}`
    });
  } catch (e) {
    console.error("Erreur lors de la diffusion :", e);
    res.status(500).json({ error: "Erreur serveur lors de la diffusion." });
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

  // Enregistrer automatiquement l'utilisateur
  const isNew = await db.registerUser(chatId, firstName, msg.from.username);
  if (isNew) {
    console.log(`👤 Nouvel utilisateur Telegram enregistré : ${firstName} (${chatId})`);
  }

  // /start → Message d'accueil chaleureux général
  if (text === '/start') {
    await telegram.sendTextMessage(chatId,
      `✅ <b>Bonjour ${firstName} !</b>\n\n` +
      `Vous êtes bien enregistré(e) dans le système de planning d'Anfal.\n\n` +
      `Vous recevrez ici les notifications et mises à jour importantes concernant la garde.\n\n` +
      `<i>Robot-Planning Anfal</i>`
    );
    return;
  }

  // Contre-proposition en attente (plus de filtrage d'accès restrictif)
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

  // Enregistrer automatiquement l'utilisateur qui clique sur le bouton s'il ne l'est pas déjà
  const clickerName = query.from.first_name || 'Utilisateur';
  await db.registerUser(chatId, clickerName, query.from.username);

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
