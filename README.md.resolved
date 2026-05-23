# 🕊️ Anfal Planning - Système de Garde Automatisé & Sans Contact Direct

Ce projet est une solution complète, moderne et épurée conçue spécifiquement pour **Chérif** afin de gérer la planification des gardes de leur fille **Anfal (7 ans)** avec son ex-femme **Samira**.

L'application automatise la communication pour qu'elle reste **100% factuelle, neutre, structurée et sans aucun contact textuel direct**. Chérif propose un créneau depuis son tableau de bord, et Samira reçoit une notification WhatsApp officielle contenant deux boutons interactifs : **Valider** ou **Refuser**. Aucun texte libre n'est échangé.

---

## 🛠️ Architecture du Projet & Fonctionnement

```
   [ Interface Chérif ]           [ Serveur Express Node.js ]          [ Téléphone Samira ]
   +------------------+           +-------------------------+          +------------------+
   |  Saisie Date     |  ----->   |   Sauvegarde locale     |  ----->  | Message WhatsApp |
   |  Saisie Heure    |   POST    |   Base de données JSON  |   API    |  avec 2 boutons  |
   +------------------+           +-------------------------+          +------------------+
            ^                                  |                                |
            |                                  v Webhook                        v Cliks
   [ Dashboard Vert/Rouge ]       [ Événement Clic Bouton   ]  <-----  [ Valider / Refuser]
   +----------------------+       +-------------------------+  POST    +------------------+
```

### Avantages de cette implémentation :
1. **100% Factuelle & Objective** : Tout est enregistré avec date et heure précise (création, réponse).
2. **Aucune dérive textuelle** : Le bot WhatsApp ne gère que les boutons, éliminant les conversations non désirées.
3. **Gratuité totale ou quasi-totale** : 
   - **Mode Simulation** : Entièrement gratuit, fonctionne immédiatement sans aucun compte externe.
   - **Mode Réel** : Meta offre **1000 conversations gratuites par mois** pour les messages initiés par l'utilisateur. Pour les messages d'utilité initiés par le business (le bot), le coût est d'environ 0,03 € par session de 24h, rendant le coût total mensuel dérisoire (généralement moins de 1 € par mois).

---

## 📁 Structure des Fichiers du Projet

Tous les fichiers de démarrage sont générés directement dans ce répertoire :
- `server.js` : Le serveur Express Node.js qui expose les endpoints API et gère le Webhook.
- `db.js` & `slots.json` : Base de données locale légère utilisant un fichier JSON (ultra-rapide pour démarrer sans configurer de base de données externe).
- `whatsapp.js` : Module gérant l'intégration avec l'API officielle de Meta Cloud.
- `public/` : Interface Web interactive (HTML/CSS/JS) conçue avec un design sombre premium, glassmorphism et animations interactives.
- `.env.example` : Modèle de configuration pour relier l'application à de vrais comptes API.

---

## 🚀 Guide de Démarrage Rapide

### 1. Prérequis
Assurez-vous d'avoir installé [Node.js](https://nodejs.org/) (Version 18 ou supérieure recommandée).

### 2. Installation
Ouvrez votre terminal dans ce répertoire de projet et exécutez la commande suivante :
```bash
npm install
```

### 3. Démarrage en Mode Simulation (Sans configuration API Meta)
Pour tester l'application immédiatement et localement sans configurer de compte développeur Meta :
1. Lancez le serveur de développement :
   ```bash
   npm run dev
   ```
2. Ouvrez votre navigateur sur [http://localhost:3000](http://localhost:3000).
3. **Planifiez un créneau** : remplissez la date et l'heure de garderie dans le formulaire de gauche, puis cliquez sur "Envoyer la demande".
4. Le créneau apparaît à droite avec le statut **En attente** (jaune).
5. Un encart spécial **"Simuler la réponse de Samira"** s'affiche sous le créneau.
6. Cliquez sur **Valider** ou **Refuser** : cela simule l'appel webhook que WhatsApp aurait émis. Le statut de votre créneau passe instantanément à **Validé** (Vert) ou **Refusé** (Rouge) avec l'historique d'horodatage !

---

## 📲 Connexion à l'API WhatsApp officielle (Meta Cloud API)

Pour rendre le système actif sur les téléphones réels, suivez ces étapes :

### Étape 1 : Configuration sur Meta Developers
1. Rendez-vous sur [Meta for Developers](https://developers.facebook.com/) et créez un compte.
2. Cliquez sur **Créer une application** -> Sélectionnez le type **Business** (ou "Autre" puis "Business").
3. Nommez votre application (ex: `Anfal Guard Bot`).
4. Dans le tableau de bord de votre application, ajoutez le produit **WhatsApp**.
5. Dans la section **Configuration de départ** de WhatsApp, vous trouverez :
   - Un **Phone Number ID** de test.
   - Un **Numéro de test** fourni par Meta (sandbox).
   - Un **Token temporaire** de 24 heures (utilisé pour vos tests).

### Étape 2 : Configurer vos variables d'environnement
1. Créez un fichier `.env` à la racine de votre projet en copiant `.env.example` :
   ```bash
   copy .env.example .env
   ```
2. Remplissez les clés de configuration avec les données récupérées sur Meta :
   - `WA_PHONE_NUMBER_ID` : Renseignez le Phone Number ID.
   - `WA_ACCESS_TOKEN` : Copiez-collez votre Token temporaire (ou permanent).
   - `WA_VERIFY_TOKEN` : Définissez un mot secret de votre choix (ex: `token_secret_planning`).
   - `WA_RECIPIENT_PHONE_NUMBER` : Indiquez le numéro de Samira (format international, ex: `+33612345678`).
   *Note: En mode Sandbox Meta, vous devez pré-enregistrer le numéro de Samira comme "numéro autorisé" dans la section sandbox de votre console Meta avant de pouvoir lui envoyer des messages de test.*

### Étape 3 : Exposer le webhook avec ngrok
Meta a besoin d'une adresse publique sécurisée (HTTPS) pour envoyer la réponse de Samira (le Webhook).
1. Téléchargez et lancez [ngrok](https://ngrok.com/) sur votre machine locale :
   ```bash
   ngrok http 3000
   ```
2. Ngrok vous fournit une URL HTTPS (ex: `https://a1b2-34-56-78.ngrok-free.app`).
3. Allez dans votre console Meta Developer -> WhatsApp -> **Configuration** :
   - **URL de rappel (Callback URL)** : Indiquez votre adresse ngrok suivie de `/webhook` (ex: `https://a1b2-34-56-78.ngrok-free.app/webhook`).
   - **Jeton de vérification (Verify Token)** : Saisissez la valeur exacte définie dans votre `.env` pour `WA_VERIFY_TOKEN` (ex: `token_secret_planning`).
4. Cliquez sur **Valider et Enregistrer**. Meta va automatiquement appeler votre serveur Express pour valider l'URL.
5. Dans **Champs de webhook**, cliquez sur **Gérer** et abonnez-vous aux événements **`messages`**.

Votre webhook est maintenant connecté ! Dès que Samira cliquera sur un bouton WhatsApp, votre serveur recevra l'information en temps réel, mettra à jour la base de données locale, et lui renverra automatiquement un SMS de remerciement.
