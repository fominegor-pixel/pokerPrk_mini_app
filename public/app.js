(function () {
  const tg = window.Telegram ? window.Telegram.WebApp : null;

  const els = {
    loading: document.getElementById('loading'),
    error: document.getElementById('error'),
    errorText: document.getElementById('error-text'),
    card: document.getElementById('card'),
    mediaWrap: document.getElementById('media-wrap'),
    statusBadge: document.getElementById('status-badge'),
    participantsCount: document.getElementById('participants-count'),
    title: document.getElementById('giveaway-title'),
    description: document.getElementById('giveaway-description'),
    startAt: document.getElementById('start-at'),
    endAt: document.getElementById('end-at'),
    participateBtn: document.getElementById('participate-btn'),
    participateBtnText: document.getElementById('participate-btn-text'),
    successPanel: document.getElementById('success-panel'),
    winnerPanel: document.getElementById('winner-panel'),
  };

  function initTelegram() {
    if (!tg) return;
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor('#0a0a0d');
      tg.setBackgroundColor('#0a0a0d');
    } catch (e) {
      /* старі версії клієнта Telegram можуть не підтримувати ці методи */
    }
  }

  function getInitData() {
    return tg ? tg.initData : '';
  }

  function getGiveawayId() {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('giveaway_id');
    if (fromQuery) return fromQuery;

    // Резервний варіант: якщо Mini App відкритий через t.me посилання зі start_param
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) {
      return tg.initDataUnsafe.start_param.replace(/\D/g, '');
    }
    return null;
  }

  function showError(message) {
    els.loading.classList.add('hidden');
    els.card.classList.add('hidden');
    els.error.classList.remove('hidden');
    els.errorText.textContent = message;
  }

  function formatDate(ts) {
    const d = new Date(ts * 1000);
    return d.toLocaleString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const STATUS_LABELS = {
    scheduled: '🕒 Заплановано',
    active: '🟢 Активний',
    finished: '🏁 Завершено',
  };

  function renderGiveaway(g) {
    els.loading.classList.add('hidden');
    els.card.classList.remove('hidden');

    els.mediaWrap.innerHTML = '';
    if (g.mediaUrl && g.mediaType === 'photo') {
      const img = document.createElement('img');
      img.src = g.mediaUrl;
      img.alt = g.title;
      els.mediaWrap.appendChild(img);
    } else if (g.mediaUrl && g.mediaType === 'video') {
      const video = document.createElement('video');
      video.src = g.mediaUrl;
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      els.mediaWrap.appendChild(video);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'media-placeholder';
      placeholder.textContent = '🎁';
      els.mediaWrap.appendChild(placeholder);
    }

    els.statusBadge.textContent = STATUS_LABELS[g.status] || g.status;
    els.statusBadge.className = 'badge ' + (g.status === 'active' ? 'active' : g.status === 'finished' ? 'finished' : '');
    els.participantsCount.textContent = `👥 ${g.participantsCount}`;
    els.title.textContent = g.title;
    els.description.textContent = g.description;
    els.startAt.textContent = formatDate(g.startAt);
    els.endAt.textContent = formatDate(g.endAt);
    els.participateBtnText.textContent = g.buttonText || 'Участвовать';

    if (g.isWinner) {
      els.winnerPanel.classList.remove('hidden');
    }

    if (g.hasJoined) {
      els.successPanel.classList.remove('hidden');
      setButtonState('joined');
    } else if (g.status === 'scheduled') {
      setButtonState('not-started');
    } else if (g.status === 'finished') {
      setButtonState('finished');
    } else {
      setButtonState('idle');
    }
  }

  function setButtonState(state) {
    const btn = els.participateBtn;
    btn.classList.remove('loading');
    switch (state) {
      case 'idle':
        btn.disabled = false;
        els.participateBtnText.textContent = els.participateBtnText.textContent || 'Участвовать';
        break;
      case 'loading':
        btn.disabled = true;
        btn.classList.add('loading');
        break;
      case 'joined':
        btn.disabled = true;
        els.participateBtnText.textContent = '✅ Ви берете участь';
        break;
      case 'not-started':
        btn.disabled = true;
        els.participateBtnText.textContent = '🕒 Розіграш ще не почався';
        break;
      case 'finished':
        btn.disabled = true;
        els.participateBtnText.textContent = '🏁 Розіграш завершено';
        break;
    }
  }

  async function fetchGiveaway(giveawayId) {
    const res = await fetch(`/api/giveaway/${giveawayId}`, {
      headers: { 'x-telegram-init-data': getInitData() },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Не вдалося завантажити розіграш');
    }
    return data;
  }

  async function participate(giveawayId) {
    setButtonState('loading');
    try {
      const res = await fetch(`/api/giveaway/${giveawayId}/participate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': getInitData(),
        },
        body: JSON.stringify({ initData: getInitData() }),
      });
      const data = await res.json();

      if (!res.ok && !data.giveaway) {
        throw new Error(data.message || 'Помилка участі');
      }

      if (data.giveaway) {
        renderGiveaway(data.giveaway);
      }

      if (data.joined) {
        els.successPanel.classList.remove('hidden');
        if (tg && tg.HapticFeedback) {
          tg.HapticFeedback.notificationOccurred('success');
        }
      }
    } catch (err) {
      setButtonState('idle');
      if (tg && tg.showAlert) {
        tg.showAlert(err.message);
      } else {
        alert(err.message);
      }
    }
  }

  async function main() {
    initTelegram();

    const giveawayId = getGiveawayId();
    if (!giveawayId) {
      return showError('Не вказано розіграш. Відкрийте Mini App через кнопку «Участвовать» у повідомленні бота.');
    }

    try {
      const g = await fetchGiveaway(giveawayId);
      renderGiveaway(g);
      els.participateBtn.addEventListener('click', () => participate(giveawayId));
    } catch (err) {
      showError(err.message || 'Не вдалося завантажити розіграш.');
    }
  }

  main();
})();
