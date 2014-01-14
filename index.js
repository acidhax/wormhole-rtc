navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
window.URL = window.URL || window.webkitURL || window.mozURL || window.msURL;
window.RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
window.RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription;
window.RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate;

var wormholeRTC = function (enableWebcam, enableAudio, enableScreen) {
	var self = this;
	SimplEE.EventEmitter.call(this);
	this.rtcFunctions = {};
	this.peers = {};
	this.peerTransports = {};
	this.wormholePeers = {};

	this.streams = [];
	this.callback = [];

	this.webcamEnabled = enableWebcam || false;
	this.audioEnabled = enableAudio || false;
	this.enableScreen = enableScreen || false;
	
	this._videoStream = null;
	this._audioStream = null;

	this.addRTCFunction("handleOffer", function (offerDescription, cb) {
		console.log("handleOffer", this.id, offerDescription);
		self.handleOffer(this.id, offerDescription, cb);
	});
	this.addRTCFunction("handleAnswer", function (answerDescription) {
		self.handleAnswer(this.id, answerDescription);
	});
	this.addRTCFunction("addIceCandidate", function (candidate) {
		console.log("RTC:addIceCandidate", this.id);
		self.handleIceCandidate(this.id, candidate);
	});
	this.addRTCFunction("disableVideo", function () {
		this.emit("videoDisabled");
	});
	this.addRTCFunction("enableVideo", function () {
		this.emit("videoEnabled");
	});
	this.addRTCFunction("disableAudio", function () {
		this.emit("audioDisabled");
	});
	this.addRTCFunction("enableAudio", function () {
		this.emit("audioEnabled");
	});
};

wormholeRTC.prototype = Object.create(SimplEE.EventEmitter.prototype);

wormholeRTC.prototype.initialize = function () {
	var self = this;
	var MediaConstraints = {
		audio: this.audioEnabled,
		video: this.webcamEnabled,
		screen: this.enableScreen
	};
	var errFunc = function () {
		self.MediaConstraints = { audio: false, video: false, screen: false };
		self.ready();
		self.emit("ready");
	};
	if (MediaConstraints.audio || MediaConstraints.video || MediaConstraints.screen) {
		try {
			navigator.getUserMedia(MediaConstraints, function (mediaStream) {
				self.MediaConstraints = MediaConstraints;
				self.addStream(mediaStream);
				self.ready();
				self.emit("ready");
			}, errFunc);
		} catch (ex) {
			errFunc();
		}
	} else {
		errFunc();
	}
};

wormholeRTC.prototype.hasAudio = function() {
	for (var i = 0; i < this.streams.length; i++) {
		var stream = this.streams[i];
		if (stream.getAudioTracks().length) {
			return true;
		}
	}
	return false;
};

wormholeRTC.prototype.hasVideo = function() {
	for (var i = 0; i < this.streams.length; i++) {
		var stream = this.streams[i];
		if (stream.getVideoTracks().length) {
			return true;
		}
	}
	return false;
};

wormholeRTC.splitStreams = function (mediaStream) {
	var audioStream, videoStream;
	audioStream = new webkitMediaStream();
	videoStream = new webkitMediaStream();

	var vT = mediaStream.getVideoTracks();
	for (var i = 0; i < vT.length; i++) {
		videoStream.addTrack(vT[i]);
	}

	var aT = mediaStream.getAudioTracks();
	for (var i = 0; i < vT.length; i++) {
		audioStream.addTrack(vT[i]);
	}

	return [audioStream, videoStream];
};
wormholeRTC.joinStreams = function (origStream, streamToAdd) {
	var vT = streamToAdd.getVideoTracks();
	for (var i = 0; i < vT.length; i++) {
		origStream.addTrack(vT[i]);
	}

	var aT = streamToAdd.getAudioTracks();
	for (var i = 0; i < vT.length; i++) {
		origStream.addTrack(vT[i]);
	}

	return origStream;
};
wormholeRTC.prototype.unmuteVideo = function() {
	this.MediaConstraints.video = true;
	for (var i = 0; i < this.streams.length; i++) {
		var stream = this.streams[i];
		var vT = stream.getVideoTracks();
		for (var j = 0; j < vT.length; j++) {
			var videoTrack = vT[j];
			videoTrack.enabled = true;
		}
	}
	this.executeAll("enableVideo");
};
wormholeRTC.prototype.muteVideo = function () {
	this.MediaConstraints.video = false;
	for (var i = 0; i < this.streams.length; i++) {
		var stream = this.streams[i];
		var vT = stream.getVideoTracks();
		for (var j = 0; j < vT.length; j++) {
			var videoTrack = vT[j];
			videoTrack.enabled = false;
		}
	}
	this.executeAll("disableVideo");
};

