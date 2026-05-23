document.addEventListener('DOMContentLoaded', () => {
  const form           = document.getElementById('planning-form');
  const pickupDateIn   = document.getElementById('pickup-date');
  const pickupTimeIn   = document.getElementById('pickup-time');
  const dropoffDateIn  = document.getElementById('dropoff-date');
  const dropoffTimeIn  = document.getElementById('dropoff-time');
  const slotsContainer = document.getElementById('slots-container');
  const slotCount      = document.getElementById('slot-count');
  const btnSubmit      = document.getElementById('btn-submit');

  // Date min = aujourd'hui
  const today = new Date().toISOString().split('T')[0];
  pickupDateIn.min  = today;
  pickupDateIn.value = today;
  dropoffDateIn.min  = today;
  dropoffDateIn.value = today;

  // Quand la date de récupération change, mettre à jour la date de dépôt par défaut
  pickupDateIn.addEventListener('change', () => {
    if (!dropoffDateIn.value || dropoffDateIn.value < pickupDateIn.value) {
      dropoffDateIn.value = pickupDateIn.value;
    }
    dropoffDateIn.min = pickupDateIn.value;
  });

  // Chargement initial
  fetchSlots();

  // ── Configuration des Emails & Sécurité Telegram ────────────────────────
  const settingsForm = document.getElementById('settings-form');
  const pereEmailIn  = document.getElementById('pere-email');
  const mereEmailIn  = document.getElementById('mere-email');
  const cherifChatIdIn = document.getElementById('cherif-chat-id');
  const samiraChatIdIn = document.getElementById('samira-chat-id');
  const btnSaveSettings = document.getElementById('btn-save-settings');

  async function fetchSettings() {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const settings = await response.json();
        pereEmailIn.value = settings.pereEmail || '';
        mereEmailIn.value = settings.mereEmail || '';
        cherifChatIdIn.value = settings.cherifChatId || '';
        samiraChatIdIn.value = settings.samiraChatId || '';
      }
    } catch (error) {
      console.error('Erreur chargement paramètres:', error);
    }
  }

  fetchSettings();

  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pereEmail = pereEmailIn.value.trim();
    const mereEmail = mereEmailIn.value.trim();
    const cherifChatId = cherifChatIdIn.value.trim();
    const samiraChatId = samiraChatIdIn.value.trim();

    btnSaveSettings.disabled = true;
    const originalHTML = btnSaveSettings.innerHTML;
    btnSaveSettings.innerHTML = '<span>Sauvegarde...</span><div class="spinner" style="width:16px;height:16px;"></div>';

    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pereEmail, mereEmail, cherifChatId, samiraChatId })
      });

      if (!response.ok) throw new Error('Erreur lors de la sauvegarde');

      // Feedback visuel de succès temporaire
      btnSaveSettings.innerHTML = '<span>Sauvegardé ! ✅</span>';
      setTimeout(() => {
        btnSaveSettings.innerHTML = originalHTML;
        btnSaveSettings.disabled = false;
        lucide.createIcons();
      }, 2000);

    } catch (error) {
      alert(`⚠️ Erreur : ${error.message}`);
      btnSaveSettings.disabled = false;
      btnSaveSettings.innerHTML = originalHTML;
      lucide.createIcons();
    }
  });

  // ── Soumission du formulaire ────────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const pickupDate  = pickupDateIn.value;
    const pickupTime  = pickupTimeIn.value;
    const dropoffDate = dropoffDateIn.value;
    const dropoffTime = dropoffTimeIn.value;

    btnSubmit.disabled = true;
    const originalHTML = btnSubmit.innerHTML;
    btnSubmit.innerHTML = '<span>Envoi en cours...</span><div class="spinner" style="width:16px;height:16px;"></div>';

    try {
      const response = await fetch('/api/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pickupDate, pickupTime, dropoffDate, dropoffTime })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erreur lors de la création du créneau');

      await fetchSlots();
      pickupDateIn.value  = today;
      dropoffDateIn.value = today;

    } catch (error) {
      alert(`⚠️ Erreur : ${error.message}`);
      console.error(error);
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = originalHTML;
      lucide.createIcons();
    }
  });

  // ── Récupération des créneaux ────────────────────────────────────────────
  async function fetchSlots() {
    try {
      const response = await fetch('/api/slots');
      if (!response.ok) throw new Error('Impossible de récupérer la liste des créneaux');
      const slots = await response.json();
      renderSlots(slots);
    } catch (error) {
      console.error('Erreur fetchSlots:', error);
      slotsContainer.innerHTML = `
        <div class="empty-state">
          <i data-lucide="alert-circle" style="color: var(--danger);"></i>
          <p>Erreur lors de la récupération des créneaux.</p>
        </div>
      `;
      lucide.createIcons();
    }
  }

  // ── Formatage date française ─────────────────────────────────────────────
  function formatFrenchDate(dateStr) {
    try {
      const date = new Date(dateStr + 'T12:00:00');
      const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
      let formatted = new Intl.DateTimeFormat('fr-FR', options).format(date);
      return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    } catch (e) { return dateStr; }
  }

  function formatShortDate(dateStr) {
    try {
      const date = new Date(dateStr + 'T12:00:00');
      return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    } catch (e) { return dateStr; }
  }

  function formatRelativeTime(dateStr) {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return dateStr; }
  }

  // ── Rendu des créneaux ────────────────────────────────────────────────────
  function renderSlots(slots) {
    slotCount.textContent = `${slots.length} créneau${slots.length > 1 ? 'x' : ''}`;

    if (slots.length === 0) {
      slotsContainer.innerHTML = `
        <div class="empty-state">
          <i data-lucide="calendar-days"></i>
          <p>Aucun créneau planifié pour le moment.</p>
          <span style="font-size: 0.8rem; color: var(--text-dimmed);">Utilisez le formulaire pour proposer une date.</span>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    slotsContainer.innerHTML = slots.map(slot => {
      let statusLabel = 'En attente';
      let statusIcon  = 'clock';
      if (slot.status === 'CONFIRMED') { statusLabel = 'Validé';  statusIcon = 'check-circle-2'; }
      if (slot.status === 'REJECTED')  { statusLabel = 'Refusé';  statusIcon = 'x-circle'; }

      const sameDay = slot.pickupDate === slot.dropoffDate;
      const pickupDateFr  = formatFrenchDate(slot.pickupDate);
      const dropoffDateFr = formatFrenchDate(slot.dropoffDate);

      // Bloc contre-proposition (si elle existe)
      const counterBlock = slot.counterProposal ? `
        <div class="counter-proposal-block">
          <div class="counter-proposal-header">
            <i data-lucide="message-square-reply"></i>
            <span>Contre-proposition de Samira</span>
            <small>${formatRelativeTime(slot.counterProposalAt)}</small>
          </div>
          <p class="counter-proposal-text">"${slot.counterProposal}"</p>
        </div>
      ` : '';

      return `
        <div class="slot-item ${slot.counterProposal ? 'has-counter' : ''}">
          <!-- En-tête -->
          <div class="slot-item-header">
            <span class="slot-date-text">${formatShortDate(slot.pickupDate)}</span>
            <span class="status-badge ${slot.status}">
              <i data-lucide="${statusIcon}"></i>
              <span>${statusLabel}</span>
            </span>
          </div>

          <!-- Trajet détaillé -->
          <div class="slot-journey">
            <div class="journey-step pickup">
              <div class="journey-icon"><i data-lucide="school"></i></div>
              <div class="journey-info">
                <span class="journey-label">Récupération école</span>
                <span class="journey-date">${pickupDateFr}</span>
                <span class="journey-time">${slot.pickupTime}</span>
              </div>
            </div>
            <div class="journey-arrow"><i data-lucide="arrow-down"></i></div>
            <div class="journey-step dropoff">
              <div class="journey-icon"><i data-lucide="baby"></i></div>
              <div class="journey-info">
                <span class="journey-label">Dépôt garderie</span>
                <span class="journey-date">${sameDay ? 'Même jour' : dropoffDateFr}</span>
                <span class="journey-time">${slot.dropoffTime}</span>
              </div>
            </div>
          </div>

          ${counterBlock}

          <!-- Pied de carte -->
          <div class="slot-meta">
            <span>
              <i data-lucide="plus-circle" style="width:12px;height:12px;"></i>
              Créé le ${formatRelativeTime(slot.createdAt)}
            </span>
            ${slot.responseAt ? `
              <span>
                <i data-lucide="history" style="width:12px;height:12px;"></i>
                Répondu le ${formatRelativeTime(slot.responseAt)}
              </span>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    lucide.createIcons();
  }

  // Rafraîchir toutes les 4 secondes
  setInterval(fetchSlots, 4000);
});
