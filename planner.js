let tripData = null;
let selections = {};
let activeDay = 0;
let searchQuery = '';

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

function saveSelections() {
  localStorage.setItem('londonSelections', JSON.stringify(selections));
}

function getAllSelectedIds() {
  const ids = new Set();
  for (const key in selections) {
    (selections[key] || []).forEach(id => ids.add(id));
  }
  return ids;
}

function findOptionById(optionId) {
  for (const day of tripData.days) {
    for (const slotName of ['morning', 'afternoon', 'evening']) {
      const slot = day.slots[slotName];
      if (!slot) continue;
      const found = slot.options.find(o => o.id === optionId);
      if (found) return { ...found, slotTime: slot.time };
    }
  }
  return null;
}

function getTransportIcon(mode) {
  const icons = {
    'Tube': '\u{1F687}', 'Bus': '\u{1F68C}', 'Walk': '\u{1F6B6}', 'Taxi': '\u{1F695}',
    'Shuttle + Tube': '\u{1F68C}\u{1F687}', 'Thames Clipper': '⛴️', 'Cable Car': '\u{1F6A1}'
  };
  return icons[mode] || '\u{1F6B6}';
}

// --- Time calculation ---

function parseDuration(str) {
  if (!str) return 60;
  const rangeMatch = str.match(/(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*h/i);
  if (rangeMatch) return Math.round(parseFloat(rangeMatch[2]) * 60);
  const hourMatch = str.match(/(\d+(?:\.\d+)?)\s*h/i);
  const minMatch = str.match(/(\d+)\s*min/i);
  let total = 0;
  if (hourMatch) total += parseFloat(hourMatch[1]) * 60;
  if (minMatch) total += parseInt(minMatch[1]);
  return total || 60;
}

function parseTransportDuration(str) {
  if (!str) return 15;
  const rangeMatch = str.match(/(\d+)\s*[–-]\s*(\d+)\s*min/i);
  if (rangeMatch) return parseInt(rangeMatch[2]);
  const minMatch = str.match(/(\d+)\s*min/i);
  if (minMatch) return parseInt(minMatch[1]);
  const hourMatch = str.match(/(\d+(?:\.\d+)?)\s*h/i);
  if (hourMatch) return Math.round(parseFloat(hourMatch[1]) * 60);
  return 15;
}

function parseSlotStartTime(timeStr) {
  const match = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (!match) return 540;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

function formatTime(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function computeItineraryTimes(day) {
  const slots = ['morning', 'afternoon', 'evening'];
  const result = [];

  slots.forEach(slotName => {
    const slot = day.slots[slotName];
    if (!slot) return;
    const key = `${day.date}-${slotName}`;
    const ids = selections[key] || [];
    if (ids.length === 0) return;

    let currentTime = parseSlotStartTime(slot.time);

    ids.forEach((id, i) => {
      const opt = findOptionById(id);
      if (!opt) return;
      const duration = parseDuration(opt.duration);
      const endTime = currentTime + duration;

      let transport = null;
      if (i < ids.length - 1 && opt.transport_to_next) {
        transport = opt.transport_to_next;
      }

      result.push({
        opt,
        slotName,
        startTime: currentTime,
        endTime,
        transport
      });

      currentTime = endTime;
      if (transport) {
        currentTime += parseTransportDuration(transport.duration);
      }
    });
  });

  return result;
}

// --- Rendering ---

async function init() {
  const res = await fetch('data.json');
  tripData = await res.json();
  selections = await loadSelections();
  renderDayTabs();
  renderPanels();
}

function renderDayTabs() {
  const tabs = document.getElementById('dayTabs');
  tabs.innerHTML = tripData.days.map((day, i) => {
    const date = new Date(day.date + 'T12:00:00');
    const dayNum = date.getDate();
    const weekday = date.toLocaleDateString('en-GB', { weekday: 'short' });
    const isActive = i === activeDay ? 'active' : '';
    const hasSelections = hasAnySelection(i) ? 'has-selections' : '';
    return `<button class="day-tab ${isActive} ${hasSelections}" onclick="selectDay(${i})">
      <span class="day-tab-weekday">${weekday}</span>
      <span class="day-tab-date">${dayNum}</span>
    </button>`;
  }).join('');
}

function hasAnySelection(dayIndex) {
  const day = tripData.days[dayIndex];
  return ['morning', 'afternoon', 'evening'].some(s => {
    const arr = selections[`${day.date}-${s}`];
    return arr && arr.length > 0;
  });
}

function selectDay(index) {
  activeDay = index;
  searchQuery = '';
  renderDayTabs();
  renderPanels();
}

function renderPanels() {
  renderAvailablePanel();
  renderItineraryPanel();
}

// --- Left Panel: Available Places ---

function matchesSearch(opt) {
  if (!searchQuery) return true;
  const q = searchQuery.toLowerCase();
  return opt.name.toLowerCase().includes(q) ||
    opt.description.toLowerCase().includes(q) ||
    (opt.address && opt.address.toLowerCase().includes(q));
}

function onSearchInput(e) {
  searchQuery = e.target.value;
  renderAvailablePanel(true);
}

function renderAvailablePanel(keepSearch) {
  const day = tripData.days[activeDay];
  const container = document.getElementById('availableList');
  const slots = ['morning', 'afternoon', 'evening'];
  const slotIcons = { morning: '\u{1F305}', afternoon: '☀️', evening: '\u{1F319}' };
  const allSelected = getAllSelectedIds();

  let html = `
    <div class="avail-search">
      <input type="text" class="avail-search-input" id="searchInput"
             placeholder="Search places..." value="${searchQuery.replace(/"/g, '&quot;')}"
             oninput="onSearchInput(event)">
      ${searchQuery ? '<button class="avail-search-clear" onclick="searchQuery=\'\';renderAvailablePanel(true)">&times;</button>' : ''}
    </div>
    <div class="day-header">
      <h2>${day.label}</h2>
      <span class="day-theme">${day.theme}</span>
    </div>`;

  let hasResults = false;

  slots.forEach(slotName => {
    const slot = day.slots[slotName];
    if (!slot) return;

    const available = slot.options.filter(opt => !allSelected.has(opt.id) && matchesSearch(opt));
    const floating = getFloatingOptions(day.date, slotName).filter(opt => matchesSearch(opt));

    if (available.length === 0 && floating.length === 0) return;
    hasResults = true;

    html += `
      <div class="avail-slot">
        <div class="avail-slot-header">
          <span class="slot-icon">${slotIcons[slotName]}</span>
          <span class="slot-label">${slotName.charAt(0).toUpperCase() + slotName.slice(1)}</span>
          <span class="slot-time">${slot.time}</span>
        </div>
        <div class="avail-cards">
          ${available.map(opt => renderAvailableCard(opt, slotName, null)).join('')}
          ${floating.length > 0 ? `
            <div class="floating-divider">From other days</div>
            ${floating.map(opt => renderAvailableCard(opt, slotName, opt.fromDay)).join('')}
          ` : ''}
        </div>
      </div>`;
  });

  if (!hasResults) {
    html += searchQuery
      ? '<div class="avail-empty">No places match your search</div>'
      : '<div class="avail-empty">All activities have been added to your itinerary!</div>';
  }

  container.innerHTML = html;

  if (keepSearch) {
    const input = document.getElementById('searchInput');
    if (input) { input.focus(); input.selectionStart = input.selectionEnd = input.value.length; }
  }
}

function getFloatingOptions(currentDate, slotName) {
  const allSelected = getAllSelectedIds();
  const floating = [];

  tripData.days.forEach(day => {
    if (day.date === currentDate) return;
    const slot = day.slots[slotName];
    if (!slot) return;
    slot.options.forEach(opt => {
      if (!allSelected.has(opt.id)) {
        floating.push({ ...opt, fromDay: day.label, fromDate: day.date });
      }
    });
  });

  return floating;
}

function renderAvailableCard(opt, slotName, fromDay) {
  return `
    <div class="avail-card" draggable="true"
         ondragstart="onDragStart(event, '${opt.id}', '${slotName}')"
         ondragend="onDragEnd(event)">
      <div class="avail-card-icon">${opt.icon}</div>
      <div class="avail-card-body">
        <div class="avail-card-name">${opt.name}</div>
        ${fromDay ? `<span class="from-day-badge">${fromDay}</span>` : ''}
        <div class="avail-card-desc">${opt.description}</div>
        <div class="avail-card-meta">
          <span class="avail-card-duration">${opt.duration}</span>
          ${opt.confirmed ? '<span class="badge-confirmed">Confirmed</span>' : ''}
        </div>
      </div>
      <div class="avail-card-grip">≡</div>
    </div>`;
}

// --- Right Panel: Itinerary ---

function renderItineraryPanel() {
  const day = tripData.days[activeDay];
  const container = document.getElementById('itineraryList');
  const slots = ['morning', 'afternoon', 'evening'];
  const slotIcons = { morning: '\u{1F305}', afternoon: '☀️', evening: '\u{1F319}' };
  const items = computeItineraryTimes(day);

  let html = '';

  slots.forEach(slotName => {
    const slot = day.slots[slotName];
    if (!slot) return;
    const key = `${day.date}-${slotName}`;
    const slotItems = items.filter(it => it.slotName === slotName);

    html += `
      <div class="itin-slot-section" data-slot="${slotName}">
        <div class="itin-slot-header">
          <span class="slot-icon">${slotIcons[slotName]}</span>
          <span class="slot-label">${slotName.charAt(0).toUpperCase() + slotName.slice(1)}</span>
          <span class="slot-time">${slot.time}</span>
        </div>
        <div class="itin-drop-zone" data-slot="${slotName}"
             ondragover="onDragOver(event)" ondragleave="onDragLeave(event)"
             ondrop="onDrop(event, '${day.date}', '${slotName}')">
          ${slotItems.length === 0 ? `
            <div class="itin-empty-slot">
              <div class="itin-empty-icon">+</div>
              <div class="itin-empty-text">Drop an activity here</div>
            </div>
          ` : slotItems.map((item, i) => `
            ${renderItineraryCard(item, day.date, slotName, i)}
            ${item.transport ? renderTransportBridge(item.transport) : ''}
          `).join('')}
        </div>
      </div>`;
  });

  container.innerHTML = html;
}

function renderItineraryCard(item, date, slotName, index) {
  const { opt, startTime, endTime } = item;
  return `
    <div class="itin-card" draggable="true"
         data-id="${opt.id}" data-index="${index}"
         ondragstart="onItinDragStart(event, '${opt.id}', '${date}', '${slotName}')"
         ondragend="onDragEnd(event)">
      <div class="itin-card-time">
        <span class="itin-time-start">${formatTime(startTime)}</span>
        <span class="itin-time-end">${formatTime(endTime)}</span>
      </div>
      <div class="itin-card-icon">${opt.icon}</div>
      <div class="itin-card-body">
        <div class="itin-card-name">${opt.name}</div>
        <div class="itin-card-duration">${opt.duration}</div>
      </div>
      <button class="itin-card-remove" onclick="removeFromItinerary(event, '${date}', '${slotName}', '${opt.id}')" title="Remove">&times;</button>
    </div>`;
}

function renderTransportBridge(transport) {
  return `
    <div class="itin-transport">
      <div class="itin-transport-line"></div>
      <div class="itin-transport-info">
        ${getTransportIcon(transport.mode)} ${transport.mode} &middot; ${transport.duration}
      </div>
    </div>`;
}

// --- Drag & Drop ---

let dragData = null;

function onDragStart(e, optionId, slotName) {
  dragData = { optionId, slotName, source: 'available' };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', optionId);
  e.target.classList.add('dragging');
}

function onItinDragStart(e, optionId, date, slotName) {
  dragData = { optionId, slotName, date, source: 'itinerary' };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', optionId);
  e.target.classList.add('dragging');
}

function onDragEnd(e) {
  e.target.classList.remove('dragging');
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  dragData = null;
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const zone = e.currentTarget;
  zone.classList.add('drag-over');
}

function onDragLeave(e) {
  const zone = e.currentTarget;
  if (!zone.contains(e.relatedTarget)) {
    zone.classList.remove('drag-over');
  }
}

function onDrop(e, date, slotName) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');

  if (!dragData) return;
  const { optionId } = dragData;

  for (const key in selections) {
    const idx = (selections[key] || []).indexOf(optionId);
    if (idx > -1) {
      selections[key].splice(idx, 1);
      if (selections[key].length === 0) delete selections[key];
    }
  }

  const key = `${date}-${slotName}`;
  if (!selections[key]) selections[key] = [];

  const dropZone = e.currentTarget;
  const cards = dropZone.querySelectorAll('.itin-card');
  let insertIndex = cards.length;

  const mouseY = e.clientY;
  for (let i = 0; i < cards.length; i++) {
    const rect = cards[i].getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (mouseY < midY) {
      insertIndex = i;
      break;
    }
  }

  selections[key].splice(insertIndex, 0, optionId);

  saveSelections();
  renderDayTabs();
  renderPanels();
  dragData = null;
}

function removeFromItinerary(e, date, slotName, optionId) {
  e.stopPropagation();
  const key = `${date}-${slotName}`;
  if (!selections[key]) return;

  const idx = selections[key].indexOf(optionId);
  if (idx > -1) {
    selections[key].splice(idx, 1);
    if (selections[key].length === 0) delete selections[key];
  }

  saveSelections();
  renderDayTabs();
  renderPanels();
}

init();
