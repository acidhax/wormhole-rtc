var wormholeRTC = function (enableWebcam, enableAudio) {
	var self = this;
	EventEmitter.EventEmitter.call(this);
	this.rtcFunctions = {};
	this.peers = {};
	this.peerTransports = {};
	this.wormholePeers = {};

	this.streams = [];
	this.callback = [];

	this.enableWebcam = enableWebcam || false;
	this.enableAudio = enableAudio || false;
	
	var MediaConstraints = {
		audio: this.enableAudio,
		video: this.enableWebcam
	};
	navigator.webkitGetUserMedia(MediaConstraints, function (mediaStream) {
		self.addStream(mediaStream);
		self.ready();
		self.emit("ready");
	}, function (err) {
		// 
	});
	this.addRTCFunction("handleOffer", function (offerDescription, cb) {
		self.handleOffer(this.id, offerDescription, cb);
	});
	this.addRTCFunction("handleAnswer", function (answerDescription) {
		self.handleAnswer(this.id, answerDescription);
	});
	this.addRTCFunction("addIceCandidate", function (candidate) {
		self.handleIceCandidate(this.id, candidate);
	});
};

wormholeRTC.prototype = Object.create(EventEmitter.EventEmitter.prototype);
wormholeRTC.prototype.ready = function (cb) {
	if (cb) {
		this.callback.push(cb);
		if (this._readyFired) {
			cb.call(this);
		}
	} else {
		this._readyFired = true;
		for (var i =0; i < this.callback.length; i++) {
			this.callback[i].call(this);
		}
	}
};
wormholeRTC.prototype.attachWormholeServer = function(wh) {
	var self = this;
	this.wh = wh;
	wh.on("createOffer", function () {
		self.createOffer.apply(self, arguments);
	});
	wh.on("handleOffer", function () {
		self.handleOffer.apply(self, arguments);
	});
	wh.on("handleAnswer", function () {
		self.handleAnswer.apply(self, arguments);
	});
	wh.on("handleLeave", function () {
		self.handleLeave.apply(self, arguments);
	});
	wh.on("handleIceCandidate", function () {
		self.handleIceCandidate.apply(self, arguments);
	});
	wormhole.prototype.message = function(id, channel) {
		var args = [].slice.call(arguments);
		args.shift();
		args.shift();
		if (self.channelMembers[channel][id] && this.wormholePeers[id]) {
			// Use RTC
			self.wormholePeers[id].rtc.message.apply(self, args);
		} else {
			// Use Socket.IO messaging.
			this.rpc.message.apply(this, arguments);
		}
	};
	wormhole.prototype.createConnection = function () {
		return self.createConnection.apply(self, [].slice.call(arguments));
	};
	wormhole.prototype.createOffer = function () {
		return self.createOffer.apply(self, [].slice.call(arguments));
	};
	wormhole.prototype.handleOffer = function () {
		return self.handleOffer.apply(self, [].slice.call(arguments));
	};
	wormhole.prototype.handleTimeout = function () {
		return self.handleTimeout.apply(self, [].slice.call(arguments));
	};
	wormhole.prototype.handleAnswer = function () {
		return self.handleAnswer.apply(self, [].slice.call(arguments));
	};
	wormhole.prototype.handleIceCandidate = function () {
		return self.handleIceCandidate.apply(self, [].slice.call(arguments));
	};
	wormhole.prototype.addStream = function () {
		return self.addStream.apply(self, [].slice.call(arguments));
	};
	wormhole.prototype.handleLeave = function () {
		return self.handleLeave.apply(self, [].slice.call(arguments));
	};
	wormhole.prototype.getPeers = function () {
		return self.getPeers.apply(self, [].slice.call(arguments));
	};
	wormhole.prototype.getPeer = function () {
		return self.getPeer.apply(self, [].slice.call(arguments));
	};
};

wormholeRTC.prototype.addRTCFunction = function(key, func) {
	var self = this;
	this.rtcFunctions[key] = func;
};

wormholeRTC.createConnection = function (ondatachannel, onicecandidate, onaddstream) {
	var peer = new webkitRTCPeerConnection({
		iceServers: [
			{ url: "stun:stun.l.google.com:19302" },
			{ url: 'turn:asdf@ec2-54-227-128-105.compute-1.amazonaws.com:3479', credential:'asdf' }
		]
	}, { 'optional': [{'DtlsSrtpKeyAgreement': true}, {'SctpDataChannels': true}] });

	peer.ondatachannel = function (ev) {
		ondatachannel && ondatachannel(ev);
	};
	peer.onicecandidate = function (ev) {
		onicecandidate && onicecandidate(ev);
	};
	peer.onaddstream = function (mediaStream) {
		onaddstream && onaddstream(mediaStream);
	};
	return peer;
};

