var PORT = 4321;

// ALL LOCAL STORAGE SAVES AS STRING

// Short-circuit first time startup
(typeof localStorage['sessionId'] === 'undefined') && setLocal('sessionId', null);
(typeof localStorage['reporting'] === 'undefined') && setLocal('reporting', false);

var getCoordInterval;
var reporting;
var sessionId = getLocal('sessionId');

if(getLocal('reporting')) {
	startReporting();
}

// Pass data from content scripts on to server
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	if(sender.tab && reporting) {
		postDataToServer(request);
	}
});

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
	getCoordInterval = setInterval(function() { getNewCoordFromServer() }, 17); // 16.66... is 60hz, so this is just below.
	reporting = true;
	setLocal('reporting', true);
}

function stopReporting() {
	clearInterval(getCoordInterval);
	reporting = false;
	setLocal('reporting', false);
}

function sendCoordToActiveTabs(x, y) {
	chrome.tabs.query({active: true}, function(tabs) {
		for(var tab of tabs) {
			chrome.tabs.sendMessage(tab.id, {'x': x, 'y': y});
		}
	})
}

// Ask server for newest coordinates, then inform all tabs running content scripts
function getNewCoordFromServer() {
	var xhr = new XMLHttpRequest();
	xhr.onreadystatechange = function(event) {
		if (xhr.readyState == 4 && xhr.status == 200) {
			var response = JSON.parse(xhr.responseText);
			sendCoordToActiveTabs(response.x, response.y);
		}
	};
	xhr.open('GET', 'https://localhost:' + PORT + '/coordinate', true);
	xhr.send();
}

// Add on session ID and send event to the server
function postDataToServer(data) {
	data['sessionId'] = sessionId;
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.open('POST', 'https://localhost:' + PORT + '/data');
	xmlhttp.setRequestHeader('Content-Type', 'application/json');
	xmlhttp.send(JSON.stringify(data));
}