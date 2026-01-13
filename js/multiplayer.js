var multiplayer = {
    // WebXDC Realtime multiplayer (replaces WebSocket)

    start: function() {
        game.type = "multiplayer";

        // Initialize WebXDC network
        if (!webxdcNet.init()) {
            game.showMessageBox("WebXDC not available. Multiplayer requires sharing this app in a chat.");
            return;
        }

        // Set up message handler
        webxdcNet.onMessage = multiplayer.handleMessage;

        // Set up peer join handler
        webxdcNet.onPeerJoin = function(peerAddr, isHost) {
            console.log('Peer joined:', peerAddr, 'We are host:', isHost);
            multiplayer.onPeerJoin(isHost);
        };

        // Set up peer leave handler
        webxdcNet.onPeerLeave = function(peerAddr) {
            console.log('Peer left:', peerAddr);
            multiplayer.endGame("The other player has disconnected.");
        };

        // Show waiting screen
        $('.gamelayer').hide();
        $('#loadingscreen').show();
        $('#loadingmessage').html('<div class="waiting-title">MULTIPLAYER</div><div class="waiting-status">Waiting for opponent<span class="dots"></span></div>');
    },

    onPeerJoin: function(isHost) {
        multiplayer.isHost = isHost;

        if (isHost) {
            // Host: assign colors and initialize level
            multiplayer.color = "blue";
            multiplayer.peerColor = "green";
            multiplayer.initGameAsHost();
        } else {
            // Guest: wait for host to send init_level
            multiplayer.color = "green";
            multiplayer.peerColor = "blue";
            $('#loadingmessage').html('<div class="waiting-title">CONNECTED</div><div class="waiting-status">Starting game<span class="dots"></span></div>');
        }
    },

    initGameAsHost: function() {
        console.log("Host: Initializing game");

        // Initialize multiplayer state
        multiplayer.commands = [[]];
        multiplayer.lastReceivedTick = 0;
        multiplayer.currentTick = 0;
        multiplayer.playersReady = 0;
        multiplayer.lastTickConfirmed = { "blue": 0, "green": 0 };

        // Load the first multiplayer level
        multiplayer.currentLevel = 0;

        // Randomly select spawn locations
        var spawns = [0, 1, 2, 3];
        var blueSpawn = spawns.splice(Math.floor(Math.random() * spawns.length), 1)[0];
        var greenSpawn = spawns.splice(Math.floor(Math.random() * spawns.length), 1)[0];
        var spawnLocations = { "blue": blueSpawn, "green": greenSpawn };

        // Send init_level to peer (and handle locally)
        var initMessage = {
            type: "init_level",
            spawnLocations: spawnLocations,
            level: multiplayer.currentLevel
        };

        webxdcNet.send(initMessage);
        multiplayer.initMultiplayerLevel(initMessage);
    },

    handleMessage: function(message) {
        switch (message.type) {
            case "init_level":
                multiplayer.initMultiplayerLevel(message);
                break;
            case "initialized_level":
                multiplayer.onPlayerReady();
                break;
            case "start_game":
                multiplayer.startGame();
                break;
            case "game_tick":
                multiplayer.lastReceivedTick = message.tick;
                multiplayer.commands[message.tick] = message.commands;
                break;
            case "command":
                // Host collects commands from peer
                if (multiplayer.isHost && multiplayer.roomCommands) {
                    if (message.uids) {
                        multiplayer.roomCommands.push({ uids: message.uids, details: message.details });
                    }
                    multiplayer.lastTickConfirmed[multiplayer.peerColor] = message.currentTick + multiplayer.tickLag;
                }
                break;
            case "lose_game":
                multiplayer.endGame("The " + multiplayer.peerColor + " team has been defeated.");
                break;
            case "chat":
                game.showMessage(message.from, message.message);
                break;
        }
    },

    initMultiplayerLevel: function(messageObject) {
        $('.gamelayer').hide();
        var spawnLocations = messageObject.spawnLocations;

        // Initialize multiplayer related variables
        if (!multiplayer.isHost) {
            multiplayer.commands = [[]];
            multiplayer.lastReceivedTick = 0;
            multiplayer.currentTick = 0;
        }

        game.team = multiplayer.color;

        // Load all the items for the level
        multiplayer.currentLevel = messageObject.level;
        var level = maps.multiplayer[multiplayer.currentLevel];

        // Load all the assets for the level
        game.currentMapImage = loader.loadImage(level.mapImage);
        game.currentLevel = level;

        // Load level Requirements
        game.resetArrays();
        for (var type in level.requirements) {
            var requirementArray = level.requirements[type];
            for (var i = 0; i < requirementArray.length; i++) {
                var name = requirementArray[i];
                if (window[type]) {
                    window[type].load(name);
                } else {
                    console.log('Could not load type :', type);
                }
            }
        }

        for (var i = level.items.length - 1; i >= 0; i--) {
            var itemDetails = level.items[i];
            game.add(itemDetails);
        }

        // Add starting items for both teams at their respective spawn locations
        for (var team in spawnLocations) {
            var spawnIndex = spawnLocations[team];
            for (var i = 0; i < level.teamStartingItems.length; i++) {
                var itemDetails = $.extend(true, {}, level.teamStartingItems[i]);
                itemDetails.x += level.spawnLocations[spawnIndex].x + itemDetails.x;
                itemDetails.y += level.spawnLocations[spawnIndex].y + itemDetails.y;
                itemDetails.team = team;
                game.add(itemDetails);
            }

            if (team == game.team) {
                game.offsetX = level.spawnLocations[spawnIndex].startX * game.gridSize;
                game.offsetY = level.spawnLocations[spawnIndex].startY * game.gridSize;
            }
        }

        // Create terrain grid
        game.currentMapTerrainGrid = [];
        for (var y = 0; y < level.mapGridHeight; y++) {
            game.currentMapTerrainGrid[y] = [];
            for (var x = 0; x < level.mapGridWidth; x++) {
                game.currentMapTerrainGrid[y][x] = 0;
            }
        }
        for (var i = level.mapObstructedTerrain.length - 1; i >= 0; i--) {
            var obstruction = level.mapObstructedTerrain[i];
            game.currentMapTerrainGrid[obstruction[1]][obstruction[0]] = 1;
        }
        game.currentMapPassableGrid = undefined;

        // Load Starting Cash
        game.cash = $.extend([], level.cash);

        // Notify ready when assets loaded
        if (loader.loaded) {
            multiplayer.onLevelLoaded();
        } else {
            loader.onload = function() {
                multiplayer.onLevelLoaded();
            };
        }
    },

    onLevelLoaded: function() {
        console.log('Level loaded, notifying ready');
        webxdcNet.send({ type: "initialized_level" });

        if (multiplayer.isHost) {
            // Host also counts as ready
            multiplayer.onPlayerReady();
        }
    },

    onPlayerReady: function() {
        multiplayer.playersReady = (multiplayer.playersReady || 0) + 1;
        console.log('Players ready:', multiplayer.playersReady);

        if (multiplayer.playersReady >= 2) {
            // Both players ready, host starts the game
            if (multiplayer.isHost) {
                console.log('Both players ready, starting game');
                webxdcNet.send({ type: "start_game" });
                multiplayer.startGame();
            }
        }
    },

    startGame: function() {
        console.log('Starting game, isHost:', multiplayer.isHost);
        fog.initLevel();
        game.animationLoop();
        multiplayer.animationInterval = setInterval(multiplayer.tickLoop, game.animationTimeout);
        game.start();

        // Host runs the server tick loop
        if (multiplayer.isHost) {
            multiplayer.roomCommands = [];
            multiplayer.tickLag = 2; // Fixed tick lag for simplicity
            multiplayer.serverInterval = setInterval(multiplayer.serverTickLoop, 100);
        }
    },

    // Host's server tick loop (replaces server.js logic)
    serverTickLoop: function() {
        if (!multiplayer.isHost) return;

        var blueReady = multiplayer.lastTickConfirmed["blue"] >= multiplayer.currentTick;
        var greenReady = multiplayer.lastTickConfirmed["green"] >= multiplayer.currentTick;

        if (blueReady && greenReady) {
            // Broadcast tick to peer
            var tickMessage = {
                type: "game_tick",
                tick: multiplayer.currentTick + multiplayer.tickLag,
                commands: multiplayer.roomCommands
            };
            webxdcNet.send(tickMessage);

            // Also apply locally
            multiplayer.lastReceivedTick = tickMessage.tick;
            multiplayer.commands[tickMessage.tick] = tickMessage.commands;

            multiplayer.currentTick++;
            multiplayer.roomCommands = [];
        }
    },

    sendCommand: function(uids, details) {
        multiplayer.sentCommandForTick = true;

        var commandMessage = {
            type: "command",
            uids: uids,
            details: details,
            currentTick: multiplayer.currentTick
        };

        if (multiplayer.isHost) {
            // Host adds command directly to room commands
            if (uids) {
                multiplayer.roomCommands.push({ uids: uids, details: details });
            }
            multiplayer.lastTickConfirmed["blue"] = multiplayer.currentTick + multiplayer.tickLag;
        } else {
            // Guest sends command to host
            webxdcNet.send(commandMessage);
        }
    },

    tickLoop: function() {
        // Client tick loop - execute commands when received
        var localTick = multiplayer.isHost ?
            (multiplayer.currentTick + multiplayer.tickLag - 1) :
            multiplayer.currentTick;

        if (localTick <= multiplayer.lastReceivedTick) {
            var commands = multiplayer.commands[localTick];
            if (commands) {
                for (var i = 0; i < commands.length; i++) {
                    game.processCommand(commands[i].uids, commands[i].details);
                }
            }

            game.animationLoop();

            if (!multiplayer.sentCommandForTick) {
                multiplayer.sendCommand();
            }

            if (!multiplayer.isHost) {
                multiplayer.currentTick++;
            }
            multiplayer.sentCommandForTick = false;
        }
    },

    loseGame: function() {
        webxdcNet.send({ type: "lose_game" });
    },

    endGame: function(reason) {
        game.running = false;
        clearInterval(multiplayer.animationInterval);
        if (multiplayer.serverInterval) {
            clearInterval(multiplayer.serverInterval);
        }
        webxdcNet.cleanup();
        game.showMessageBox(reason, multiplayer.exit);
    },

    exit: function() {
        $('.gamelayer').hide();
        $('#gamestartscreen').show();
    }
};

// Chat handler
$(window).keydown(function(e) {
    if (game.type != "multiplayer" || !game.running) {
        return;
    }

    var keyPressed = e.which;
    if (e.which == 13) { // Enter key
        var isVisible = $('#chatmessage').is(':visible');
        if (isVisible) {
            if ($('#chatmessage').val() != '') {
                var cleanedMessage = $('#chatmessage').val().replace(/[<>]/g, "");
                webxdcNet.send({ type: "chat", from: multiplayer.color, message: cleanedMessage });
                // Show own message
                game.showMessage(multiplayer.color, cleanedMessage);
                $('#chatmessage').val('');
            }
            $('#chatmessage').hide();
        } else {
            $('#chatmessage').show();
            $('#chatmessage').focus();
        }
        e.preventDefault();
    } else if (e.which == 27) { // Escape key
        $('#chatmessage').hide();
        $('#chatmessage').val('');
        e.preventDefault();
    }
});
