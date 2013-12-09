var wormholeRTC = function (enableWebcam, enableAudio) {
	EventEmitter.EventEmitter.call(this);
	this.rtcFunctions = {};
	this.peers = {};
	this.peerTransports = {};
	this.wormholePeers = {};

	this.enableWebcam = enableWebcam || false;
	this.enableAudio = enableAudio || false;
	
	var MediaConstraints = {
		audio: this.enableAudio,
		video: this.enableWebcam
	};
	navigator.webkitGetUserMedia(MediaConstraints, function (mediaStream) {
		self.addStream(mediaStream);
	}, function (err) {
		// 
	});

	this.addRTCFunction("createOffer", function (id, channel, cb) {
		this.createOffer(id, channel, cb);
	});
	this.addRTCFunction("handleOffer", function (id, offerDescription, cb) {
		this.handleOffer(id, offerDescription, cb);
	});
	this.addRTCFunction("handleAnswer", function (id, answerDescription) {
		this.handleAnswer(id, answerDescription);
	});
	this.addRTCFunction("addIceCandidate", function (id, candidate) {
		this.handleIceCandidate(id, candidate);
	});
};

wormholeRTC.prototype = Object.create(EventEmitter.EventEmitter.prototype);


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
	}, { 'optional': [{'DtlsSrtpKeyAgreement': true}, {'RtpDataChannels': true}] });

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
			self.wormholePeers[id] = new wormholePeer(id, ev.channel.label);
		}
		ev.channel.onopen = function () {
			self.wormholePeers[id].setRTCFunctions(self.rtcFunctions);
			self.wormholePeers[id].setTransport(self.peerTransports[id]);
			self.wormholePeers[id].setPeer(self.peers[id]);
			self.emit("rtcConnection", self.wormholePeers[id]);
		}
		ev.channel.onclose = function () {
			self.emit("rtcDisonnection", self.wormholePeers[id]);
		}
	}, function (event) {
		self.emit("addIceCandidate", id, event.candidate);
	}, function(mediaStream) {
		// TODO: video.src = webkitURL.createObjectURL(mediaStream);
    })
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
			// console.log(arguments);
		}
	);
};

wormholeRTC.prototype.createOffer = function(id, channel, cb) {
	// console.log("Creating RTC offer for ID", id);
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
	this.peerTransports[id].onclose = function () {
		self.emit("rtcDisonnection", self.wormholePeers[id]);
	};
	wormholeRTC.createOffer(connect, function (desc) {
		cb(desc);
	});
};

wormholeRTC.prototype.handleOffer = function(id, offerDescription, cb) {
	// console.log("handleOffer RTC for ID", id, offerDescription);
	if (id && offerDescription) {
		var self = this;
		var connect = this.createConnection(id);
		var remoteDescription = new RTCSessionDescription(offerDescription);
		connect.setRemoteDescription(remoteDescription);
		connect.createAnswer(function (answer) {
			connect.setLocalDescription(answer);
			cb(answer);
		}, function (err) {
			// 
		});
	}
};

wormholeRTC.prototype.handleTimeout = function(id, channel) {
	this.peers[id].close();
	delete this.peers[id];
	delete this.peerTransports[id];
	delete this.wormholePeers[id];

	self.emit("timeout", id channel);
	// self.rpc.reinitiateOffer(id, channel);
};

wormholeRTC.prototype.handleAnswer = function(id, answerDescription) {
	// console.log("handleAnswer RTC for ID", id, answerDescription);
	if (id && answerDescription) {
		var connect = this.peers[id];
		var remoteDescription = new RTCSessionDescription(answerDescription);
		connect.setRemoteDescription(remoteDescription);
	}
};

wormholeRTC.prototype.handleIceCandidate = function(id, candidate) {
	// console.log("handleIceCandidate RTC for ID", id, candidate);
	if (id && candidate) {
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

var wormholePeer = function (id, datachannel) {
	EventEmitter.EventEmitter.call(this);
	var self = this;
	this.id = id;
	this.channel = datachannel;
	this.rtc = {};
	this.uuidList = {};
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
				// console.log("Removing CallbackID from UUIDLIST", uuid);
				delete self.uuidList[uuid];
				// console.log("CallbackID removed??", self.uuidList[uuid] != null);
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
	var self = this;
	// Create peer: 
	var video;
	var MediaConstraints = {
		audio: mic,
		video: webcam,
		screen: false
	};
	navigator.webkitGetUserMedia(MediaConstraints, function (mediaStream) {
		self.peer.addStream(mediaStream);
		if (webcam) {
			video = document.createElement("video");
			video.src = window.URL.createObjectURL(mediaStream);
		}
		self.rtc.createOffer(self.id, self.channel);
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
				// console.log("Timing out Callback", out.uuid);
				try {
					self.uuidList[out.uuid].call(self, "timeout");
					delete self.uuidList[out.uuid];
				} catch (ex) {
					delete self.uuidList[out.uuid];
					throw ex;
				}
				// console.log("Deleting UUID from callback", out.uuid);
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
