-- ============================================================
--  ESX INVENTORY – Client
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

local function BuildPlayerData(trunkItems, trunkWeight, hasTrunk)
    local xPlayer = ESX.GetPlayerData()
    local items   = {}

    if xPlayer.inventory then
        for i, item in ipairs(xPlayer.inventory) do
            if item.count > 0 then
                table.insert(items, {
                    name   = item.name,
                    label  = item.label,
                    count  = item.count,
                    weight = item.weight or 0.0,
                    slot   = i - 1,
                })
            end
        end
    end

    -- ── REINES MAXIMALGEWICHT DIREKT AUS CONFIG HOLES ──
    local maxWeight = 50.0
    if Config and Config.MaxWeight then
        maxWeight = Config.MaxWeight
    elseif xPlayer.maxWeight and xPlayer.maxWeight > 0 then
        maxWeight = xPlayer.maxWeight
    end

    -- ── REINES AKTUELLES GEWICHT BESTIMMEN ──
    local currentWeight = 0.0
    if xPlayer.weight and xPlayer.weight > 0 then
        currentWeight = xPlayer.weight
    end

    -- Falls dein ESX-Server Gegenstände intern in Gramm wiegt (z.B. ein Brot wiegt 100g statt 0.1kg),
    -- das aktuelle Gesamtgewicht aber über 1000 steigt, rechnen wir NUR das aktuelle Gewicht um:
    if currentWeight > 1000 then
        currentWeight = currentWeight / 1000
    end

    return {
        playerItems     = items,
        playerWeight    = tonumber(currentWeight) or 0.0,
        playerMaxWeight = tonumber(maxWeight) or 50.0,
        money           = xPlayer.money     or 0,
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
        TriggerServerEvent('esx_inventory:getTrunk', trunkNetId)
    else
        local data = BuildPlayerData({}, 0, false)
        SendNUIMessage({ action = 'openInventory', data = data })
        
        -- Aktiviert Maus/Fokus und blockiert Eingaben
        SetNuiFocus(true, true)
        DisableControls()
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

RegisterNetEvent('esx_inventory:receiveTrunk')
AddEventHandler('esx_inventory:receiveTrunk', function(trunkItems, trunkWeight)
    local data = BuildPlayerData(trunkItems, trunkWeight, true)
    SendNUIMessage({ action = 'openInventory', data = data })
    
    -- Aktiviert Maus/Fokus beim Kofferraum und blockiert Eingaben
    SetNuiFocus(true, true)
    DisableControls()
end)

RegisterNUICallback('closeInventory', function(_, cb)
    CloseInventory()
    cb('ok')
end)

RegisterNUICallback('useItem', function(data, cb)
    TriggerServerEvent('esx_inventory:useItem', data.name)
    cb('ok')
end)

RegisterNUICallback('giveItem', function(data, cb)
    TriggerServerEvent('esx_inventory:giveItem', data.name, data.count)
    cb('ok')
end)

RegisterNUICallback('dropItem', function(data, cb)
    TriggerServerEvent('esx_inventory:dropItem', data.name, data.count)
    cb('ok')
end)

RegisterNUICallback('moveItem', function(data, cb)
    TriggerServerEvent('esx_inventory:moveItem',
        data.fromGrid, data.fromSlot,
        data.toGrid,   data.toSlot,
        trunkNetId)
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

RegisterNetEvent('esx_inventory:clientUpdate')
AddEventHandler('esx_inventory:clientUpdate', function(updatedItems, weight)
    if not isOpen then return end
    SendNUIMessage({ action = 'updateInventory', data = { playerItems = updatedItems, playerWeight = weight } })
end)

RegisterNetEvent('esx_inventory:trunkUpdate')
AddEventHandler('esx_inventory:trunkUpdate', function(trunkItems, trunkWeight)
    if not isOpen then return end
    SendNUIMessage({ action = 'updateInventory', data = { trunkItems = trunkItems, trunkWeight = trunkWeight } })
end)
