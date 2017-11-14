var SERVER_PORT = 4321; // Main server port
var WEBSOCKET_PORT = 2366; // Tobii app websocket port
var GAZE_LOSS_TIMEOUT = 500; // How much time can pass before deciding the user has looked/moved away
var GAZE_LOSS_WAIT = 100; // How often to check if the user has looked/moved away
var CONNECTION_WAIT = 100; // How often to try to connect to the Tobii app websocket server
var WINDOW_TIMEOUT = 500; // How long user must be looking out of chrome before it registers as an event
var BADGE_INTERVAL = 200;
var PRIVCAY_DEFAULTS = ['issues', 'url', 'file', 'symbols', 'google']; // Privacy settings to be selected upon first install

// Note: All values stored in localStorage are always stored as strings. May be converted implicitly.

// Short-circuit first time setup. Should only ever happen after initial install
(typeof localStorage['sessionId'] === 'undefined') && setLocal('sessionId', null);
(typeof localStorage['reporting'] === 'undefined') && setLocal('reporting', false);
(typeof localStorage['privacyFilters'] === 'undefined') && setLocal('privacyFilters', JSON.stringify(PRIVCAY_DEFAULTS));
(typeof localStorage['saveLocation'] === 'undefined') && setLocal('saveLocation', 'local');

var reporting = getLocal('reporting');
var sessionId = getLocal('sessionId');
var privacyFilters = getLocal('privacyFilters');
var saveLocation = getLocal('saveLocation');
var ws;
var attemptConnectionInterval = setInterval(function(){ connectToTracker() }, CONNECTION_WAIT);
var gazeLossInterval = null;
var badgeUpdates = setInterval(function() { setBadge() }, BADGE_INTERVAL);
var lastCommunication = null;
var savedDiffs = [];
var lastHref = null;
var lastType = null;
var lastWindowGaze = null;

if(reporting) {
	startReporting();
} else {
	stopReporting();
}

// Pass data from content scripts on to server OR pass mouse coordinates back to scripts
chrome.runtime.onMessage.addListener(messageListener);

function messageListener(request, sender, sendResponse) {
	if(sender.hasOwnProperty('tab')) { 
		switch(request['comType']) {
			case 'event': // Event of any sort to be saved in the dataset
				getDiffsIfNeeded(request, sender);
				pageChangeIfNeeded(request);
				delete request['comType'];
				sendDataToSave(request);
				break;
			case 'gaze': // Fake gaze data from cursor
				registerCommunication();
				if(reporting) {
					sendCoordToActiveTabs(request['x'], request['y']);
				}
				break;
			case 'diffs': // Diff metadata to be saved in the dataset
				if(!savedDiffs.includes(request['pageHref'])) {
					savedDiffs.push(request['pageHref']);
					delete request['comType'];
					sendDataToSave(request);		
				}
				break;
		}
	}
}

function getDiffsIfNeeded(obj, sender) {
	var href = obj['pageHref'];
	var commonPageForDiffs = obj['pageType'] === 'Github pull request' || obj['pageType'] === 'Github commit' || obj['pageType'] === 'Github pull request commit';
	if(obj['type'] === 'gaze' && (obj['target'] === 'diffCode' || commonPageForDiffs) && !savedDiffs.includes(href)) {
		chrome.tabs.sendMessage(sender['tab'].id, {'comType': 'diffs', 'pageHref': href});
	}
}

function pageChangeIfNeeded(obj) {
	if(obj.hasOwnProperty('pageHref') && lastHref !== obj['pageHref']) {
		if(lastHref !== null) {
			var out = {
				'type': 'pageChange',
				'oldHref': lastHref,
				'newHref': obj['pageHref'],
				'oldType': lastType,
				'newType': obj['pageType'],
				'timestamp': obj['timestamp']
			};
			sendDataToSave(out);
		}
		lastHref = obj['pageHref'];
		lastType = obj['pageType'];
	}
}

