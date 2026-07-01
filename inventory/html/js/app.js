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
    dragSource: null, selectedItem: null, selectedGrid: null,
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
                <div class="inv-item" data-slot="${i}" data-grid="${grid}">
                    <div class="item-icon">${icon}</div>
                    ${item.count > 0 ? `<span class="item-count">${item.count}</span>` : ''}
                </div>`;

            const itemEl = slot.querySelector('.inv-item');
            itemEl.addEventListener('mousedown',   onDragStart);
            itemEl.addEventListener('contextmenu', e => e.preventDefault());
        } else {
            slot.classList.add('empty');
        }

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

    // Falls das ausgewählte Item nicht mehr existiert (z.B. komplett benutzt/weggeworfen),
    // Auswahl zurücksetzen. Sonst aktuelle Daten nachziehen (z.B. neue Anzahl).
    if (state.selectedItem) {
        const list = state.selectedGrid === 'player' ? state.playerItems : state.trunkItems;
        const still = list.find(it => it.name === state.selectedItem.name && it.slot === state.selectedItem.slot);
        state.selectedItem = still || null;
        if (!still) state.selectedGrid = null;
    }
    renderSelection();
}

// ── Generisches Mengen-Modal (für Teilen + Wegwerfen) ─────────
let amountCallback = null;

function openAmountModal(title, info, max, callback, confirmLabel, confirmColor) {
    amountCallback = callback;
    document.getElementById('split-title').textContent = title;
    const input = document.getElementById('split-input');
    input.value = max; // vorausgefüllt mit der aktuellen Anzahl
    input.max   = max;
    input.style.borderBottomColor = '';
    document.getElementById('split-modal').classList.remove('hidden');
    setTimeout(() => { input.focus(); input.select(); }, 50);
}

function closeSplitModal() {
    document.getElementById('split-modal').classList.add('hidden');
    amountCallback = null;
    splitItem = null;
    splitGrid = null;
}

// ── Stack aufteilen (Rechtsklick-Modal) ──────────────────────
let splitItem = null;
let splitGrid = null;

function openSplitModal(item, grid) {
    if (!item || item.count <= 1) return;
    splitItem = item;
    splitGrid = grid;
    openAmountModal(
        'Stack aufteilen',
        `${item.label || item.name} – ${item.count} Stück vorhanden`,
        item.count - 1,
        (amount) => {
            fetch(`https://inventory/splitItem`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: item.name, fromSlot: item.slot,
                    stackIndex: item.stackIndex || 0,
                    amount: amount, grid: splitGrid
                })
            });
            const list = splitGrid === 'player' ? state.playerItems : state.trunkItems;
            const idx  = list.findIndex(it => it.slot === item.slot && it.name === item.name);
            if (idx !== -1) {
                list[idx].count -= amount;
                const usedSlots = new Set(list.map(it => it.slot));
                let nextSlot = 0;
                while (usedSlots.has(nextSlot)) nextSlot++;
                list.push({
                    name: item.name, label: item.label, count: amount,
                    weight: item.weight, slot: nextSlot,
                    stackIndex: (item.stackIndex || 0) + 100 + nextSlot,
                });
            }
            renderAll();
        }
    );
}

document.getElementById('split-confirm').addEventListener('click', () => {
    const input  = document.getElementById('split-input');
    const amount = parseInt(input.value);
    const max    = parseInt(input.max);
    if (!amount || amount < 1 || amount > max) {
        input.style.borderBottomColor = '#e74c3c';
        return;
    }
    input.style.borderBottomColor = '';
    if (amountCallback) amountCallback(amount);
    closeSplitModal();
});

document.getElementById('split-cancel').addEventListener('click', closeSplitModal);

document.getElementById('split-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('split-confirm').click();
    if (e.key === 'Escape') closeSplitModal();
});

// Klick außerhalb schließt Modal
document.getElementById('split-modal').addEventListener('mousedown', e => {
    if (e.target === document.getElementById('split-modal')) closeSplitModal();
});

// ── Drag & Drop (manuell per Maus-Events, da native HTML5-DnD in CEF unzuverlässig ist) ──
let ghost = null;
let dragActive = false;
let lastHoveredSlot = null;

