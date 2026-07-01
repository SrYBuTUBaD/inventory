-- ============================================================
--  ESX INVENTORY – Server
--  Mit persistenter Slot-Speicherung + Stack-Splitting
-- ============================================================

local trunkData = {}  -- [vehNetId] = { items, weight }

-- ── Max. Stückzahl pro Stack/Slot eines Items ────────────────
-- Fragt direkt die DB ab statt ESX.Items zu nutzen,
-- um Timing-Probleme beim Resource-Start zu vermeiden.
local stackLimitCache = {}

local function GetStackLimit(itemName, cb)
    if stackLimitCache[itemName] ~= nil then
        cb(stackLimitCache[itemName])
        return
    end
    exports.oxmysql:execute('SELECT item_limit FROM items WHERE name = ?', { itemName }, function(rows)
        local limit = nil
        if rows and rows[1] and rows[1].item_limit and rows[1].item_limit ~= -1 then
            limit = tonumber(rows[1].item_limit)
        end
        stackLimitCache[itemName] = limit
        cb(limit)
    end)
end

-- ── Gespeicherte Slot-Positionen aus der DB holen ────────────
-- Rückgabe: map[item_name][stack_index] = slot
local function GetSavedSlots(identifier, cb)
    exports.oxmysql:execute('SELECT item_name, stack_index, slot FROM inventory_slots WHERE identifier = ?', { identifier }, function(rows)
        local map = {}
        if rows then
            for _, row in ipairs(rows) do
                map[row.item_name] = map[row.item_name] or {}
                map[row.item_name][row.stack_index] = row.slot
            end
        end
        cb(map)
    end)
end

-- ── Slot-Position eines Stacks dauerhaft speichern ───────────
local function SaveSlot(identifier, itemName, stackIndex, slot)
    exports.oxmysql:execute(
        'INSERT INTO inventory_slots (identifier, item_name, stack_index, slot) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE slot = ?',
        { identifier, itemName, stackIndex, slot, slot }
    )
end

-- ── Baut die Item-Liste auf: splittet große Mengen in mehrere
--    Stacks (Slots) auf, je nach item_limit. Gespeicherte Slot-
--    Positionen werden beibehalten, neue Stacks bekommen den
--    nächsten freien Slot.
local function BuildItemsWithSavedSlots(xPlayer, cb)
    GetSavedSlots(xPlayer.identifier, function(savedSlots)
        local rawInventory = xPlayer.getInventory()

        -- Erst alle Stack-Limits parallel abfragen
        local itemNames = {}
        for _, item in ipairs(rawInventory) do
            if item.count and item.count > 0 then
                itemNames[item.name] = true
            end
        end

        local limits = {}
        local pending = 0
        for name, _ in pairs(itemNames) do
            pending = pending + 1
        end

        if pending == 0 then
            cb({})
            return
        end

        for name, _ in pairs(itemNames) do
            GetStackLimit(name, function(limit)
                limits[name] = limit
                pending = pending - 1
                if pending == 0 then
                    -- Alle Limits geladen, jetzt aufbauen
                    local usedSlots = {}
                    local placed    = {}
                    local toPlace   = {}

                    for _, item in ipairs(rawInventory) do
                        if item.count and item.count > 0 then
                            local stackLimit = limits[item.name]
                            local saved = savedSlots[item.name] or {}

                            if stackLimit then
                                local remaining  = item.count
                                local stackIndex = 0
                                while remaining > 0 do
                                    local stackCount = math.min(remaining, stackLimit)
                                    table.insert(toPlace, {
                                        name = item.name, label = item.label, weight = item.weight,
                                        count = stackCount, stackIndex = stackIndex,
                                    })
                                    remaining  = remaining - stackCount
                                    stackIndex = stackIndex + 1
                                end
                            else
                                table.insert(toPlace, {
                                    name = item.name, label = item.label, weight = item.weight,
                                    count = item.count, stackIndex = 0,
                                })
                            end
                        end
                    end

                    -- Erste Runde: gespeicherte Slots übernehmen
                    local stillPending = {}
                    for _, stack in ipairs(toPlace) do
                        local savedSlot = (savedSlots[stack.name] or {})[stack.stackIndex]
                        if savedSlot ~= nil and not usedSlots[savedSlot] then
                            usedSlots[savedSlot] = true
                            stack.slot = savedSlot
                            table.insert(placed, stack)
                        else
                            table.insert(stillPending, stack)
                        end
                    end

                    -- Zweite Runde: neue Slots vergeben
                    local nextSlot = 0
                    for _, stack in ipairs(stillPending) do
                        while usedSlots[nextSlot] do nextSlot = nextSlot + 1 end
                        usedSlots[nextSlot] = true
                        stack.slot = nextSlot
                        table.insert(placed, stack)
                        SaveSlot(xPlayer.identifier, stack.name, stack.stackIndex, nextSlot)
                        nextSlot = nextSlot + 1
                    end

                    cb(placed)
                end
            end)
        end
    end)
end

