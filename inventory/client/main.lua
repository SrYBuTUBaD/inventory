-- ============================================================
--  INVENTORY – Client
--  Fix: Bewegungen komplett blockiert (Kein KeepInput)
-- ============================================================

local isOpen      = false
local nearVehicle = nil
local trunkNetId  = nil

-- ── Schleife zum Blockieren aller Bewegungen und der Kamera ──
local function DisableControls()
    CreateThread(function()
        while isOpen do
            Wait(0)
            -- Blockiert die gesamte Charakter-Bewegung & Kamera (WASD, Maus, Schießen, Auto fahren)
            DisableAllControlActions(0)
            
            -- Reaktiviert NUR wichtige Tasten (z.B. für Voice-Chat)
            EnableControlAction(0, 249, true) -- Push-To-Talk (Numpad-Minus / Voice)
            EnableControlAction(0, 20, true)  -- Z-Taste (Häufig für Player-Voice genutzt)
        end
    end)
end

-- ── UI beim Start einmalig laden (versteckt) ─────────────────
AddEventHandler('onClientResourceStart', function(resourceName)
    if resourceName ~= GetCurrentResourceName() then return end
    Wait(1000)
    SendNUIMessage({ action = 'init' })
end)

local function BuildPlayerData(serverItems, serverWeight, serverMaxWeight, serverMoney, trunkItems, trunkWeight, hasTrunk)
    local items = {}

    if serverItems then
        for _, item in ipairs(serverItems) do
            if item.count and item.count > 0 then
                table.insert(items, {
                    name       = item.name,
                    label      = item.label,
                    count      = item.count,
                    weight     = item.weight or 0.0,
                    slot       = item.slot,
                    stackIndex = item.stackIndex or 0,
                })
            end
        end
    end

    -- Wichtig: Wir verlassen uns NICHT auf xPlayer.maxWeight aus ESX,
    -- da dieser Wert in einer anderen Einheit/Skala stehen kann als
    -- unsere eigene Config (die explizit in Gramm definiert ist).
    -- Dadurch kam es zur falschen KG-Anzeige (doppelte Umrechnung).
    local maxWeight = (Config and Config.MaxWeight) or 20000

    -- Aktuelles Gewicht selbst aus den Items berechnen (in Gramm),
    -- statt den rohen ESX-Wert zu übernehmen.
    local currentWeight = 0.0
    for _, it in ipairs(items) do
        currentWeight = currentWeight + ((it.weight or 0) * (it.count or 1))
    end

    return {
        playerItems     = items,
        playerWeight    = tonumber(currentWeight) or 0.0,
        playerMaxWeight = tonumber(maxWeight) or 50.0,
        money           = serverMoney or 0,
        slots           = (Config and Config.Slots) or 24,
        hasTrunk        = hasTrunk or false,
        trunkItems      = trunkItems or {},
        trunkWeight     = trunkWeight or 0,
        trunkMaxWeight  = (Config and Config.TrunkWeight) or 150.0,
        trunkSlots      = (Config and Config.TrunkSlots) or 15,
    }
end

local function OpenInventory()
    if isOpen then return end
    isOpen = true

    if nearVehicle then
        trunkNetId = VehToNet(nearVehicle)
        TriggerServerEvent('inventory:getTrunk', trunkNetId)
    else
        ESX.TriggerServerCallback('inventory:getPlayerData', function(serverInventory, currentWeight, maxWeight, money)
            local data = BuildPlayerData(serverInventory, currentWeight, maxWeight, money, {}, 0, false)
            SendNUIMessage({ action = 'openInventory', data = data })
            
            SetNuiFocus(true, true)
            DisableControls()
        end)
    end
end

local function CloseInventory()
    if not isOpen then return end
    isOpen     = false
    trunkNetId = nil
    SendNUIMessage({ action = 'closeInventory' })
    
    -- Deaktiviert den Fokus wieder vollständig
    SetNuiFocus(false, false)
end

RegisterNetEvent('inventory:receiveTrunk')
AddEventHandler('inventory:receiveTrunk', function(trunkItems, trunkWeight)
    ESX.TriggerServerCallback('inventory:getPlayerData', function(serverInventory, currentWeight, maxWeight, money)
        local data = BuildPlayerData(serverInventory, currentWeight, maxWeight, money, trunkItems, trunkWeight, true)
        SendNUIMessage({ action = 'openInventory', data = data })
        
        SetNuiFocus(true, true)
        DisableControls()
    end)
end)


local function RefreshInventory()
    if not isOpen then return end

    if trunkNetId then
        TriggerServerEvent('inventory:getTrunk', trunkNetId)
    else
        ESX.TriggerServerCallback('inventory:getPlayerData', function(serverInventory, currentWeight, maxWeight, money)
            local data = BuildPlayerData(serverInventory, currentWeight, maxWeight, money, {}, 0, false)
            SendNUIMessage({ action = 'updateInventory', data = data })
        end)
    end
end

RegisterNUICallback('closeInventory', function(_, cb)
    CloseInventory()
    cb('ok')
end)

RegisterNUICallback('refreshInventory', function(_, cb)
    RefreshInventory()
    cb('ok')
end)

RegisterNUICallback('useItem', function(data, cb)
    TriggerServerEvent('inventory:useItem', data.name)
    cb('ok')
end)

RegisterNUICallback('giveItem', function(data, cb)
    TriggerServerEvent('inventory:giveItem', data.name, data.count)
    cb('ok')
end)

RegisterNUICallback('dropItem', function(data, cb)
    TriggerServerEvent('inventory:dropItem', data.name, data.count)
    cb('ok')
end)

RegisterNUICallback('moveItem', function(data, cb)
    TriggerServerEvent('inventory:moveItem',
        data.fromGrid, data.fromSlot,
        data.toGrid,   data.toSlot,
        trunkNetId,    data.itemName, data.stackIndex)
    cb('ok')
end)

RegisterNUICallback('splitItem', function(data, cb)
    TriggerServerEvent('inventory:splitItem',
        data.name, data.fromSlot, data.stackIndex, data.amount, data.grid)
    cb('ok')
end)

CreateThread(function()
    while true do
        Wait(500)
        local ped = PlayerPedId()
        local pos = GetEntityCoords(ped)
        local veh = GetClosestVehicle(pos.x, pos.y, pos.z, 3.5, 0, 70)
        nearVehicle = (DoesEntityExist(veh) and not IsEntityDead(veh)) and veh or nil
    end
end)

RegisterKeyMapping('openinventory', 'Inventar öffnen', 'keyboard', 'i')
RegisterCommand('openinventory', function()
    if isOpen then CloseInventory() else OpenInventory() end
end, false)

RegisterNetEvent('inventory:clientUpdate')
AddEventHandler('inventory:clientUpdate', function(updatedItems, weight)
    if not isOpen then return end
    SendNUIMessage({ action = 'updateInventory', data = { playerItems = updatedItems, playerWeight = weight } })
end)

RegisterNetEvent('inventory:trunkUpdate')
AddEventHandler('inventory:trunkUpdate', function(trunkItems, trunkWeight)
    if not isOpen then return end
    SendNUIMessage({ action = 'updateInventory', data = { trunkItems = trunkItems, trunkWeight = trunkWeight } })
end)
