// ============================================================
//  ESX INVENTORY – Frontend
//  Großes Icon-Style, gestrichelte leere Slots, Taste I
// ============================================================

const state = {
    open: false,
    playerItems: [], trunkItems: [],
    playerWeight: 0, playerMaxWeight: 50000,
    trunkWeight: 0,  trunkMaxWeight: 350000,
    money: 0, slots: 14, trunkSlots: 16,
    hasTrunk: false,
    dragSource: null, contextItem: null, contextGrid: null,
};

// ── Item-Icons: große Emojis passend zu ESX-Itemnamen ───────
const ITEM_ICONS = {
    // Essen & Trinken
    'bread':            '🍞',
    'water':            '🍶',
    'water_bottle':     '🍶',
    'cola':             '🥤',
    'beer':             '🍺',
    'sandwich':         '🥪',
    'apple':            '🍎',
    'burger':           '🍔',
    // Medizin
    'bandage':          '🩹',
    'medikit':          '🩺',
    'firstaid':         '🩺',
    'painkillers':      '💊',
    'pills':            '💊',
    'morphine':         '💉',
    // Werkzeug & Equipment
    'lockpick':         '🔑',
    'phone':            '📱',
    'radio':            '📟',
    'toolkit':          '🔧',
    'screwdriver':      '🪛',
    'armor':            '🦺',
    'weapon_armor':     '🦺',
    'flashlight':       '🔦',
    'binoculars':       '🔭',
    // Rohstoffe & Materialien
    'iron':             '⚙️',
    'steel':            '🔩',
    'wood':             '🪵',
    'plastic':          '🧴',
    'rubber':           '⚫',
    'gold':             '🥇',
    'diamond':          '💎',
    'crystal':          '💎',
    'peanut':           '🥜',
    'rolex':            '⌚',
    // Drogen
    'weed':             '🌿',
    'weed_seed':        '🌱',
    'cocaine':          '🤍',
    'cocaine_brick':    '🤍',
    'meth':             '🔵',
    'heroin':           '⚪',
    'lsd':              '🌈',
    'amphetamine':      '🔴',
    // Geld
    'black_money':      '💵',
    'dirty_money':      '💴',
    'money':            '💶',
    // Waffen-Zubehör
    'weapon_ammo':      '🔫',
    'ammo_pistol':      '🔫',
    'weapon_pistol':    '🔫',
    'weapon_knife':     '🔪',
    // Sonstiges
    'toilet_paper':     '🧻',
    'paper':            '📄',
    'id_card':          '🪪',
    'driving_license':  '🪪',
    'handcuffs':        '⛓️',
    'evidence_bag':     '🛍️',
    'garbage_bag':      '🗑️',
    'box':              '📦',
    'briefcase':        '💼',
    'gift':             '🎁',
    'key':              '🗝️',
    'car_key':          '🗝️',
    'default':          '📦',
};

function getIcon(name) {
    const k = (name || '').toLowerCase();
    // Exakter Treffer
    if (ITEM_ICONS[k]) return ITEM_ICONS[k];
    // Teilweise Übereinstimmung
    for (const [key, icon] of Object.entries(ITEM_ICONS)) {
        if (k.includes(key) || key.includes(k)) return icon;
    }
    return ITEM_ICONS['default'];
}

function gramsToKg(g) { return (g / 1000).toFixed(2); }

// ── Kofferraum ein-/ausblenden ───────────────────────────────
function setTrunkVisible(visible) {
    document.getElementById('panel-trunk').classList.toggle('hidden', !visible);
}

// ── Grid rendern ─────────────────────────────────────────────
function renderGrid(gridId, items, slotCount, grid) {
    const el = document.getElementById(gridId);
    el.innerHTML = '';

    for (let i = 0; i < slotCount; i++) {
        const slot = document.createElement('div');
        slot.className = 'inv-slot';
        slot.dataset.index = i;
        slot.dataset.grid  = grid;

        const item = items.find(it => it.slot === i);

        if (item) {
            slot.classList.add('filled');
            const icon = getIcon(item.name);
            slot.innerHTML = `
                <div class="inv-item" draggable="true" data-slot="${i}" data-grid="${grid}">
                    <div class="item-icon">${icon}</div>
                    ${item.count > 0 ? `<span class="item-count">${item.count}</span>` : ''}
                </div>`;

            const itemEl = slot.querySelector('.inv-item');
            itemEl.addEventListener('dragstart',   onDragStart);
            itemEl.addEventListener('contextmenu', onContextMenu);
            itemEl.addEventListener('mouseenter',  onTooltipShow);
            itemEl.addEventListener('mouseleave',  onTooltipHide);
        } else {
            slot.classList.add('empty');
        }

        slot.addEventListener('dragover',  onDragOver);
        slot.addEventListener('dragleave', onDragLeave);
        slot.addEventListener('drop',      onDrop);
        el.appendChild(slot);
    }
}

