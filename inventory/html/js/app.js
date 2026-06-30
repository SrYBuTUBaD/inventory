// ============================================================
//  INVENTORY – Frontend (PNG-BILDER-VERSION)
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

// ── NEU: Generiert den Bildpfad automatisch aus dem Item-Namen ──
function getIcon(name) {
    const itemName = (name || 'default').toLowerCase();
    return `<div style="
        width: 100%;
        height: 100%;
        background-image: url('img/items/${itemName}.png');
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
        display: block;
    "></div>`;
}

function gramsToKg(g) { return (g / 1000).toFixed(2); }

function setTrunkVisible(visible) {
    document.getElementById('panel-trunk').classList.toggle('hidden', !visible);
}

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
    
    // NEU: Zeichnet das Bild auch im Drag-Ghost (Zieh-Animation)
    ghost.innerHTML = getIcon(items.find(it => it.slot === slot)?.name);
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

    fetch(`https://inventory/moveItem`, {
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
    fetch(`https://inventory/useItem`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: state.contextItem.name }) });
    hideContext(); closeInventory();
});
document.getElementById('ctx-give').addEventListener('click', () => {
    if (!state.contextItem) return;
    fetch(`https://inventory/giveItem`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: state.contextItem.name, count: state.contextItem.count }) });
    hideContext();
});
document.getElementById('ctx-drop').addEventListener('click', () => {
    if (!state.contextItem) return;
    fetch(`https://inventory/dropItem`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: state.contextItem.name, count: state.contextItem.count, grid: state.contextGrid }) });
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
    fetch(`https://inventory/closeInventory`, { method: 'POST' });
}

document.getElementById('close-btn').addEventListener('click', closeInventory);

document.getElementById('refresh-btn').addEventListener('click', () => {
    fetch(`https://inventory/refreshInventory`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
});

// ── NUI Messages ─────────────────────────────────────────────
window.addEventListener('message', e => {
    const { action, data } = e.data;
    let incomingItems = e.data.items || (data && data.playerItems) || (data && data.items);

    if (action === 'openInventory') {
        if (incomingItems && (!data || !data.playerItems)) {
            if (!e.data.data) e.data.data = {};
            e.data.data.playerItems = incomingItems;
        }
        openInventory(e.data.data || data);
    }
    
    if (action === 'closeInventory') closeInventory();
    
    if (action === 'updateInventory' || action === 'openInventory') {
        if (incomingItems !== undefined) {
            state.playerItems = assignSlots(incomingItems);
            if (data && data.playerWeight !== undefined) state.playerWeight = data.playerWeight;
            if (data && data.playerMaxWeight !== undefined) state.playerMaxWeight = data.playerMaxWeight;
        }
        if (data && data.trunkItems !== undefined) {
            state.trunkItems = assignSlots(data.trunkItems);
            state.trunkWeight = data.trunkWeight ?? state.trunkWeight;
        }
        renderAll();
    }
});

// FiveM CEF Transparenz-Fix
document.documentElement.style.background = 'transparent';
document.body.style.background = 'transparent';

// Tasten-Steuerung
window.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' || event.key.toLowerCase() === 'i') {
        fetch(`https://${GetParentResourceName()}/closeInventory`, { method: 'POST', body: JSON.stringify({}) });
    }
    if (event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        return false;
    }
});

window.addEventListener('keyup', function(event) {
    if (event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        return false;
    }
});

