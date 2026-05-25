let tripData = null;
let selections = {};
let activeDay = 0;

async function loadSelections() {
  try {
    const res = await fetch('schedule.json');
    if (!res.ok) throw new Error('No schedule.json');
    const raw = await res.json();
    for (const key in raw) {
      if (!Array.isArray(raw[key])) {
        raw[key] = raw[key] ? [raw[key]] : [];
      }
    }
    return raw;
  } catch {
    const raw = JSON.parse(localStorage.getItem('londonSelections') || '{}');
    for (const key in raw) {
      if (!Array.isArray(raw[key])) {
        raw[key] = raw[key] ? [raw[key]] : [];
      }
    }
    return raw;
  }
}

function findOptionById(optionId) {
  for (const day of tripData.days) {
    for (const slotName of ['morning', 'afternoon', 'evening']) {
      const slot = day.slots[slotName];
      if (!slot) continue;
      const found = slot.options.find(o => o.id === optionId);
      if (found) return found;
    }
  }
  return null;
}

function getSelectedOptions(day, slotName) {
  const key = `${day.date}-${slotName}`;
  const ids = selections[key] || [];
  return ids.map(id => findOptionById(id)).filter(Boolean);
}

async function init() {
  const res = await fetch('data.json');
  tripData = await res.json();
  selections = await loadSelections();
  renderDayTabs();
  renderTimeline(activeDay);
}

function renderDayTabs() {
  const tabs = document.getElementById('dayTabs');
  tabs.innerHTML = tripData.days.map((day, i) => {
    const date = new Date(day.date + 'T12:00:00');
    const dayNum = date.getDate();
    const weekday = date.toLocaleDateString('en-GB', { weekday: 'short' });
    const isActive = i === activeDay ? 'active' : '';
    return `<button class="day-tab ${isActive}" onclick="selectDay(${i})">
      <span class="day-tab-weekday">${weekday}</span>
      <span class="day-tab-date">${dayNum}</span>
    </button>`;
  }).join('');
}

function selectDay(index) {
  activeDay = index;
  renderDayTabs();
  renderTimeline(index);
}

function renderTimeline(index) {
  const day = tripData.days[index];
  const container = document.getElementById('timeline');
  const slots = ['morning', 'afternoon', 'evening'];
  const slotIcons = { morning: '🌅', afternoon: '☀️', evening: '🌙' };

  const items = [];

  slots.forEach((slotName, slotIndex) => {
    const slot = day.slots[slotName];
    if (!slot) return;
    const opts = getSelectedOptions(day, slotName);

    if (opts.length > 0) {
      opts.forEach((opt, optIdx) => {
        items.push(`
          <div class="timeline-item">
            <div class="timeline-marker"></div>
            <div class="timeline-card">
              ${optIdx === 0 ? `
                <div class="timeline-time">${slot.time}</div>
                <div class="timeline-slot-label">${slotIcons[slotName]} ${slotName.charAt(0).toUpperCase() + slotName.slice(1)}</div>
              ` : ''}
              <h3>${opt.icon} ${opt.name}</h3>
              <p>${opt.description}</p>
              <div class="timeline-details">
                ${opt.duration ? `<span class="detail-chip">🕐 ${opt.duration}</span>` : ''}
                <span class="detail-chip">📍 ${opt.address}</span>
              </div>
            </div>
          </div>
        `);

        const isLastInSlot = optIdx === opts.length - 1;
        const hasNextSlot = slotIndex < slots.length - 1;

        if (opt.transport_to_next && (hasNextSlot || !isLastInSlot)) {
          const t = opt.transport_to_next;
          items.push(`
            <div class="timeline-transport">
              <div class="transport-line"></div>
              <div class="transport-info">
                <span class="transport-mode">${getTransportIcon(t.mode)} ${t.mode}</span>
                ${t.line ? `<span class="transport-detail">${t.line}</span>` : ''}
                <span class="transport-duration">${t.duration}</span>
                ${t.maps_url ? `<a href="${t.maps_url}" target="_blank" rel="noopener" class="transport-link">Open in Maps ↗</a>` : ''}
              </div>
            </div>
          `);
        }
      });
    } else {
      items.push(`
        <div class="timeline-item empty">
          <div class="timeline-marker empty-marker"></div>
          <div class="timeline-card empty-card">
            <div class="timeline-time">${slot.time}</div>
            <div class="timeline-slot-label">${slotIcons[slotName]} ${slotName.charAt(0).toUpperCase() + slotName.slice(1)}</div>
            <p class="empty-message">Not planned yet — <a href="index.html">go to Planner</a></p>
          </div>
        </div>
      `);
    }
  });

  container.innerHTML = `
    <div class="day-header">
      <h2>${day.label}</h2>
      <span class="day-theme">${day.theme}</span>
    </div>
    <div class="timeline-line">
      ${items.join('')}
    </div>
  `;
}

function getTransportIcon(mode) {
  const icons = {
    'Tube': '🚇',
    'Bus': '🚌',
    'Walk': '🚶',
    'Taxi': '🚕',
    'Shuttle + Tube': '🚌🚇',
    'Thames Clipper': '⛴️',
    'Cable Car': '🚡'
  };
  return icons[mode] || '🚶';
}

init();
