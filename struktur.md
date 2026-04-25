📂server/
│
├── 📄 .env                             # Config: port, DB path, secret
├── 📄 start.js                         # Launcher: mulai semua server sekaligus
│
├── 📂 database/                        # 💾 DATABASE
│   ├── schema.sql                      # Full SQLite schema (adaptasi dari readme)
│   ├── seeds/
│   │   ├── servers.sql                 # Data server list
│   │   └── init.js                     # Run seeds
│    
│
├── 📂 login-server/                    # 🔓 SERVER 1 — Login (Port 8000)
│   ├── 📄 .package.json  & index.js                        # Entry point, Socket.IO, TANPA TEA
│   └── handlers/
│       ├── loginGame.js                # Autentikasi user (create/check di DB)
│       ├── getServerList.js            # Return daftar server + URLs
│       ├── saveHistory.js              # Pilih server, generate loginToken
│       ├── saveUserEnterInfo.js        # Laporkan entry game
│       └── saveLanguage.js             # Simpan preferensi bahasa
│
├── 📂 chat-server/                     # 💬 SERVER 2 — Chat (Port 8200)
│   ├──  📄 .package.json  & index.js                        # Entry point, Socket.IO + TEA verify
│   ├── handlers/
│   │   ├── login.js                    # Auth chat session (userId + serverId)
│   │   ├── sendMsg.js                  # Kirim pesan ke room
│   │   ├── joinRoom.js                 # Join room chat
│   │   ├── leaveRoom.js                # Leave room chat
│   │   └── getRecord.js                # Ambil history chat (paginasi)
│   └── rooms.js                        # Room management logic
│
├── 📂 dungeon-server/                  # ⚔️ SERVER 3 — Dungeon Multiplayer (Port 8300)
│   ├── 📄 .package.json & index.js                        # Entry point, Socket.IO + TEA + HTTP routes
│   ├── handlers/
│   │   ├── clientConnect.js            # Konfirmasi koneksi ke instance dungeon
│   │   ├── refreshApplyList.js         # Refresh daftar applicant
│   │   ├── changePos.js                # Ubah posisi member di grid
│   │   ├── startBattle.js              # Mulai battle dungeon
│   │   ├── agree.js                    # Terima applicant
│   │   ├── queryUserTeam.js            # Lihat lineup user
│   │   ├── changeAutoJoinCondition.js  # Set auto-join criteria
│   │   ├── queryTodayMap.js            # Ambil dungeon available hari ini
│   │   ├── queryRobot.js               # Ambil robot tersedia
│   │   ├── queryHistoryMap.js          # Ambil dungeon history
│   │   ├── queryTeamRecord.js          # Ambil team record
│   │   └── queryBattleRecord.js        # Ambil battle record
│   └── http-routes.js                  # HTTP endpoints (query dari main-server)
│
├── 📂 main-server/                     # 🎮 SERVER 4 — Main Game (Port 8100) — TERBESAR
│   ├── 📄 .package.json & index.js                         # Entry point, Socket.IO + TEA + Router
│   ├── notify.js                       # 35+ Notify push events handler
│   ├── middlewares/
│   │   ├── auth.js                     # Validasi loginToken per request
│   │   ├── rateLimit.js                # Rate limiting per user
│   │   └── errorHandler.js             # Global error handler
│   │
│   └── handlers/                       # ~450+ handlers, diorganisir per module
│       │
│       ├── 📂 user/                    # 13 actions — profil pemain
│       │   ├── enterGame.js            # ⭐ PENTANT: Return 57+ field state pemain
│       │   ├── exitGame.js             # Save & disconnect
│       │   ├── registChat.js           # Return chat URL + room IDs
│       │   ├── changeNickName.js
│       │   ├── changeHeadImage.js
│       │   ├── changeHeadBox.js
│       │   ├── queryPlayerHeadIcon.js
│       │   ├── saveFastTeam.js
│       │   ├── setFastTeamName.js
│       │   ├── suggest.js
│       │   ├── clickSystem.js
│       │   ├── getBulletinBrief.js
│       │   └── readBulletin.js
│       │
│       ├── 📂 hero/                    # 21 actions — sistem hero
│       │   ├── getAll.js               # Return semua hero pemain
│       │   ├── getAttrs.js
│       │   ├── evolve.js
│       │   ├── resolve.js
│       │   ├── reborn.js
│       │   ├── inherit.js
│       │   ├── splitHero.js
│       │   ├── activeSkill.js
│       │   ├── useSkin.js
│       │   ├── activeSkin.js
│       │   ├── wakeUp.js
│       │   ├── autoLevelUp.js
│       │   ├── autoHeroBreak.js
│       │   ├── activeHeroBreak.js
│       │   ├── heroBreak.js
│       │   ├── rebornSelfBreak.js
│       │   ├── queryHeroEquipInfo.js
│       │   ├── queryArenaHeroEquipInfo.js
│       │   ├── qigong.js
│       │   ├── saveQigong.js
│       │   └── cancelQigong.js
│       │
│       ├── 📂 summon/                  # 6 actions — gacha
│       │   ├── summonOneFree.js
│       │   ├── summonOne.js
│       │   ├── summonTen.js
│       │   ├── summonEnergy.js
│       │   ├── setWishList.js
│       │   └── readWishList.js
│       │
│       ├── 📂 dungeon/                 # 4 actions — solo dungeon
│       │   ├── startBattle.js
│       │   ├── checkBattleResult.js
│       │   ├── sweep.js
│       │   └── buyCount.js
│       │
│       ├── 📂 equip/                   # 10 actions — equipment
│       ├── 📂 weapon/                  # 9 actions — senjata
│       ├── 📂 imprint/                 # 12 actions — sign/imprint
│       ├── 📂 genki/                   # 4 actions
│       ├── 📂 gemstone/                # 4 actions
│       ├── 📂 resonance/               # 6 actions — hero link
│       ├── 📂 superSkill/              # 5 actions
│       ├── 📂 backpack/                # 5 actions — inventory
│       ├── 📂 mail/                    # 6 actions
│       ├── 📂 battleMedal/             # 7 actions
│       ├── 📂 teamTraining/            # 4 actions
│       ├── 📂 dragon/                  # 3 actions — dragon ball wish
│       ├── 📂 hangup/                  # 8 actions — idle/AFK farming
│       ├── 📂 shop/                    # 4 actions
│       ├── 📂 arena/                   # 10 actions — PvP
│       ├── 📂 guild/                   # 34 actions — guild
│       ├── 📂 friend/                  # 16 actions
│       ├── 📂 war/                     # 12 actions — global war
│       ├── 📂 topBattle/               # 19 actions
│       ├── 📂 ballWar/                 # 14 actions — dragon ball war
│       ├── 📂 activity/                # 105 actions — TERBESAR
│       ├── 📂 teamDungeonGame/         # 18 actions — team dungeon relay
│       ├── 📂 tower/                   # 12 actions — karin tower
│       ├── 📂 snake/                   # 9 actions
│       ├── 📂 expedition/              # 12 actions
│       ├── 📂 trial/                   # 7 actions
│       ├── 📂 gravity/                 # 4 actions
│       ├── 📂 maha/                    # 6 actions
│       ├── 📂 mine/                    # 8 actions
│       ├── 📂 cellGame/                # 8 actions
│       ├── 📂 bossCompetition/         # 7 actions
│       ├── 📂 training/                # 6 actions
│       ├── 📂 entrust/                 # 12 actions
│       ├── 📂 gift/                    # 12 actions — welfare
│       ├── 📂 timeBonus/               # 2 actions
│       ├── 📂 littleGame/              # 3 actions
│       ├── 📂 heroImage/               # 7 actions
│       ├── 📂 userMsg/                 # 6 actions
│       ├── 📂 market/                  # 1 action
│       ├── 📂 vipMarket/               # 1 action
│       ├── 📂 rank/                    # 2 actions
│       ├── 📂 task/                    # 2 actions — quest
│       ├── 📂 battle/                  # 1 action
│       ├── 📂 timeMachine/             # 4 actions
│       ├── 📂 timeTrial/               # 6 actions
│       ├── 📂 strongEnemy/             # 5 actions
│       ├── 📂 checkin/                 # 1 action
│       ├── 📂 monthCard/               # 2 actions
│       ├── 📂 guide/                   # 1 action
│       ├── 📂 recharge/                # 1 action — IAP
│       ├── 📂 retrieve/                # 2 actions
│       ├── 📂 questionnaire/           # 1 action
│       ├── 📂 battleRecordCheck/       # 1 action — anti-cheat
│       ├── 📂 buryPoint/               # 1 action — analytics
│       ├── 📂 downloadReward/          # 2 actions
│       └── 📂 youTuber/                # 2 actions
│
└── 📂 .htdocs/                     # 📁 (folder seperti di github)
    ├── resource/json/                  # 471 JSON configs (loaded by gameData.js)
    └── resource/properties/            # serversetting.json, clientversion.json
    └index.html, dll