-- ── Kofferraum laden ────────────────────────────────────────
RegisterNetEvent('inventory:getTrunk')
AddEventHandler('inventory:getTrunk', function(vehNetId)
    local src = source
    if not trunkData[vehNetId] then
        trunkData[vehNetId] = { items = {}, weight = 0 }
    end
    TriggerClientEvent('inventory:receiveTrunk', src,
        trunkData[vehNetId].items,
        trunkData[vehNetId].weight)
end)

-- ── Item benutzen ────────────────────────────────────────────
RegisterNetEvent('inventory:useItem')
AddEventHandler('inventory:useItem', function(itemName)
    local src     = source
    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer then return end

    local item = xPlayer.getInventoryItem(itemName)
    if item and item.count > 0 then
        ESX.UseItem(src, itemName)
    end
end)

-- ── Item geben ───────────────────────────────────────────────
RegisterNetEvent('inventory:giveItem')
AddEventHandler('inventory:giveItem', function(itemName, count)
    local src     = source
    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer then return end

    -- Nächsten Spieler in der Nähe finden (serverseitig)
    local coords    = GetEntityCoords(GetPlayerPed(src))
    local nearSrc   = nil
    local nearDist  = 3.0

    for _, pid in ipairs(GetPlayers()) do
        local pidInt = tonumber(pid)
        if pidInt ~= src then
            local dist = #(coords - GetEntityCoords(GetPlayerPed(pidInt)))
            if dist < nearDist then
                nearDist = dist
                nearSrc  = pidInt
            end
        end
    end

    if not nearSrc then return end

    local item = xPlayer.getInventoryItem(itemName)
    if item and item.count >= count then
        local target = ESX.GetPlayerFromId(nearSrc)
        if target and target.canCarryItem(itemName, count) then
            xPlayer.removeInventoryItem(itemName, count)
            target.addInventoryItem(itemName, count)
            -- Update beide Clients
            sendUpdate(src, xPlayer)
            sendUpdate(nearSrc, target)
        end
    end
end)

-- ── Item wegwerfen ───────────────────────────────────────────
RegisterNetEvent('inventory:dropItem')
AddEventHandler('inventory:dropItem', function(itemName, count)
    local src     = source
    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer then return end

    local item = xPlayer.getInventoryItem(itemName)
    if item and item.count >= count then
        xPlayer.removeInventoryItem(itemName, count)
        sendUpdate(src, xPlayer)
    end
end)

-- ── Item verschieben (Rucksack ↔ Kofferraum / Slots tauschen) ──
RegisterNetEvent('inventory:moveItem')
AddEventHandler('inventory:moveItem', function(fromGrid, fromSlot, toGrid, toSlot, vehNetId, itemName, stackIndex)
    local src     = source
    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer then return end

    -- Nur Bewegungen innerhalb des Rucksacks dauerhaft speichern.
    if toGrid == 'player' and itemName then
        SaveSlot(xPlayer.identifier, itemName, stackIndex or 0, toSlot)
    end

    -- Kein sendUpdate() hier! Das würde die clientseitig optimistisch
    -- gesetzte Slot-Position sofort wieder überschreiben.
end)

-- ── Stack aufteilen ──────────────────────────────────────────
-- ESX kennt kein natives Stack-Splitting (alle Items sind ein Pool).
-- Wir speichern nur die neue Slot-Position für den abgespaltenen Stack,
-- damit beim nächsten Öffnen BuildItemsWithSavedSlots ihn korrekt platziert.
RegisterNetEvent('inventory:splitItem')
AddEventHandler('inventory:splitItem', function(itemName, fromSlot, fromStackIndex, amount, grid)
    local src     = source
    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer then return end

    local item = xPlayer.getInventoryItem(itemName)
    if not item or item.count < amount + 1 then return end

    if grid == 'player' then
        -- Nächsten freien Slot aus der DB ermitteln
        GetSavedSlots(xPlayer.identifier, function(savedSlots)
            local usedSlots = {}
            for _, slots in pairs(savedSlots) do
                for _, slot in pairs(slots) do
                    usedSlots[slot] = true
                end
            end
            local nextSlot = 0
            while usedSlots[nextSlot] do nextSlot = nextSlot + 1 end
            -- Neuen Stack-Index erzeugen (fromStackIndex + 100 als Offset, eindeutig)
            local newStackIndex = (fromStackIndex or 0) + 100 + nextSlot
            SaveSlot(xPlayer.identifier, itemName, newStackIndex, nextSlot)
        end)
    end
    -- Kein sendUpdate() – Client hat den Split schon optimistisch angezeigt
end)
function sendUpdate(src, xPlayer)
    BuildItemsWithSavedSlots(xPlayer, function(items)
        TriggerClientEvent('inventory:clientUpdate', src, items, xPlayer.weight)
    end)
end

-- ── CALLBACK FÜR DEN CLIENT ──
ESX.RegisterServerCallback('inventory:getPlayerData', function(source, cb)
    local xPlayer = ESX.GetPlayerFromId(source)
    if xPlayer then
        BuildItemsWithSavedSlots(xPlayer, function(items)
            cb(items, xPlayer.getWeight(), xPlayer.maxWeight, xPlayer.getMoney())
        end)
    else
        cb({}, 0, 50.0, 0)
    end
end)
