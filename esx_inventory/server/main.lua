-- ============================================================
--  ESX INVENTORY – Server
-- ============================================================

local trunkData = {}  -- [vehNetId] = { items, weight }

-- ── Kofferraum laden ────────────────────────────────────────
RegisterNetEvent('esx_inventory:getTrunk')
AddEventHandler('esx_inventory:getTrunk', function(vehNetId)
    local src = source
    if not trunkData[vehNetId] then
        trunkData[vehNetId] = { items = {}, weight = 0 }
    end
    TriggerClientEvent('esx_inventory:receiveTrunk', src,
        trunkData[vehNetId].items,
        trunkData[vehNetId].weight)
end)

-- ── Item benutzen ────────────────────────────────────────────
RegisterNetEvent('esx_inventory:useItem')
AddEventHandler('esx_inventory:useItem', function(itemName)
    local src     = source
    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer then return end

    local item = xPlayer.getInventoryItem(itemName)
    if item and item.count > 0 then
        ESX.UseItem(src, itemName)
    end
end)

-- ── Item geben ───────────────────────────────────────────────
RegisterNetEvent('esx_inventory:giveItem')
AddEventHandler('esx_inventory:giveItem', function(itemName, count)
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
RegisterNetEvent('esx_inventory:dropItem')
AddEventHandler('esx_inventory:dropItem', function(itemName, count)
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
RegisterNetEvent('esx_inventory:moveItem')
AddEventHandler('esx_inventory:moveItem', function(fromGrid, fromSlot, toGrid, toSlot)
    local src     = source
    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer then return end
    -- Slot-Logik wird clientseitig optimistisch durchgeführt.
    -- Hier nur Update-Event zurückschicken damit alle Clients sync bleiben.
    sendUpdate(src, xPlayer)
end)

-- ── Hilfsfunktion: Client-Update schicken ────────────────────
function sendUpdate(src, xPlayer)
    local items = {}
    for i, item in ipairs(xPlayer.inventory) do
        if item.count > 0 then
            table.insert(items, {
                name   = item.name,
                label  = item.label,
                count  = item.count,
                weight = item.weight,
                slot   = i - 1,
            })
        end
    end
    TriggerClientEvent('esx_inventory:clientUpdate', src, items, xPlayer.weight)
end