wormholeRTC.prototype.unmute = function() {
	this.MediaConstraints.audio = true;
	for (var i = 0; i < this.streams.length; i++) {
		var stream = this.streams[i];
		var vT = stream.getAudioTracks();
		for (var j = 0; j < vT.length; j++) {
			var audioTrack = vT[j];
			audioTrack.enabled = true;
		}
	}
	this.executeAll("enableAudio");
};
wormholeRTC.prototype.mute = function() {
	this.MediaConstraints.audio = false;
	for (var i = 0; i < this.streams.length; i++) {
		var stream = this.streams[i];
		var aT = stream.getAudioTracks();
		for (var j = 0; j < aT.length; j++) {
			var audioTrack = aT[j];
			audioTrack.enabled = false;
		}
	}
	this.executeAll("disableAudio");
};

wormholeRTC.prototype.hasAudio = function() {
	for (var i = 0; i < this.streams.length; i++) {
		var stream = this.streams[i];
		if (stream.getAudioTracks().length) {
			return true;
		}
	}
	return false;
};

wormholeRTC.prototype.hasVideo = function() {
	for (var i = 0; i < this.streams.length; i++) {
		var stream = this.streams[i];
		if (stream.getVideoTracks().length) {
			return true;
		}
	}
	return false;
};

wormholeRTC.prototype.renegotiateAll = function() {
	var peers = Object.keys(this.wormholePeers);
	for (var i = 0; i < peers.length; i++) {
		var peer = this.wormholePeers[peers[i]];
		peer.renegotiate(this.MediaConstraints.audio, this.MediaConstraints.video, this.MediaConstraints.screen);
	}
};

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
wormholeRTC.prototype.attachWormholeServer = function(comm) {
	var self = this;
	this.wh = comm;
	comm.on("createOffer", function () {
		self.createOffer.apply(self, arguments);
	});
	comm.on("handleOffer", function () {
		self.handleOffer.apply(self, arguments);
	});
	comm.on("handleAnswer", function () {
		self.handleAnswer.apply(self, arguments);
	});
	comm.on("handleLeave", function () {
		self.handleLeave.apply(self, arguments);
	});
	comm.on("handleIceCandidate", function () {
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
	var peer = new RTCPeerConnection({
		iceServers: [
			{ url: "stun:stun.l.google.com:19302" },
			{ url: 'turn:ec2-54-227-128-105.compute-1.amazonaws.com:3479', username:'asdf', credential:'asdf' }
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

wormholeRTC.prototype.createConnection = function(id, mediaStream) {
	var self = this;
	console.log("wormholeRTC.prototype.createConnection", id);
	this.peers[id] = wormholeRTC.createConnection(function (ev) {
		console.log("wormholeRTC.createConnection.ev", ev);
		self.peerTransports[id] = ev.channel;
		ev.channel.onopen = function () {
			if (!self.wormholePeers[id]) {
				self.wormholePeers[id] = new wormholePeer(id, ev.channel.label, self);
				self.wormholePeers[id].MediaConstraints = self.MediaConstraints;
			} else {
				self.wormholePeers[id].setDataChannel(ev.channel.label);
			}
			console.log("ev.channel.onopen");
			self.wormholePeers[id].setRTCFunctions(self.rtcFunctions);
			self.wormholePeers[id].setTransport(self.peerTransports[id]);
			self.wormholePeers[id].setPeer(self.peers[id]);
			self.wormholePeers[id].renegotiating = false;
			if (!self.wormholePeers[id].connected) {
				self.wormholePeers[id].connected = true;
				self.emit("rtcConnection", self.wormholePeers[id]);
			}
		}
		ev.channel.onclose = function () {
			console.log("ev.channel.onclose");
			// self.emit("rtcDisconnection", self.wormholePeers[id]);
		}
	}, function (event) {
		if (self.wormholePeers[id] && self.wormholePeers[id].renegotiating) {
			console.log("Renegotiating ice candidate", id);
			self.wormholePeers[id].rtc.addIceCandidate(event.candidate);
		} else {
			self.wh.rpc.addIceCandidate(id, event.candidate);
			self.emit("addIceCandidate", id, event.candidate);
		}
	}, function(mediaStream) {
		console.log("Remote media stream for ID:", id);
		console.log("Remote media stream:", mediaStream);
		console.log("Remote media stream:", mediaStream.stream);
		console.log(URL.createObjectURL(mediaStream.stream));
		if (!self.wormholePeers[id]) {
			self.wormholePeers[id] = new wormholePeer(id, null, self);
			self.wormholePeers[id].MediaConstraints = self.MediaConstraints;
		}

		if (!self.wormholePeers[id].connected) {
			self.wormholePeers[id].connected = true;
			self.emit("rtcConnection", self.wormholePeers[id]);
		}

		var streamUrl = URL.createObjectURL(mediaStream.stream);
		self.wormholePeers[id].addStream(streamUrl, mediaStream.stream);
		self.wormholePeers[id].emit("streamAdded", mediaStream.stream, streamUrl);
		self.emit("rtcStreamAdded", self.wormholePeers[id], mediaStream.stream, streamUrl);
    });
	if (!this.wormholePeers[id] || !this.wormholePeers[id].renegotiating) {
		if (!mediaStream) {
			for (var i = 0; i < this.streams.length; i++) {
				this.peers[id].addStream(this.streams[i]);
			}
		} else {
			this.peers[id].addStream(mediaStream);
		}
	} else if (this.wormholePeers[id] && this.wormholePeers[id].renegotiating) {
		this.peers[id].addStream(mediaStream);
	}
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

wormholeRTC.prototype.createOffer = function(id, channel, cb, mediaStream) {
	console.log("wormholeRTC.prototype.createOffer", id);
	var _offerDescription;
	var self = this;
	var connect = this.createConnection(id, mediaStream);
	setTimeout(function () {
		if (connect.readyState == "connecting") {
			// failed.
			self.handleTimeout(id, channel);
		}
	}, 30000);
	this.peerTransports[id] = connect.createDataChannel(channel);

	self.peers[id].ondatachannel({channel: this.peerTransports[id]});

	this.peerTransports[id].onclose = function () {
		console.log("ev.peerTransports.onclose");
		// self.emit("rtcDisconnection", self.wormholePeers[id]);
	};
	wormholeRTC.createOffer(connect, function (desc) {
		if (this.wormholePeers[id]) {
			this.wormholePeers[id].setPeer(connect);
		}
		cb(null, desc);
	}.bind(self));
};

wormholeRTC.prototype.handleOffer = function(id, offerDescription, cb) {
	console.log("wormholeRTC.prototype.handleOffer", id);
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
	console.log("wormholeRTC.prototype.handleAnswer", id);
	if (id && answerDescription) {
		var connect = this.peers[id];
		var remoteDescription = new RTCSessionDescription(answerDescription);
		connect.setRemoteDescription(remoteDescription);
	}
};

wormholeRTC.prototype.handleIceCandidate = function(id, candidate) {
	if (id && candidate && this.peers[id]) {
		try {
			this.peers[id].addIceCandidate(new RTCIceCandidate(candidate));
		} catch (ex) {
			// 
		}
	}
};

wormholeRTC.prototype.addStream = function (stream, type) {
	this.streams.push(stream);
};

wormholeRTC.prototype.handleLeave = function(id) {
	// remove ID
	if (this.wormholePeers[id]) {
		console.log("emitting rtcDisconnection", this.wormholePeers[id]);
		this.emit("rtcDisconnection", this.wormholePeers[id]);
		this.wormholePeers[id].emit("disconnected");
		this.peers[id].close();
		delete this.peers[id];
		// delete this.wormholePeers[id];
		delete this.peerTransports[id];	
	}
};

wormholeRTC.prototype.executeAll = function() {
	var args = [].slice.call(arguments);
	var func = args.shift();
	this.getPeers().forEach(function (wormholePeer) {
		wormholePeer.rtc[func].apply(wormholePeer, args);
	});
};

wormholeRTC.prototype.getPeers = function(cb) {
	var self = this;
	var out = [];
	Object.keys(this.wormholePeers).forEach(function (id) {
		out.push(self.wormholePeers[id]);
	});
	cb && cb(out);
	return out;
};

wormholeRTC.prototype.getPeer = function(id) {
	return this.wormholePeers[id];
};

var wormholePeer = function (id, datachannel, controller) {
	SimplEE.EventEmitter.call(this);
	var self = this;
	this.id = id;
	this.channel = datachannel || "TEMPCHANNELNAME";
	this.controller = controller;
	this.renegotiating = false;

	this.rtc = {};
	this.uuidList = {};
	this.streams = [];
	this.streamObj = {};
};

wormholePeer.prototype = Object.create(SimplEE.EventEmitter.prototype);

wormholePeer.prototype.setDataChannel = function(channel) {
	this.channel = channel;
};

wormholePeer.prototype.addStream = function(streamUrl, streamObj) {
	this.streams.push(streamObj);
	this.streamObj[streamObj] = streamUrl;
	var self = this;
	if (hark) {
		var speech = hark(streamObj);
		speech.on('speaking', function() {
			self.emit('speaking')
		});
		speech.on('stopped_speaking', function() {
			self.emit('stopped_speaking')
		});
	}
};

wormholePeer.prototype.hasAudio = function() {
	for (var i = 0; i < this.streams.length; i++) {
		var stream = this.streams[i];
		if (stream.getAudioTracks().length) {
			return true;
		}
	}
	return false;
};

wormholePeer.prototype.hasVideo = function() {
	for (var i = 0; i < this.streams.length; i++) {
		var stream = this.streams[i];
		if (stream.getVideoTracks().length) {
			return true;
		}
	}
	return false;
};

wormholePeer.prototype.setPeer = function(peer) {
	this.peer = peer;
};

wormholePeer.prototype.setRTCFunctions = function(rtcFunctions) {
	this.rtcFunctions = rtcFunctions;
	this.syncRtc(rtcFunctions);
};

wormholePeer.prototype.setTransport = function(transport) {
	this.transport = transport;
	var self = this;
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

wormholePeer.prototype.mute = function () {
	// Audio stream still continues, but doesn't decode/play.
	this.streams.forEach(function (stream) {
		if (stream.getAudioTracks().length) {
			stream.getAudioTracks().forEach(function (track) {
				track.enabled = false;
			});
		}
	});
};

wormholePeer.prototype.unmute = function () {
	// Audio stream still continues, but doesn't decode/play.
	this.streams.forEach(function (stream) {
		if (stream.getAudioTracks().length) {
			stream.getAudioTracks().forEach(function (track) {
				track.enabled = true;
			});
		}
	});
};

wormholePeer.prototype.muteVideo = function () {
	// Video stream still continues, but doesn't decode/play.
	this.streams.forEach(function (stream) {
		if (stream.getVideoTracks().length) {
			stream.getVideoTracks().forEach(function (track) {
				track.enabled = false;
			});
		}
	});
};

wormholePeer.prototype.unmuteVideo = function () {
	// Video stream still continues, but doesn't decode/play.
	this.streams.forEach(function (stream) {
		if (stream.getVideoTracks().length) {
			stream.getVideoTracks().forEach(function (track) {
				track.enabled = true;
			});
		}
	});
};

wormholePeer.prototype.renegotiate = function (mic, webcam, screen) {
	// Create peer
	var self = this;
	self.renegotiating = true;
	var oldPeer = self.peer;
	var video;
	var MediaConstraints = {
		audio: mic,
		video: webcam,
		screen: screen
	};
	navigator.webkitGetUserMedia(MediaConstraints, function (mediaStream) {
		if (webcam) {
			video = document.createElement("video");
			video.src = window.URL.createObjectURL(mediaStream);
		}
		self.streams.push(mediaStream);
		self.MediaConstraints = MediaConstraints;
		reneg(mediaStream);
	}, function (err) {
		self.MediaConstraints = {audio: false, video: false, screen: false};
		reneg();
	});

	var reneg = function(mediaStream) {
		self.controller.createOffer(self.id, self.channel, function (err, desc) {
			self.rtc.handleOffer(desc, function (err, remoteDescription) {
				self.controller.handleAnswer(self.id, remoteDescription);
				oldPeer.close();
				var streams = oldPeer.getLocalStreams();
				for (var i = 0; i < streams.length; i++) {
					var stream = streams[i];
					if (stream != mediaStream) {
						stream.stop();
					}
				}
			});
		}, mediaStream);
	}
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

var WormholeRTCClientCommunicator = function (comm) {
	SimplEE.EventEmitter.call(this);
	this.comm = comm;
	if (comm) {
		this.attachHandlers();
	}
};
WormholeRTCClientCommunicator.prototype = Object.create(SimplEE.EventEmitter.prototype);
WormholeRTCClientCommunicator.prototype.joinRTCChannel = function(channel) {
	this.comm.transmit("joinRTCChannel", channel);
};
WormholeRTCClientCommunicator.prototype.sendIceCandidate = function(id, iceCandidate) {
	this.comm.transmit("iceCandidate", id, iceCandidate);
};
WormholeRTCClientCommunicator.prototype.createOffer = function () {
	this.emit.apply(this, ["createOffer"].concat([].slice.call(arguments)));
};
WormholeRTCClientCommunicator.prototype.handleOffer = function () {
	this.emit.apply(this, ["handleOffer"].concat([].slice.call(arguments)));
};
WormholeRTCClientCommunicator.prototype.handleAnswer = function () {
	this.emit.apply(this, ["handleAnswer"].concat([].slice.call(arguments)));
};
WormholeRTCClientCommunicator.prototype.handleLeave = function () {
	this.emit.apply(this, ["handleLeave"].concat([].slice.call(arguments)));
};
WormholeRTCClientCommunicator.prototype.handleIceCandidate = function () {
	this.emit.apply(this, ["handleIceCandidate"].concat([].slice.call(arguments)));
};
WormholeRTCClientCommunicator.prototype.attachHandlers = function(comm) {
	this.comm = this.comm || comm;
	var self = this;
	this.comm.on("createOffer", function () {
		self.createOffer.apply(self, arguments);
	});
	this.comm.on("handleOffer", function () {
		self.handleOffer.apply(self, arguments);
	});
	this.comm.on("handleAnswer", function () {
		self.handleAnswer.apply(self, arguments);
	});
	this.comm.on("handleLeave", function () {
		self.handleLeave.apply(self, arguments);
	});
	this.comm.on("handleIceCandidate", function () {
		self.handleIceCandidate.apply(self, arguments);
	});
};

var WormholeRTCServerCommunicator = function (wh, comm) {
	SimplEE.EventEmitter.call(this);
	this.wh = wh;
	this.comm = comm;

	this.tabSubscriptions = {};

	if (wh && comm) {
		this.attachHandlers();
	}
};

WormholeRTCServerCommunicator.prototype.attachHandlers = function(wh, comm) {
	var self = this;
	this.wh = this.wh || wh;
	this.comm = this.comm || comm;

	this.comm.on("joinRTCChannel", function (channel) {
		var tabId = this.lastTab.id;
		if (!self.tabSubscriptions[channel]) {
			self.tabSubscriptions[channel] = [];
		}
		self.tabSubscriptions[channel].push(tabId);
	});

	this.comm.on("leaveRTCChannel", function (channel) {
		var tabId = this.lastTab.id;
		if (self.tabSubscriptions[channel] && self.tabSubscriptions[channel].indexOf(tabId) > -1) {
			var loc = self.tabSubscriptions[channel].indexOf(tabId);
			self.tabSubscriptions[channel] = self.tabSubscriptions[channel].splice(loc, 1);

			if (self.tabSubscriptions[channel].length == 0) {
				self.wh.rpc.leaveRTCChannel(channel);
			}
		}
	});

	this.wh.on("createOffer", function () {
		// TODO: Transmit based on channel.
		self.comm.transmit.apply(this, ["createOffer"].concat([].slice.call(arguments)));
	});
	this.wh.on("handleOffer", function () {
		// TODO: Transmit based on channel.
		self.comm.transmit.apply(this, ["handleOffer"].concat([].slice.call(arguments)));
	});
	this.wh.on("handleAnswer", function () {
		// TODO: Transmit based on channel.
		self.comm.transmit.apply(this, ["handleOffer"].concat([].slice.call(arguments)));
	});
	this.wh.on("handleLeave", function () {
		// TODO: Transmit based on channel.
		self.comm.transmit.apply(this, ["handleOffer"].concat([].slice.call(arguments)));
	});
	this.wh.on("handleIceCandidate", function () {
		// TODO: Transmit based on channel.
		self.comm.transmit.apply(this, ["handleOffer"].concat([].slice.call(arguments)));
	});
};