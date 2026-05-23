/**
 * start.js — Lance le tunnel SSH + le serveur Node en même temps.
 * Détecte automatiquement la nouvelle URL du tunnel et enregistre
 * le webhook Telegram sans intervention manuelle.
 */
require('dotenv').config();
const { spawn } = require('child_process');
const https = require('https');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PORT = process.env.PORT || 3000;

let serverProcess = null;
let tunnelUrl = null;
let webhookRegistered = false;

// ─── Enregistre le webhook Telegram avec la nouvelle URL ───────────────────
function registerWebhook(url) {
  const webhookUrl = `${url}/telegram-webhook`;
  const apiUrl = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;

  https.get(apiUrl, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      const parsed = JSON.parse(data);
      if (parsed.ok) {
        console.log(`\n✅ Webhook Telegram mis à jour → ${webhookUrl}\n`);
        webhookRegistered = true;
      } else {
        console.error('❌ Erreur webhook Telegram :', parsed);
      }
    });
  }).on('error', (e) => console.error('❌ Impossible d\'appeler l\'API Telegram :', e.message));
}

// ─── Lance le tunnel localhost.run ─────────────────────────────────────────
console.log('🌐 Démarrage du tunnel localhost.run...');
const tunnel = spawn('ssh', [
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ServerAliveInterval=30',
  '-o', 'ServerAliveCountMax=3',
  '-R', `80:localhost:${PORT}`,
  'nokey@localhost.run'
], { stdio: ['ignore', 'pipe', 'pipe'] });

tunnel.stdout.on('data', (data) => {
  const text = data.toString();
  process.stdout.write(text);

  // Détecter la nouvelle URL dès qu'elle apparaît dans la sortie
  const match = text.match(/https:\/\/([a-f0-9]+\.lhr\.life)/);
  if (match && !webhookRegistered) {
    tunnelUrl = `https://${match[1]}`;
    console.log(`\n🔗 Nouvelle URL tunnel détectée : ${tunnelUrl}`);
    // Attendre 2s que le tunnel soit stable, puis enregistrer le webhook
    setTimeout(() => registerWebhook(tunnelUrl), 2000);
  }
});

tunnel.stderr.on('data', (data) => {
  process.stderr.write(data.toString());
});

tunnel.on('close', (code) => {
  console.log(`\n⚠️  Tunnel fermé (code ${code}). Redémarrez avec: node start.js`);
  if (serverProcess) serverProcess.kill();
  process.exit(1);
});

// ─── Lance le serveur Node ─────────────────────────────────────────────────
console.log('🚀 Démarrage du serveur Node...');
serverProcess = spawn('node', ['server.js'], {
  stdio: 'inherit',
  env: { ...process.env }
});

serverProcess.on('close', (code) => {
  console.log(`\n⚠️  Serveur arrêté (code ${code}).`);
  tunnel.kill();
  process.exit(code);
});

// ─── Gestion propre de l'arrêt ─────────────────────────────────────────────
process.on('SIGINT', () => {
  console.log('\n🛑 Arrêt...');
  if (serverProcess) serverProcess.kill();
  if (tunnel) tunnel.kill();
  process.exit(0);
});
