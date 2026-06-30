-- ============================================================
--  ESX INVENTORY – Server
-- ============================================================

local trunkData = {}  -- [vehNetId] = { items, weight }

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
AddEventHandler('inventory:moveItem', function(fromGrid, fromSlot, toGrid, toSlot, vehNetId)
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
    local nextSlot = 0
    for _, item in ipairs(xPlayer.inventory) do
        if item.count > 0 then
            table.insert(items, {
                name   = item.name,
                label  = item.label,
                count  = item.count,
                weight = item.weight,
                slot   = nextSlot,
            })
            nextSlot = nextSlot + 1
        end
    end
    TriggerClientEvent('inventory:clientUpdate', src, items, xPlayer.weight)
end

-- ── CALLBACK FÜR DEN CLIENT ──
ESX.RegisterServerCallback('inventory:getPlayerData', function(source, cb)
    local xPlayer = ESX.GetPlayerFromId(source)
    if xPlayer then
        -- Sendet Items, Gewicht, Max-Gewicht und Bargeld direkt aus dem Server-Cache an den Client
        cb(xPlayer.getInventory(), xPlayer.getWeight(), xPlayer.maxWeight, xPlayer.getMoney())
    else
        cb({}, 0, 50.0, 0)
    end
end)
