const _SUPABASE_URL = 'https://wlrdtgttnidaqviujsyz.supabase.co';
const _SUPABASE_KEY = 'sb_publishable_quLfjK1EgrPmRGFCoavQow_G_nQ721t';

class KokoRealtimeSDK {
    constructor() {
        this._client = null;
        this._channels = {};
        this._handlers = {};
        this._presenceHandlers = {};
        this._statusHandlers = {};
        this._opts = {};
        this._retryTimers = {};
        this._retryCounts = {};
    }

    async init() {
        if (this._client) return;
        if (!window.supabase) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
                script.onload = resolve;
                script.onerror = () => reject(new Error('Failed to load Supabase SDK'));
                document.head.appendChild(script);
            });
        }
        this._client = window.supabase.createClient(_SUPABASE_URL, _SUPABASE_KEY);
    }

    join(channelName, opts) {
        if (!this._client) return;
        opts = opts || {};

        this._opts[channelName] = opts;
        this._handlers[channelName] = this._handlers[channelName] || {};
        this._presenceHandlers[channelName] = this._presenceHandlers[channelName] || [];
        this._statusHandlers[channelName] = this._statusHandlers[channelName] || [];
        this._retryCounts[channelName] = 0;

        this._subscribe(channelName);
    }

    _subscribe(channelName) {
        if (this._channels[channelName]) {
            this._channels[channelName].unsubscribe();
            delete this._channels[channelName];
        }

        const opts = this._opts[channelName] || {};
        const withPresence = opts.presence !== false;
        const broadcastSelf = opts.broadcastSelf !== false;
        const meta = opts.presenceMeta || {};
        const maxRetries = opts.maxRetries !== undefined ? opts.maxRetries : 5;

        const cfg = { config: { broadcast: { self: broadcastSelf } } };
        if (withPresence) cfg.config.presence = { key: '' };

        const ch = this._client.channel(channelName, cfg);

        if (withPresence) {
            ch.on('presence', { event: 'sync' }, () => {
                const state = ch.presenceState();
                this._presenceHandlers[channelName].forEach(fn => fn(state));
            });
        }

        Object.entries(this._handlers[channelName]).forEach(([event, cbs]) => {
            if (cbs.length > 0) {
                ch.on('broadcast', { event }, msg => {
                    this._handlers[channelName][event].forEach(fn => fn(msg.payload));
                });
            }
        });

        ch.subscribe(status => {
            this._statusHandlers[channelName].forEach(fn => fn(status));

            if (status === 'SUBSCRIBED') {
                this._retryCounts[channelName] = 0;
                if (withPresence) {
                    ch.track(Object.assign({ joined_at: new Date().toISOString() }, meta));
                }
                return;
            }

            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                const count = this._retryCounts[channelName] || 0;
                if (maxRetries < 0 || count < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, count), 30000);
                    this._retryCounts[channelName] = count + 1;
                    clearTimeout(this._retryTimers[channelName]);
                    this._retryTimers[channelName] = setTimeout(() => {
                        if (this._opts[channelName]) {
                            this._subscribe(channelName);
                        }
                    }, delay);
                }
            }
        });

        this._channels[channelName] = ch;
    }

    on(channelName, event, callback) {
        if (!this._handlers[channelName]) this._handlers[channelName] = {};
        if (!this._handlers[channelName][event]) {
            this._handlers[channelName][event] = [];
            const ch = this._channels[channelName];
            if (ch) {
                ch.on('broadcast', { event }, msg => {
                    this._handlers[channelName][event].forEach(fn => fn(msg.payload));
                });
            }
        }
        this._handlers[channelName][event].push(callback);
    }

    send(channelName, event, payload) {
        const ch = this._channels[channelName];
        if (!ch) return;
        ch.send({ type: 'broadcast', event, payload });
    }

    track(channelName, meta) {
        const ch = this._channels[channelName];
        if (ch) ch.track(Object.assign({ joined_at: new Date().toISOString() }, meta));
    }

    leave(channelName) {
        clearTimeout(this._retryTimers[channelName]);
        const ch = this._channels[channelName];
        if (ch) ch.unsubscribe();
        delete this._channels[channelName];
        delete this._handlers[channelName];
        delete this._presenceHandlers[channelName];
        delete this._statusHandlers[channelName];
        delete this._opts[channelName];
        delete this._retryTimers[channelName];
        delete this._retryCounts[channelName];
    }

    onPresence(channelName, callback) {
        if (!this._presenceHandlers[channelName]) this._presenceHandlers[channelName] = [];
        this._presenceHandlers[channelName].push(callback);
    }

    onStatus(channelName, callback) {
        if (!this._statusHandlers[channelName]) this._statusHandlers[channelName] = [];
        this._statusHandlers[channelName].push(callback);
    }

    getPresence(channelName) {
        const ch = this._channels[channelName];
        return ch ? ch.presenceState() : null;
    }

    setup(cfg) {
        if (cfg.onPresence) this.onPresence(cfg.channel, cfg.onPresence);
        if (cfg.onStatus) this.onStatus(cfg.channel, cfg.onStatus);
        (cfg.events || []).forEach(ev => this.on(cfg.channel, ev.event, ev.handler));
        this.join(cfg.channel, {
            presence: cfg.presence,
            broadcastSelf: cfg.broadcastSelf,
            presenceMeta: cfg.presenceMeta,
            maxRetries: cfg.maxRetries,
        });
    }

    destroy() {
        Object.keys(this._channels).forEach(name => this.leave(name));
        this._client = null;
    }
}

export default KokoRealtimeSDK;