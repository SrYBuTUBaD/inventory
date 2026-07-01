-- ============================================================
--  ITEMS – Client-seitige Animationen / Effekte
-- ============================================================

RegisterNetEvent('inventory:useMedikit')
AddEventHandler('inventory:useMedikit', function()
    local ped = PlayerPedId()

    -- Animation laden
    local dict = 'amb@medic@standing@kneel@base'
    RequestAnimDict(dict)
    local timeout = 0
    while not HasAnimDictLoaded(dict) and timeout < 200 do
        Wait(10)
        timeout = timeout + 1
    end

    -- Bewegung kurz blockieren, damit man während der Animation nicht wegläuft
    FreezeEntityPosition(ped, true)

    TaskPlayAnim(ped, dict, 'base', 8.0, -8.0, 4500, 1, 0, false, false, false)

    Wait(4500)

    ClearPedTasks(ped)
    FreezeEntityPosition(ped, false)

    -- Heilung (Beispiel: volle Gesundheit, kannst du anpassen)
    local maxHealth = GetEntityMaxHealth(ped)
    SetEntityHealth(ped, maxHealth)
end)
