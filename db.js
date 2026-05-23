const fs = require('fs').promises;
const path = require('path');

const DB_FILE = path.join(__dirname, 'slots.json');

// Initialise le fichier de base de données s'il n'existe pas
async function initDb() {
  try {
    await fs.access(DB_FILE);
  } catch (error) {
    await fs.writeFile(DB_FILE, JSON.stringify([], null, 2));
  }
}

// Récupère tous les créneaux
async function getSlots() {
  await initDb();
  const data = await fs.readFile(DB_FILE, 'utf8');
  return JSON.parse(data);
}

// Enregistre tous les créneaux
async function saveSlots(slots) {
  await fs.writeFile(DB_FILE, JSON.stringify(slots, null, 2));
}

// Ajoute un nouveau créneau avec dates complètes
async function addSlot({ pickupDate, pickupTime, dropoffDate, dropoffTime }) {
  const slots = await getSlots();

  const newSlot = {
    id: Math.random().toString(36).substring(2, 9),
    pickupDate,      // YYYY-MM-DD : date récupération école
    pickupTime,      // HH:MM      : heure récupération école
    dropoffDate,     // YYYY-MM-DD : date dépôt garderie
    dropoffTime,     // HH:MM      : heure dépôt garderie
    status: 'PENDING',          // PENDING | CONFIRMED | REJECTED
    counterProposal: null,      // Contre-proposition de la maman (texte libre)
    counterProposalAt: null,
    telegramMsgId: null,
    createdAt: new Date().toISOString(),
    responseAt: null
  };

  slots.push(newSlot);
  await saveSlots(slots);
  return newSlot;
}

// Met à jour le statut d'un créneau
async function updateSlotStatus(id, status, telegramMsgId = null) {
  const slots = await getSlots();
  const slotIndex = slots.findIndex(s => s.id === id);

  if (slotIndex === -1) return null;

  slots[slotIndex].status = status;
  if (telegramMsgId) {
    slots[slotIndex].telegramMsgId = telegramMsgId;
  }
  if (status === 'CONFIRMED' || status === 'REJECTED') {
    slots[slotIndex].responseAt = new Date().toISOString();
  }

  await saveSlots(slots);
  return slots[slotIndex];
}

// Enregistre la contre-proposition de la maman
async function saveCounterProposal(id, proposalText) {
  const slots = await getSlots();
  const slotIndex = slots.findIndex(s => s.id === id);

  if (slotIndex === -1) return null;

  slots[slotIndex].counterProposal = proposalText;
  slots[slotIndex].counterProposalAt = new Date().toISOString();

  await saveSlots(slots);
  return slots[slotIndex];
}

// Récupère un créneau par son ID interne
async function getSlot(id) {
  const slots = await getSlots();
  return slots.find(s => s.id === id) || null;
}

const SETTINGS_FILE = path.join(__dirname, 'settings.json');

// Initialise le fichier de paramètres s'il n'existe pas
async function initSettings() {
  try {
    await fs.access(SETTINGS_FILE);
  } catch (error) {
    const defaultSettings = {
      pereEmail: '',
      mereEmail: '',
      cherifChatId: '',
      samiraChatId: process.env.TELEGRAM_SAMIRA_CHAT_ID || '',
      groupeChatId: ''
    };
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
  }
}

// Récupère les paramètres (adresses e-mail et Chat IDs Telegram)
async function getSettings() {
  await initSettings();
  const data = await fs.readFile(SETTINGS_FILE, 'utf8');
  const settings = JSON.parse(data);
  
  // Migration dynamique si des clés manquent (compatibilité ascendante)
  let changed = false;
  if (settings.cherifChatId === undefined) {
    settings.cherifChatId = '';
    changed = true;
  }
  if (settings.samiraChatId === undefined) {
    settings.samiraChatId = process.env.TELEGRAM_SAMIRA_CHAT_ID || '';
    changed = true;
  }
  if (settings.groupeChatId === undefined) {
    settings.groupeChatId = '';
    changed = true;
  }
  
  if (changed) {
    await saveSettings(settings);
  }
  
  return settings;
}

// Enregistre les paramètres (adresses e-mail et Chat IDs Telegram)
async function saveSettings(settings) {
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  return settings;
}

module.exports = {
  getSlots,
  addSlot,
  updateSlotStatus,
  saveCounterProposal,
  getSlot,
  getSettings,
  saveSettings
};