// Connect to Tobii app websocket server
function connectToTracker() {
	ws = new WebSocket('ws://localhost:' + WEBSOCKET_PORT);
	clearInterval(attemptConnectionInterval);
	ws.onmessage = function(e) {
		registerCommunication();
		var obj = JSON.parse(e.data);
		var x = obj['x'];
		var y = obj['y'];
		if(reporting) {
			sendCoordToActiveTabs(x, y);
		}
	}
	ws.onclose = function(e) {
		ws = null;
		attemptConnectionInterval = setInterval(function(){ connectToTracker() }, CONNECTION_WAIT);
	}
}

function registerCommunication() {
	lastCommunication = Date.now();
	if(!gazeLossInterval) {
		gazeLossInterval = setInterval(function(){ checkForGazeLoss() }, GAZE_LOSS_WAIT);
		updatePopupGazeStatus('connected');
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
		case 'privacyFilters':
			return JSON.parse(val);
		default:
			return val;
	}
}

// Save a key value pair to local storage for persistence between sessions
function setLocal(key, val) {
	localStorage[key] = val;
}

// Allow reporting of events to the server, set icon accordingly
function startReporting() {
	if(sessionId) { // Hopefully not possible for sessionId to not be set, but just in case
		reporting = true;
		setLocal('reporting', true);
		var obj = {
			'type': 'setting',
			'detail': 'Reporting - Started',
			'timestamp': Date.now()
		}
		sendDataToSave(obj);
	} else {
		stopReporting();
	}
}

// Prevent reporting to the server, set icon accordingly
function stopReporting() {
	reporting = false;
	setLocal('reporting', false);
	var obj = {
		'type': 'setting',
		'detail': 'Reporting - Stopped',
		'timestamp': Date.now(),
		'override': true
	}
	sendDataToSave(obj);
}

// Takes a string of the details selected in the popup that will not be reported on
function updatePrivacySettings(arrStr) {
	privacyFilters = JSON.parse(arrStr);
	setLocal('privacyFilters', arrStr);
}

function updateSaveLocation(str) {
	saveLocation = str;
	setLocal('saveLocation', str);
}