// ── Gewicht als Text (wie Bild 2: "0.31 / 40 KG") ───────────
function updateWeightText(textId, current, max) {
    document.getElementById(textId).textContent =
        `${gramsToKg(current)} / ${gramsToKg(max)} KG`;
}

function renderAll() {
    renderGrid('player-grid', state.playerItems, state.slots,      'player');
    renderGrid('trunk-grid',  state.trunkItems,  state.trunkSlots, 'trunk');
    updateWeightText('player-weight-text', state.playerWeight, state.playerMaxWeight);
    updateWeightText('trunk-weight-text',  state.trunkWeight,  state.trunkMaxWeight);
    setTrunkVisible(state.hasTrunk);
}

// ── Drag & Drop ──────────────────────────────────────────────
let ghost = null;

function onDragStart(e) {
    const slot = parseInt(e.currentTarget.dataset.slot);
    const grid = e.currentTarget.dataset.grid;
    state.dragSource = { grid, slot };
    e.currentTarget.closest('.inv-slot').classList.add('dragging');

    ghost = document.createElement('div');
    ghost.id = 'drag-ghost';
    const items = grid === 'player' ? state.playerItems : state.trunkItems;
    ghost.textContent = getIcon(items.find(it => it.slot === slot)?.name);
    document.body.appendChild(ghost);

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setDragImage(new Image(), 0, 0);
    document.addEventListener('dragover', moveGhost);
}

function moveGhost(e) {
    if (ghost) { ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px'; }
}

function onDragOver(e)  { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function onDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }

function onDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    document.removeEventListener('dragover', moveGhost);
    if (ghost) { ghost.remove(); ghost = null; }
    if (!state.dragSource) return;

    const toSlot = parseInt(e.currentTarget.dataset.index);
    const toGrid = e.currentTarget.dataset.grid;
    const { grid: fromGrid, slot: fromSlot } = state.dragSource;
    state.dragSource = null;
    if (fromSlot === toSlot && fromGrid === toGrid) return;

    fetch(`https://esx_inventory/moveItem`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromGrid, fromSlot, toGrid, toSlot })
    });

    const fromList = fromGrid === 'player' ? state.playerItems : state.trunkItems;
    const toList   = toGrid   === 'player' ? state.playerItems : state.trunkItems;
    const fromIdx  = fromList.findIndex(it => it.slot === fromSlot);
    const toIdx    = toList.findIndex(it => it.slot === toSlot);
    if (fromIdx === -1) return;

    const movingItem = { ...fromList[fromIdx], slot: toSlot };
    if (toIdx !== -1 && fromGrid === toGrid) toList[toIdx].slot = fromSlot;
    else if (toIdx !== -1) return;
    fromList.splice(fromIdx, 1);
    toList.push(movingItem);
    renderAll();
}

// ── Context Menu ─────────────────────────────────────────────
function onContextMenu(e) {
    e.preventDefault();
    const slot = parseInt(e.currentTarget.dataset.slot);
    const grid = e.currentTarget.dataset.grid;
    state.contextItem = (grid === 'player' ? state.playerItems : state.trunkItems).find(it => it.slot === slot);
    state.contextGrid = grid;
    const menu = document.getElementById('context-menu');
    menu.style.left = e.clientX + 'px';
    menu.style.top  = e.clientY + 'px';
    menu.classList.remove('hidden');
}

function hideContext() { document.getElementById('context-menu').classList.add('hidden'); state.contextItem = null; }

document.getElementById('ctx-use').addEventListener('click', () => {
    if (!state.contextItem) return;
    fetch(`https://esx_inventory/useItem`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: state.contextItem.name }) });
    hideContext(); closeInventory();
});
document.getElementById('ctx-give').addEventListener('click', () => {
    if (!state.contextItem) return;
    fetch(`https://esx_inventory/giveItem`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: state.contextItem.name, count: state.contextItem.count }) });
    hideContext();
});
document.getElementById('ctx-drop').addEventListener('click', () => {
    if (!state.contextItem) return;
    fetch(`https://esx_inventory/dropItem`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: state.contextItem.name, count: state.contextItem.count, grid: state.contextGrid }) });
    hideContext();
});

