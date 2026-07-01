fx_version 'cerulean'
game 'gta5'

name        'inventory'
description 'Custom Inventory'
author      'Kylian'
version     '1.0.0'

shared_scripts {
    '@es_extended/imports.lua',
    'config.lua'
}

dependencies {
    'oxmysql'
}

client_scripts {
    'client/main.lua',
    'client/items.lua'
}

server_scripts {
    'server/main.lua',
    'server/items.lua'
}

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/css/style.css',
    'html/js/app.js',
    'html/img/items/*.png'
}
