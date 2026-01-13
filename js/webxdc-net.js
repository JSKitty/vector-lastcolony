/**
 * WebXDC Realtime Network Layer for Last Colony
 *
 * Simple host selection: lowest boot timestamp = host
 * Host acts as server (tick loop, game state) AND player
 */

var webxdcNet = {
    bootTime: Date.now(),
    selfAddr: null,
    peerAddr: null,
    peerBootTime: null,
    realtime: null,
    ready: false,
    isHost: false,
    onMessage: null,
    onPeerJoin: null,
    onPeerLeave: null,
    presenceInterval: null,
    lastPeerSeen: 0,
    PEER_TIMEOUT: 5000, // Consider peer gone after 5s of no presence
    PRESENCE_INTERVAL: 1000, // Send presence every 1s

    init: function() {
        // Check if WebXDC is available
        if (!window.webxdc) {
            console.warn('WebXDC not available, multiplayer disabled');
            return false;
        }

        this.selfAddr = window.webxdc.selfAddr;

        // Join realtime channel
        this.realtime = window.webxdc.joinRealtimeChannel();

        // Set up message listener
        this.realtime.setListener(function(data) {
            webxdcNet.handleMessage(data);
        });

        this.ready = true;
        console.log('WebXDC Net ready, selfAddr:', this.selfAddr, 'bootTime:', this.bootTime);

        // Start presence broadcast
        this.startPresence();

        return true;
    },

    startPresence: function() {
        var self = this;

        // Send initial presence
        this.sendPresence();

        // Send presence periodically
        this.presenceInterval = setInterval(function() {
            self.sendPresence();
            self.checkPeerTimeout();
        }, this.PRESENCE_INTERVAL);
    },

    stopPresence: function() {
        if (this.presenceInterval) {
            clearInterval(this.presenceInterval);
            this.presenceInterval = null;
        }
    },

    sendPresence: function() {
        this.send({
            type: 'presence',
            bootTime: this.bootTime,
            addr: this.selfAddr
        });
    },

    checkPeerTimeout: function() {
        if (this.peerAddr && Date.now() - this.lastPeerSeen > this.PEER_TIMEOUT) {
            console.log('Peer timed out:', this.peerAddr);
            var oldPeer = this.peerAddr;
            this.peerAddr = null;
            this.peerBootTime = null;
            if (this.onPeerLeave) {
                this.onPeerLeave(oldPeer);
            }
        }
    },

    handleMessage: function(data) {
        if (!data) return;
        try {
            var message = (typeof data === 'object' && !data.buffer) ? data : JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));
            if (message.addr === this.selfAddr) return;
            if (message.type === 'presence') {
                this.handlePresence(message);
            } else if (this.onMessage) {
                this.onMessage(message);
            }
        } catch (e) {}
    },

    handlePresence: function(message) {
        var isNewPeer = !this.peerAddr || this.peerAddr !== message.addr;

        this.lastPeerSeen = Date.now();
        this.peerAddr = message.addr;
        this.peerBootTime = message.bootTime;

        // Determine host: lowest boot time wins
        this.isHost = this.bootTime < this.peerBootTime;

        console.log('Peer presence:', message.addr,
                    'bootTime:', message.bootTime,
                    'isHost:', this.isHost);

        // Notify of new peer
        if (isNewPeer && this.onPeerJoin) {
            this.onPeerJoin(message.addr, this.isHost);
        }
    },

    send: function(message) {
        if (!this.ready || !this.realtime) {
            return false;
        }

        // Add sender info
        message.addr = this.selfAddr;

        // Send as JSON string
        var data = JSON.stringify(message);
        this.realtime.send(new TextEncoder().encode(data));

        return true;
    },

    hasPeer: function() {
        return this.peerAddr !== null;
    },

    cleanup: function() {
        this.stopPresence();
        this.peerAddr = null;
        this.peerBootTime = null;
        this.isHost = false;
    }
};