function onDragStart(e) {
    if (e.button === 0) {
        // ── Linksklick: normaler Move-Drag ──
        e.preventDefault();

        const itemEl  = e.currentTarget;
        const slot    = parseInt(itemEl.dataset.slot);
        const grid    = itemEl.dataset.grid;
        state.dragSource = { grid, slot };
        dragActive = false;

        const items    = grid === 'player' ? state.playerItems : state.trunkItems;
        const itemData = items.find(it => it.slot === slot);
        if (!itemData) return;

        const startX = e.clientX, startY = e.clientY;

        function onMouseMove(moveEvent) {
            if (!dragActive) {
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;
                if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
                dragActive = true;
                itemEl.closest('.inv-slot').classList.add('dragging');
                ghost = document.createElement('div');
                ghost.id = 'drag-ghost';
                ghost.innerHTML = getIcon(itemData.name);
                document.body.appendChild(ghost);
            }
            if (ghost) { ghost.style.left = moveEvent.clientX + 'px'; ghost.style.top = moveEvent.clientY + 'px'; }
            if (ghost) ghost.style.display = 'none';
            const elUnder = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
            if (ghost) ghost.style.display = 'flex';
            const slotUnder = elUnder ? elUnder.closest('.inv-slot') : null;
            if (lastHoveredSlot && lastHoveredSlot !== slotUnder) lastHoveredSlot.classList.remove('drag-over');
            if (slotUnder) slotUnder.classList.add('drag-over');
            lastHoveredSlot = slotUnder;
        }

        function onMouseUp(upEvent) {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
            if (lastHoveredSlot) lastHoveredSlot.classList.remove('drag-over');
            if (ghost) { ghost.remove(); ghost = null; }
            if (dragActive && lastHoveredSlot) {
                performMove(lastHoveredSlot);
            } else if (!dragActive) {
                selectItem(grid, slot);
            }
            lastHoveredSlot = null;
            state.dragSource = null;
            dragActive = false;
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

    } else if (e.button === 2) {
        // ── Rechtsklick halten: Split-Drag ──
        // Nur starten wenn Item mehr als 1 Stück hat
        const itemEl  = e.currentTarget;
        const slot    = parseInt(itemEl.dataset.slot);
        const grid    = itemEl.dataset.grid;
        const items   = grid === 'player' ? state.playerItems : state.trunkItems;
        const itemData = items.find(it => it.slot === slot);
        if (!itemData || itemData.count <= 1) return;

        e.preventDefault();
        let splitDragActive = false;
        const startX = e.clientX, startY = e.clientY;

        function onMouseMove(moveEvent) {
            if (!splitDragActive) {
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;
                if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
                splitDragActive = true;
                // Ghost mit halber Opazität als Hinweis auf Split
                ghost = document.createElement('div');
                ghost.id = 'drag-ghost';
                ghost.style.opacity = '0.6';
                ghost.style.border  = '2px dashed rgba(255, 255, 255, 0)';
                ghost.innerHTML = getIcon(itemData.name);
                document.body.appendChild(ghost);
            }
            if (ghost) { ghost.style.left = moveEvent.clientX + 'px'; ghost.style.top = moveEvent.clientY + 'px'; }
            if (ghost) ghost.style.display = 'none';
            const elUnder = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
            if (ghost) ghost.style.display = 'flex';
            const slotUnder = elUnder ? elUnder.closest('.inv-slot') : null;
            if (lastHoveredSlot && lastHoveredSlot !== slotUnder) lastHoveredSlot.classList.remove('drag-over');
            if (slotUnder) slotUnder.classList.add('drag-over');
            lastHoveredSlot = slotUnder;
        }

        function onMouseUp(upEvent) {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            if (lastHoveredSlot) lastHoveredSlot.classList.remove('drag-over');
            if (ghost) { ghost.remove(); ghost = null; }

            const targetSlot = lastHoveredSlot;
            lastHoveredSlot = null;

            if (splitDragActive && targetSlot) {
                const toSlot = parseInt(targetSlot.dataset.index);
                const toGrid = targetSlot.dataset.grid;
                // Nicht auf sich selbst droppen
                if (toSlot === slot && toGrid === grid) return;
                // Ziel-Slot darf kein anderes Item enthalten
                const targetList = toGrid === 'player' ? state.playerItems : state.trunkItems;
                const occupied   = targetList.find(it => it.slot === toSlot);
                if (occupied && occupied.name !== itemData.name) return;

                splitGrid = grid;
                splitItem = itemData;
                openAmountModal(
                    'Anzahl',
                    '',
                    itemData.count - 1,
                    (amount) => {
                        fetch(`https://inventory/splitItem`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                name: itemData.name, fromSlot: slot,
                                stackIndex: itemData.stackIndex || 0,
                                amount: amount, grid: grid
                            })
                        });
                        // Optimistisch lokal aufteilen in Ziel-Slot
                        const srcList = grid === 'player' ? state.playerItems : state.trunkItems;
                        const srcIdx  = srcList.findIndex(it => it.slot === slot && it.name === itemData.name);
                        if (srcIdx !== -1) {
                            srcList[srcIdx].count -= amount;
                            const existingIdx = targetList.findIndex(it => it.slot === toSlot);
                            if (existingIdx !== -1) {
                                targetList[existingIdx].count += amount;
                            } else {
                                targetList.push({
                                    name: itemData.name, label: itemData.label, count: amount,
                                    weight: itemData.weight, slot: toSlot,
                                    stackIndex: (itemData.stackIndex || 0) + 100 + toSlot,
                                });
                            }
                        }
                        renderAll();
                    }
                );
            } else if (!splitDragActive) {
                // Kurzer Rechtsklick ohne Drag -> normales Split-Modal (bisheriges Verhalten)
                openSplitModal(itemData, grid);
            }
            splitDragActive = false;
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup',   onMouseUp);
    }
}