// Has there been no gaze data reported from the tracker for a given amount of time
// (i.e. user looked/moved away from screen)
function checkForGazeLoss() {
	if(lastCommunication !== null && (Date.now() - lastCommunication > GAZE_LOSS_TIMEOUT)) {
		updatePopupGazeStatus('disconnected');
		chrome.tabs.query({active: true}, function(tabs) {
			for(var tab of tabs) {
				chrome.tabs.sendMessage(tab.id, {'comType': 'gazeLoss', 'timestamp': lastCommunication});
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

// If this isn't wrapped in a function it fails when done quickly in succession
function getZoomAndSend(id, x, y) {
	chrome.tabs.getZoom(id, function(zoomFactor){
		var obj = {'comType': 'coord', 'x': x, 'y': y, 'zoom': zoomFactor};
		chrome.tabs.sendMessage(id, obj, checkWindowGaze);
	});
}

// Helper method for getZoomAndSend to handle message responses
function checkWindowGaze(response) {
	if(response && response['inWindow']) {
		var now = Date.now();
		if(lastWindowGaze !== null && (now - lastWindowGaze) > WINDOW_TIMEOUT) {
			var obj = {
				'type': 'gaze',
				'target': 'Out of Chrome window',
				'timestamp': lastWindowGaze,
				'timestampEnd': now,
				'duration': now - lastWindowGaze,
				'pageHref': 'None',
				'pageType': 'None'
			}
			sendDataToSave(obj);
		}
		lastWindowGaze = now;
	}
}

// Add on session ID and send event to the server
function sendDataToSave(data) {
	if(ws && ws.readyState === WebSocket.OPEN && (reporting || data.hasOwnProperty('override'))) {
		privacyFilter(data);
		data['id'] = sessionId;
		data = JSON.stringify(data); // Weak typiiiiiing
		if(saveLocation === 'local') {
			ws.send(data);
		} else if(saveLocation === 'remote') {
			var xmlhttp = new XMLHttpRequest();
			xmlhttp.open('POST', 'http://localhost:' + SERVER_PORT + '/data');
			xmlhttp.setRequestHeader('Content-Type', 'application/json');
			xmlhttp.send(data);
		}
	}
}

function updatePopupGazeStatus(status) {
	chrome.runtime.sendMessage({'status': status});
}

/*
Substitute any unwanted information, or return null if the event should not be reported at all
To add a privacy setting, add an input field to popup.html with class="privacy"
and a unique ID, then add a case here that matches that id.
*/
function privacyFilter(obj) {
	for(var key in obj) {
		if(obj[key] !== null && typeof obj[key] === 'object') {
			privacyFilter(obj[key]);
		}
	}
	for(var filter of privacyFilters) {
		switch(filter) {
			case 'issues':
				if(obj.hasOwnProperty('target') && obj['target'].includes('Issue/Pull request: ')) {
					obj['target'] = 'Issue/Pull request';
				}
				break;
			case 'google':
				if(obj.hasOwnProperty('target') && obj['target'].includes('Google result:')) {
					obj['target'] = 'Google result';
				}
				break;
			case 'domains':
				if(obj.hasOwnProperty('type') && obj['type'] == 'pageView') {
					obj['domain'] = 'Redacted';
				}
				break;
			case 'url':
				if(obj.hasOwnProperty('pageHref')) {
					obj['pageHref'] = stringHash(obj['pageHref']).toString();
				}
				if(obj.hasOwnProperty('newHref')) {
					obj['newHref'] = stringHash(obj['newHref']).toString();
				}
				if(obj.hasOwnProperty('oldHref')) {
					obj['oldHref'] = stringHash(obj['oldHref']).toString();
				}
				break;
			case 'file':
				if(obj.hasOwnProperty('file')) { // File as property of code gaze
					obj['file'] = stringHash(obj['file']).toString();
				}
				if(obj.hasOwnProperty('target') && obj['target'].indexOf('File: ') === 0) { // File as target of event
					obj['target'] = 'File: ' + stringHash(obj['target'].substring(6));
				}
				break;
			case 'metadata':
				if(obj.hasOwnProperty('codeText')) {
					delete obj['codeText'];
				}
				break;
			case 'symbols':
				if(obj.hasOwnProperty('codeText')) {
					obj['codeText'] = symbolsOnly(obj['codeText']);
				}
				break;
			case 'keywords':
				if(obj.hasOwnProperty('codeText')) {
					//Temp
					obj['codeText'] = symbolsOnly(obj['codeText']);
				}
				break;
		}
	}
	return obj;
}

// From http://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
function stringHash(string) {
	var hash = 0;
	if (string.length == 0) {
		return hash;
	}
	for (i = 0; i < string.length; i++) {
		char = string.charCodeAt(i);
		hash = ((hash<<5)-hash)+char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return hash;
}

// Remove all alphanumeric
function symbolsOnly(code) {
	return code.replace(/[a-zA-Z0-9]/g, '');
}

function symbolsAndKeyWords(code) {
	// TODO
}

function setBadge() {
	if(reporting && gazeLossInterval) {
		chrome.browserAction.setBadgeBackgroundColor({'color':[0, 120, 0, 255]});
		chrome.browserAction.setBadgeText({'text':'On'});
	} else if(reporting && !gazeLossInterval) {
		chrome.browserAction.setBadgeBackgroundColor({'color':[120, 0, 0, 255]});
		chrome.browserAction.setBadgeText({'text':'D/C'});
	} else {
		chrome.browserAction.setBadgeBackgroundColor({'color':[120, 0, 0, 255]});
		chrome.browserAction.setBadgeText({'text':'Off'});
	}
}