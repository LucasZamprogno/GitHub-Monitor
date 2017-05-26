// TODO add some listener to wait for a trigger from popup.js

var getCoordInterval = setInterval(function() { getNewCoordFromServer() }, 17); // 16.66... is 60hz, so this is just below.

// Does it let you cut the sendResponse param?
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  	if(sender.tab) {
  		postDataToServer(request);
  	}
 });

function sendCoordToActiveTabs(x, y) {
	chrome.tabs.query({active: true}, function(tabs) {
		for(var tab of tabs) {
  			chrome.tabs.sendMessage(tab.id, {'x': x, 'y': y});
		}
	})
}

function getNewCoordFromServer() {
	var xhr = new XMLHttpRequest();
	xhr.onreadystatechange = function(event) {
		if (xhr.readyState == 4 && xhr.status == 200) {
	        var response = JSON.parse(xhr.responseText);
	        sendCoordToActiveTabs(response.x, response.y);
	    }
	};
	xhr.open('GET', "https://localhost:4321/coordinate", true);
	xhr.send();
}

function postDataToServer(data) {
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.open("POST", "https://localhost:4321/data");
	xmlhttp.setRequestHeader("Content-Type", "application/json");
	xmlhttp.send(JSON.stringify(data));
}