function performMove(targetSlotEl) {
    if (!state.dragSource) return;

    const toSlot = parseInt(targetSlotEl.dataset.index);
    const toGrid = targetSlotEl.dataset.grid;
    const { grid: fromGrid, slot: fromSlot } = state.dragSource;
    if (fromSlot === toSlot && fromGrid === toGrid) return;

    const sourceList = fromGrid === 'player' ? state.playerItems : state.trunkItems;
    const sourceItem  = sourceList.find(it => it.slot === fromSlot);

    fetch(`https://inventory/moveItem`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromGrid, fromSlot, toGrid, toSlot, itemName: sourceItem?.name, stackIndex: sourceItem?.stackIndex || 0 })
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

// ── Item-Auswahl (Linksklick) statt Kontextmenü ──────────────
function selectItem(grid, slot) {
    const item = (grid === 'player' ? state.playerItems : state.trunkItems).find(it => it.slot === slot);
    state.selectedItem = item || null;
    state.selectedGrid = grid;
    renderSelection();
}

function clearSelection() {
    state.selectedItem = null;
    state.selectedGrid = null;
    renderSelection();
}

function renderSelection() {
    const nameEl     = document.getElementById('selected-name');
    const infoEl     = document.getElementById('selected-info');
    const actionRow  = document.getElementById('action-row');
    const extraBtn   = document.getElementById('extra-btn');
    if (state.selectedItem) {
        nameEl.textContent = state.selectedItem.label || state.selectedItem.name;
        infoEl.style.visibility = 'visible';
        actionRow.classList.add('active');
        extraBtn.classList.add('hidden');
    } else {
        nameEl.textContent = '';
        infoEl.style.visibility = 'hidden';
        actionRow.classList.remove('active');
        extraBtn.classList.remove('hidden');
    }
}

document.getElementById('sel-use').addEventListener('click', () => {
    if (!state.selectedItem) return;
    fetch(`https://inventory/useItem`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: state.selectedItem.name }) });
    clearSelection();
    closeInventory();
});
document.getElementById('sel-give').addEventListener('click', () => {
    if (!state.selectedItem) return;
    fetch(`https://inventory/giveItem`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: state.selectedItem.name, count: state.selectedItem.count }) });
    clearSelection();
});
document.getElementById('sel-drop').addEventListener('click', () => {
    if (!state.selectedItem) return;
    if (state.selectedItem.count > 1) {
        // Menge abfragen via Modal
        openAmountModal(
            'Wegwerfen',
            `${state.selectedItem.label || state.selectedItem.name} – ${state.selectedItem.count} Stück vorhanden`,
            state.selectedItem.count,
            (amount) => {
                fetch(`https://inventory/dropItem`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: state.selectedItem.name, count: amount, grid: state.selectedGrid }) });
                clearSelection();
            },
            'DROP',
            '#e74c3c'
        );
    } else {
        // Nur 1 Stück – direkt wegwerfen ohne Abfrage
        fetch(`https://inventory/dropItem`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: state.selectedItem.name, count: 1, grid: state.selectedGrid }) });
        clearSelection();
    }
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeInventory(); });

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
    state.selectedItem = null;
    state.selectedGrid = null;
    document.getElementById('inventory-wrapper').classList.add('visible');
    document.getElementById('money-text').textContent = `${state.money} $`;
    renderAll();
}

function closeInventory() {
    if (!state.open) return;
    state.open = false;
    state.selectedItem = null;
    state.selectedGrid = null;
    closeSplitModal();
    renderSelection();
    document.getElementById('inventory-wrapper').classList.remove('visible');
    fetch(`https://inventory/closeInventory`, { method: 'POST' });
}

document.getElementById('close-btn').addEventListener('click', closeInventory);

document.getElementById('refresh-btn').addEventListener('click', () => {
    fetch(`https://inventory/refreshInventory`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
});

document.getElementById('extra-btn').addEventListener('click', () => {
    // Funktion folgt später
    console.log('Extra-Button (unten rechts) geklickt');
});

document.getElementById('arrow-btn').addEventListener('click', () => {
    // Funktion folgt später
    console.log('Pfeil-Button geklickt');
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
        if (data && data.money !== undefined) {
            state.money = data.money;
        }
        document.getElementById('money-text').textContent = `${state.money} $`;
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