wormholeRTC.prototype.createConnection = function(id) {
	var self = this;
	this.peers[id] = wormholeRTC.createConnection(function (ev) {
		self.peerTransports[id] = ev.channel;
		if (!self.wormholePeers[id]) {
			self.wormholePeers[id] = new wormholePeer(id, ev.channel.label, self);
		}
		ev.channel.onopen = function () {
			self.wormholePeers[id].setRTCFunctions(self.rtcFunctions);
			self.wormholePeers[id].setTransport(self.peerTransports[id]);
			self.wormholePeers[id].setPeer(self.peers[id]);
			self.wormholePeers[id].renegotiating = false;
			self.emit("rtcConnection", self.wormholePeers[id]);
		}
		ev.channel.onclose = function () {
			self.emit("rtcDisonnection", self.wormholePeers[id]);
		}
	}, function (event) {
		if (self.wormholePeers[id] && self.wormholePeers[id].renegotiating) {
			self.wormholePeers[id].rtc.addIceCandidate(event.candidate);
		} else {
			self.wh.rpc.addIceCandidate(id, event.candidate);
			self.emit("addIceCandidate", id, event.candidate);
		}
	}, function(mediaStream) {
		// TODO: video.src = webkitURL.createObjectURL(mediaStream);
    });
	return this.peers[id];
};

wormholeRTC.createOffer = function (peer, cb) {
	peer.createOffer(
		function(desc) {
			_offerDescription = desc;
			peer.setLocalDescription(desc);
			cb(desc);
		},
		function() {
		}
	);
};

wormholeRTC.prototype.createOffer = function(id, channel, cb) {
	var _offerDescription;
	var self = this;
	var connect = this.createConnection(id);
	setTimeout(function () {
		if (connect.readyState == "connecting") {
			// failed.
			self.handleTimeout(id, channel);
		}
	}, 30000);
	this.peerTransports[id] = connect.createDataChannel(channel);

	// self.wormholePeers[id] = new wormholePeer(id, channel, self);
	self.peers[id].ondatachannel({channel: this.peerTransports[id]});

	this.peerTransports[id].onclose = function () {
		self.emit("rtcDisonnection", self.wormholePeers[id]);
	};
	wormholeRTC.createOffer(connect, function (desc) {
		if (this.wormholePeers[id]) {
			this.wormholePeers[id].setPeer(connect);
		}
		cb(null, desc);
	}.bind(self));
};

wormholeRTC.prototype.handleOffer = function(id, offerDescription, cb) {
	if (id && offerDescription) {
		var self = this;
		var connect = this.createConnection(id);
		setTimeout(function () {
			if (connect.readyState == "connecting") {
				// failed.
				self.handleTimeout(id);
			}
		}, 30000);
		var remoteDescription = new RTCSessionDescription(offerDescription);
		connect.setRemoteDescription(remoteDescription);
		connect.createAnswer(function (answer) {
			connect.setLocalDescription(answer);
			cb(null, answer);
		}, function (err) {
			cb("No answer", err);
		});
	}
};

wormholeRTC.prototype.handleTimeout = function(id, channel) {
	this.peers[id].close();
	delete this.peers[id];
	delete this.peerTransports[id];
	delete this.wormholePeers[id];

	self.emit("timeout", id,  channel);
	// self.rpc.reinitiateOffer(id, channel);
};

wormholeRTC.prototype.handleAnswer = function(id, answerDescription) {
	if (id && answerDescription) {
		var connect = this.peers[id];
		var remoteDescription = new RTCSessionDescription(answerDescription);
		connect.setRemoteDescription(remoteDescription);
	}
};

wormholeRTC.prototype.handleIceCandidate = function(id, candidate) {
	if (id && candidate && this.peers[id]) {
		this.peers[id].addIceCandidate(new RTCIceCandidate(candidate));
	}
};

wormholeRTC.prototype.addStream = function (stream, type) {
	this.streams.push(new webkitMediaStream(stream));
};

wormholeRTC.prototype.handleLeave = function(id) {
	// remove ID
	this.emit("rtcDisonnection", this.wormholePeers[id]);
	this.peers[id].close();
	delete this.peers[id];
	delete this.wormholePeers[id];
	delete this.peerTransports[id];
};

wormholeRTC.prototype.getPeers = function(cb) {
	
};

wormholeRTC.prototype.getPeer = function(id) {
	return this.wormholePeers[id];
};

var wormholePeer = function (id, datachannel, controller) {
	EventEmitter.EventEmitter.call(this);
	var self = this;
	this.id = id;
	this.channel = datachannel || "TEMPCHANNELNAME";
	this.controller = controller;
	this.rtc = {};
	this.uuidList = {};
	this.renegotiating = false;
};

