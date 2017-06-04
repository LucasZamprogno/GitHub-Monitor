var PORT = 4321;

// ALL LOCAL STORAGE SAVES AS STRING

// Short-circuit first time startup
(typeof localStorage['sessionId'] === 'undefined') && setLocal('sessionId', null);
(typeof localStorage['reporting'] === 'undefined') && setLocal('reporting', false);

var reporting;
var sessionId = getLocal('sessionId');
var ws;
var attemptConnection = setInterval(function(){ connectToTracker() }, 100);

if(getLocal('reporting')) {
	startReporting();
}

// Pass data from content scripts on to server OR pass mouse coordinates back to scripts
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	if(sender.tab && reporting) {
		if(request.hasOwnProperty('x')) {
			sendCoordToActiveTabs(request['x'], request['y']);
		} else {
			postDataToServer(request);
		}
	}
});

function connectToTracker() {
	ws = new WebSocket('ws://localhost:2366');
	clearInterval(attemptConnection);
	ws.onmessage = function(e) {
		var obj = JSON.parse(e.data);
		var x = obj['x'];
		var y = obj['y'];
		sendCoordToActiveTabs(x, y);
	}
	ws.onclose = function(e) {
		ws = null;
		attemptConnection = setInterval(function(){ connectToTracker() }, 100);
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
		reporting = true;
		setLocal('reporting', true);
	} else {
		stopReporting();
	}
}

function stopReporting() {
	reporting = false;
	setLocal('reporting', false);
}

function sendCoordToActiveTabs(x, y) {
	chrome.tabs.query({active: true}, function(tabs) {
		for(var tab of tabs) {
			chrome.tabs.getZoom(tab.id, function(ratio){
				chrome.tabs.sendMessage(tab.id, {'x': x, 'y': y, 'zoom': ratio});
			});
		}
	})
}

// Add on session ID and send event to the server
function postDataToServer(data) {
	console.log('POSTing to server');
	data['id'] = sessionId;
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.open('POST', 'http://localhost:' + PORT + '/data');
	xmlhttp.setRequestHeader('Content-Type', 'application/json');
	xmlhttp.send(JSON.stringify(data));
}