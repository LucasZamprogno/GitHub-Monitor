var PORT = 4321;
var GAZE_LOSS_TIMEOUT = 500;
var GAZE_LOSS_WAIT = 100;
var CONNECTION_WAIT = 100;

// ALL LOCAL STORAGE SAVES AS STRING

// Short-circuit first time startup
(typeof localStorage['sessionId'] === 'undefined') && setLocal('sessionId', null);
(typeof localStorage['reporting'] === 'undefined') && setLocal('reporting', false);
(typeof localStorage['privateMode'] === 'undefined') && setLocal('privateMode', false);

var reporting = getLocal('reporting');
var sessionId = getLocal('sessionId');
var privateMode = getLocal('privateMode');
var ws;
var attemptConnectionInterval = setInterval(function(){ connectToTracker() }, CONNECTION_WAIT);
var gazeLossInterval = setInterval(function(){ checkForGazeLoss() }, GAZE_LOSS_WAIT);
var lastCommunication = null;

if(reporting) {
	startReporting();
	chrome.browserAction.setBadgeBackgroundColor({'color':[0, 170, 0, 255]});
	chrome.browserAction.setBadgeText({'text':'On'});
} else {
	chrome.browserAction.setBadgeBackgroundColor({'color':[170, 0, 0, 255]});
	chrome.browserAction.setBadgeText({'text':'Off'});
}

// Pass data from content scripts on to server OR pass mouse coordinates back to scripts
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	if(reporting) {
		if(request.hasOwnProperty('x')) {
			lastCommunication = Date.now();
			sendCoordToActiveTabs(request['x'], request['y']);
		} else {
			postDataToServer(request);
		}
	}
});

function connectToTracker() {
	ws = new WebSocket('ws://localhost:2366');
	clearInterval(attemptConnectionInterval);
	ws.onmessage = function(e) {
		lastCommunication = Date.now();
		var obj = JSON.parse(e.data);
		var x = obj['x'];
		var y = obj['y'];
		sendCoordToActiveTabs(x, y);
	}
	ws.onclose = function(e) {
		ws = null;
		attemptConnectionInterval = setInterval(function(){ connectToTracker() }, CONNECTION_WAIT);
	}
}

// I'm sure there's a better way to get around everything being strings
// But we're not really doing that much to bother looking into it
function getLocal(key) {
	var val = localStorage[key];
	switch(key) {
		case 'reporting':
			if(val === 'false') {
				return false;
			} else {
				return true;
			}
		case 'sessionId':
			if(val === 'null') {
				return null
			} else {
				return val;
			}
		case 'privateMode':
			if(val === 'false') {
				return false;
			} else {
				return true;
			}
	}
}

function setLocal(key, val) {
	localStorage[key] = val;
}

function clearLocal(key) {
	localStorage[key] = null;
}

function startReporting() {
	if(sessionId) {
		chrome.browserAction.setBadgeBackgroundColor({'color':[0, 170, 0, 255]});
		chrome.browserAction.setBadgeText({'text':'On'});
		reporting = true;
		setLocal('reporting', true);
	} else {
		stopReporting();
	}
}

function stopReporting() {
	chrome.browserAction.setBadgeBackgroundColor({'color':[170, 0, 0, 255]});
	chrome.browserAction.setBadgeText({'text':'Off'});
	reporting = false;
	setLocal('reporting', false);
}

function checkForGazeLoss() {
	if(lastCommunication !== null && (Date.now() - lastCommunication > GAZE_LOSS_TIMEOUT)) {
		chrome.tabs.query({active: true}, function(tabs) {
			for(var tab of tabs) {
				chrome.tabs.sendMessage(tab.id, {'gazeLoss': null});
			}
		});
	}
}

function sendCoordToActiveTabs(x, y) {
	chrome.tabs.query({active: true}, function(tabs) {
		for(var tab of tabs) {
			chrome.tabs.getZoom(tab.id, function(ratio){
				chrome.tabs.sendMessage(tab.id, {'x': x, 'y': y, 'zoom': ratio});
			});
		}
	});
}

// Add on session ID and send event to the server
function postDataToServer(data) {
	if(reporting) {
		if(privateMode) {
			data = privacyFilter(data);
		}
		data['id'] = sessionId;
		var xmlhttp = new XMLHttpRequest();
		xmlhttp.open('POST', 'http://localhost:' + PORT + '/data');
		xmlhttp.setRequestHeader('Content-Type', 'application/json');
		xmlhttp.send(JSON.stringify(data));
	}
}

function privacyFilter(obj) {
	// TODO Make this do anything
	return obj;
}