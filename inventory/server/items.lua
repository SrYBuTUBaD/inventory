-- ============================================================
--  ITEMS – Server-seitige Item-Funktionen (ESX.RegisterUsableItem)
-- ============================================================

ESX.RegisterUsableItem('medikit', function(source)
    local src     = source
    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer then return end

    local item = xPlayer.getInventoryItem('medikit')
    if not item or item.count < 1 then return end

    xPlayer.removeInventoryItem('medikit', 1)

    -- Heilung + Animation auf dem Client auslösen
    TriggerClientEvent('inventory:useMedikit', src)

    -- Inventar im UI aktualisieren (sofern offen)
    sendUpdate(src, xPlayer)
end)