document.addEventListener('click', hideContext);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeInventory(); });

// ── Tooltip ──────────────────────────────────────────────────
function onTooltipShow(e) {
    const slot = parseInt(e.currentTarget.dataset.slot);
    const grid = e.currentTarget.dataset.grid;
    const item = (grid === 'player' ? state.playerItems : state.trunkItems).find(it => it.slot === slot);
    if (!item) return;
    document.getElementById('tooltip-name').textContent   = item.label || item.name;
    document.getElementById('tooltip-weight').textContent = item.weight
        ? `Gewicht: ${gramsToKg(item.weight * (item.count || 1))} KG` : '';
    document.getElementById('tooltip').classList.remove('hidden');
    e.currentTarget.addEventListener('mousemove', moveTooltip);
}
function moveTooltip(e) {
    const tt = document.getElementById('tooltip');
    tt.style.left = (e.clientX + 14) + 'px';
    tt.style.top  = (e.clientY + 14) + 'px';
}
function onTooltipHide(e) {
    document.getElementById('tooltip').classList.add('hidden');
    e.currentTarget.removeEventListener('mousemove', moveTooltip);
}

// ── Öffnen / Schließen ───────────────────────────────────────
function assignSlots(items) {
    const used = new Set(items.filter(it => it.slot != null).map(it => it.slot));
    let next = 0;
    return items.map(it => {
        if (it.slot != null) return it;
        while (used.has(next)) next++;
        used.add(next);
        return { ...it, slot: next++ };
    });
}

function openInventory(data) {
    state.playerItems     = assignSlots(data.playerItems  || []);
    state.trunkItems      = assignSlots(data.trunkItems   || []);
    state.playerWeight    = data.playerWeight    || 0;
    state.playerMaxWeight = data.playerMaxWeight || 50000;
    state.trunkWeight     = data.trunkWeight     || 0;
    state.trunkMaxWeight  = data.trunkMaxWeight  || 350000;
    state.money           = data.money           || 0;
    state.slots           = data.slots           || 20;
    state.trunkSlots      = data.trunkSlots      || 16;
    state.hasTrunk        = !!data.hasTrunk;
    state.open = true;
    document.getElementById('inventory-wrapper').classList.add('visible');
    renderAll();
}

function closeInventory() {
    if (!state.open) return;
    state.open = false;
    document.getElementById('inventory-wrapper').classList.remove('visible');
    fetch(`https://esx_inventory/closeInventory`, { method: 'POST' });
}

document.getElementById('close-btn').addEventListener('click', closeInventory);

// ── NUI Messages ─────────────────────────────────────────────
window.addEventListener('message', e => {
    const { action, data } = e.data;
    if (action === 'openInventory')   openInventory(data);
    if (action === 'closeInventory')  closeInventory();
    if (action === 'updateInventory') {
        if (data.playerItems !== undefined) {
            state.playerItems  = assignSlots(data.playerItems);
            state.playerWeight = data.playerWeight ?? state.playerWeight;
        }
        if (data.trunkItems !== undefined) {
            state.trunkItems  = assignSlots(data.trunkItems);
            state.trunkWeight = data.trunkWeight ?? state.trunkWeight;
        }
        renderAll();
    }
});

// FiveM CEF Transparenz-Fix
document.documentElement.style.background = 'transparent';
document.body.style.background = 'transparent';

// Schließt das Inventar, wenn man im geöffneten Zustand noch einmal "I" oder "ESC" drückt
window.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' || event.key.toLowerCase() === 'i') {
        fetch(`https://${GetParentResourceName()}/closeInventory`, { 
            method: 'POST', 
            body: JSON.stringify({}) 
        });
    }
});

// Blockiert die Tab-Navigation und steuert das Schließen des Inventars
window.addEventListener('keydown', function(event) {
    if (event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation(); // Verhindert, dass das Event an andere Elemente weitergegeben wird
        return false;
    }

    if (event.key === 'Escape' || event.key.toLowerCase() === 'i') {
        fetch(`https://${GetParentResourceName()}/closeInventory`, { 
            method: 'POST', 
            body: JSON.stringify({}) 
        });
    }
});

// Zusätzliche Absicherung für das Loslassen der Taste
window.addEventListener('keyup', function(event) {
    if (event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        return false;
    }
});