wormholePeer.prototype = Object.create(EventEmitter.EventEmitter.prototype);

wormholePeer.prototype.setPeer = function(peer) {
	this.peer = peer;
};

wormholePeer.prototype.setRTCFunctions = function(rtcFunctions) {
	this.rtcFunctions = rtcFunctions;
	this.syncRtc(rtcFunctions);
};

wormholePeer.prototype.setTransport = function(transport) {
	this.transport = transport;
	transport.onmessage = function (ev) {
		var data = JSON.parse(ev.data);
		if (data.rtc) {
			self.executeRtc(data.data.function, data.data.arguments, data.data.uuid);
		} else if (data.rtcResponse) {
			var uuid = data.data.uuid;
			// The arguments to send to the callback function.
			var params = data.data.args;
			// Get function to call from uuidList.
			var func = self.uuidList[uuid];
			if (func && typeof func === "function") {
				// Remove function from uuidList.
				delete self.uuidList[uuid];
				// Execute function with arguments! Blama llama lamb! Blam alam alam
				func.apply(self, params);
			}
		}
	};
};

wormholePeer.prototype.muteAudio = function () {
	// Audio stream still continues, but doesn't decode/play.
};

wormholePeer.prototype.muteVideo = function () {
	// Video stream still continues, but doesn't decode/play.
};

wormholePeer.prototype.muteLocalAudio = function () {
	// Audio stream still continues, but doesn't decode/play.
};

wormholePeer.prototype.muteLocalVideo = function () {
	// Video stream still continues, but doesn't decode/play.
};

wormholePeer.prototype.renegotiate = function (mic, webcam) {
	// Create peer
	var self = this;
	self.renegotiating = true;
	var oldPeer = self.peer;
	var video;
	var MediaConstraints = {
		audio: mic,
		video: webcam,
		screen: false
	};
	navigator.webkitGetUserMedia(MediaConstraints, function (mediaStream) {
		if (webcam) {
			video = document.createElement("video");
			video.src = window.URL.createObjectURL(mediaStream);
		}
		self.controller.createOffer(self.id, self.channel, function (desc) {
			self.peer.addStream(mediaStream);
			self.rtc.handleOffer(desc, function (remoteDescription) {
				self.controller.handleAnswer(self.id, remoteDescription);
			});
		});
	}, function (err) {
		// 
	});
};

wormholePeer.prototype.syncRtc = function (data) {
	for (var j in data) {
		this.rtc[j] = this.generateRTCFunction(j, true);
	}
};

wormholePeer.prototype.generateRTCFunction = function (functionName) {
	var self = this;
	return function () {
		var args = [].slice.call(arguments);
		var callback = null;
		if (typeof(args[args.length-1]) == "function") {
			// do something
			callback = args.splice(args.length-1, 1)[0];
		}
		self.executeRTCFunction(functionName, args, callback);
	};
};

wormholePeer.prototype.executeRTCFunction = function(functionName, args, callback) {
	var self = this;
	var _callback = function () {
		callback.apply(null, [].slice.call(arguments));
	}
	var hasCallback = (typeof callback === "function");
	var out = {
		"function": functionName,
		"arguments": args
	};
	if (hasCallback) {
		out.uuid = __randomString();
		this.uuidList[out.uuid] = _callback;
		setTimeout(function () {
			if (self.uuidList[out.uuid]) {
				try {
					self.uuidList[out.uuid].call(self, "timeout");
					delete self.uuidList[out.uuid];
				} catch (ex) {
					delete self.uuidList[out.uuid];
					throw ex;
				}
			}
		}, 30000);
	}
	if (this.transport.readyState == "open") {
		this.transport.send(JSON.stringify({"rtc": true, data: out}));
	} else if (self.uuidList[out.uuid]) {
		self.uuidList[out.uuid].call(self, "Transport closed");
		delete self.uuidList[out.uuid];
	}
};

wormholePeer.prototype.executeRtc = function(methodName, args, uuid) {
	var self = this;
	var argsWithCallback = args.slice(0);
	argsWithCallback.push(function () {
		self.callbackRtc(uuid, [].slice.call(arguments));
	});
	this.rtcFunctions[methodName].apply(self, argsWithCallback);
};""

wormholePeer.prototype.callbackRtc = function(uuid, args) {
	this.transport.send(JSON.stringify({"rtcResponse": true, data: {uuid: uuid, args: args}}));
};

var __randomString = function() {
	var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";
	var string_length = 64;
	var randomstring = '';
	for (var i=0; i<string_length; i++) {
		var rnum = Math.floor(Math.random() * chars.length);
		randomstring += chars.substring(rnum,rnum+1);
	}
	return randomstring;
};



// 
// wormholePeer.renegotiate(true, false);
// --> wormholePeer.rtc.createOffer(id, channel, cb)