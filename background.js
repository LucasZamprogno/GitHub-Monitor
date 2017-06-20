var SERVER_PORT = 4321; // Main server port
var WEBSOCKET_PORT = 2366; // Tobii app websocket port
var GAZE_LOSS_TIMEOUT = 500; // How much time can pass before deciding the user has looked/moved away
var GAZE_LOSS_WAIT = 100; // How often to check if the user has looked/moved away
var CONNECTION_WAIT = 100; // How often to try to connect to the Tobii app websocket server

// Note: All values stored in localStorage are always stored as strings. May be converted implicitly.

// Short-circuit first time setup. Should only ever happen after initial install
(typeof localStorage['sessionId'] === 'undefined') && setLocal('sessionId', null);
(typeof localStorage['reporting'] === 'undefined') && setLocal('reporting', false);
(typeof localStorage['privateMode'] === 'undefined') && setLocal('privateMode', false);
(typeof localStorage['privacyFilters'] === 'undefined') && setLocal('privacyFilters', JSON.stringify([]));

var reporting = getLocal('reporting');
var sessionId = getLocal('sessionId');
var privateMode = getLocal('privateMode');
var privacyFilters = getLocal('privacyFilters');
var ws;
var attemptConnectionInterval = setInterval(function(){ connectToTracker() }, CONNECTION_WAIT);
var gazeLossInterval = setInterval(function(){ checkForGazeLoss() }, GAZE_LOSS_WAIT);
var lastCommunication = null;

if(reporting) {
	startReporting();
} else {
	stopReporting()
}

// Pass data from content scripts on to server OR pass mouse coordinates back to scripts
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	if(reporting) {
		if(request.hasOwnProperty('x')) { // This is only for mouse input for development
			lastCommunication = Date.now();
			if(!gazeLossInterval) {
				gazeLossInterval = setInterval(function(){ checkForGazeLoss() }, GAZE_LOSS_WAIT);
			}
			sendCoordToActiveTabs(request['x'], request['y']);
		} else {
			postDataToServer(request);
		}
	}
});

// Connect to Tobii app websocket server
function connectToTracker() {
	ws = new WebSocket('ws://localhost:' + WEBSOCKET_PORT);
	clearInterval(attemptConnectionInterval);
	ws.onmessage = function(e) {
		lastCommunication = Date.now();
		if(!gazeLossInterval) {
			gazeLossInterval = setInterval(function(){ checkForGazeLoss() }, GAZE_LOSS_WAIT);
		}
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
		case 'privacyFilters':
			return JSON.parse(val);
	}
}

// Save a key value pair to local storage for persistence between sessions
function setLocal(key, val) {
	localStorage[key] = val;
}

// Allow reporting of events to the server, set icon accordingly
function startReporting() {
	var wasReporting = reporting;
	if(sessionId) { // Hopefully not possible for sessionId to not be set, but just in case
		chrome.browserAction.setBadgeBackgroundColor({'color':[0, 170, 0, 255]});
		chrome.browserAction.setBadgeText({'text':'On'});
		reporting = true;
		setLocal('reporting', true);
		if(!wasReporting) {
			var obj = {
				'type': 'setting',
				'detail': 'Reporting - Started',
				'timestamp': Date.now()
			}
			postDataToServer(obj);
		}
	} else {
		stopReporting();
	}
}

// Prevent reporting to the server, set icon accordingly
function stopReporting() {
	var wasReporting = reporting;
	chrome.browserAction.setBadgeBackgroundColor({'color':[170, 0, 0, 255]});
	chrome.browserAction.setBadgeText({'text':'Off'});
	reporting = false;
	setLocal('reporting', false);
	if(wasReporting) {
		var obj = {
			'type': 'setting',
			'detail': 'Reporting - Stopped',
			'timestamp': Date.now(),
			'override': true
		}
		postDataToServer(obj);
	}
}

// Takes a string of the details selected in the popup that will not be reported on
function updatePrivacySettings(arrStr) {
	privacyFilters = JSON.parse(arrStr);
	setLocal('privacyFilters', arrStr);
}

// Has there been no gaze data reported from the tracker for a given amount of time
// (i.e. user looked/moved away from screen)
function checkForGazeLoss() {
	if(lastCommunication !== null && (Date.now() - lastCommunication > GAZE_LOSS_TIMEOUT)) {
		chrome.tabs.query({active: true}, function(tabs) {
			for(var tab of tabs) {
				chrome.tabs.sendMessage(tab.id, {'gazeLoss': null, 'timestamp': lastCommunication});
			}
		});
		clearInterval(gazeLossInterval);
		gazeLossInterval = null;
	}
}

// Pass on the x and y coordinates to all active (the single viewable tab in a given window) tabs
function sendCoordToActiveTabs(x, y) {
	chrome.tabs.query({active: true}, function(tabs) {
		for(var tab of tabs) {
			getZoomAndSend(tab.id, x, y);
		}
	});
}

function getZoomAndSend(id, x, y) {
	chrome.tabs.getZoom(id, function(zoomFactor){
		chrome.tabs.sendMessage(id, {'x': x, 'y': y, 'zoom': zoomFactor});
	});
}

// Add on session ID and send event to the server
function postDataToServer(data) {
	if(reporting || data.hasOwnProperty('override')) {
		if(privateMode) {
			data = privacyFilter(data);
		}
		if(data) { // Data will be null if it shouldn't be reported at all
			data['id'] = sessionId;
			var xmlhttp = new XMLHttpRequest();
			xmlhttp.open('POST', 'http://localhost:' + SERVER_PORT + '/data');
			xmlhttp.setRequestHeader('Content-Type', 'application/json');
			xmlhttp.send(JSON.stringify(data));
		}
	}
}

// Substitute any unwanted information, or return null if the event should not be reported at all
function privacyFilter(obj) {
	for(var filter of privacyFilters) {
		switch(filter) {
			case 'google':
				if(obj['pageHref'] && obj['pageHref'].includes('www.google.') && obj['target'].includes('Google result:')) {
					obj['target'] = 'Google result';
				}
				break;
			case 'domains':
				if(obj['domain']) {
					return null;
				}
				break;
			case 'processes':
				//
				break;
		}
	}
	return obj;
}