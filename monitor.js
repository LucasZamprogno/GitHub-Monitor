var targets = { // Keys are target identifiers, values are descriptors
	// Main repo page
	"div.file-wrap": "Repo file explorer",
	"div#readme": "Repo README",
	"div.overall-summary": "Repo header (Commits, branches, etc.)",
		// Figure out how to do branch list
	// Commits
	"li.commit": "Special case, won't see this", // Would be cool to identify if they are looking at the commit name or id
	"div.full-commit": "Commit header",
	"div.file": "Special case, won't see this",
	"div#all_commit_comments": "Commit comment section",
	// Issues + Pull requests
		// Figure out how to do filters
	"div.table-list-header": "Issue/Pull request dropdown menus",
	"li.js-issue-row": "Special case, won't see this",
	// Single issue + pull request comments
	"div#partial-discussion-header": "Issue/Pull request header",
	"div#partial-discussion-sidebar": "Issue/Pull request sidebar",
	"div.comment": "Issue/Pull request comment",
	"div.discussion-item": "Pull request discussion item", // Maybe expand this?
	"div.pull-merging": "Pull request merge status",
	"form.js-new-comment-form": "Issue/Pull request comment box",
	// Pull request files
	"div.pull-request-review-menu": "Pull request change review menu"
};


/******************
Startup/Maintenance
******************/
var windowXOffset = window.screenX; // Window distance from screen (0,0)
var windowYOffset = window.screenY; 
var totalXOffset = null; // Difference between document (0,0) and screen pixel (0,0)
var totalYOffset = null; 
var browserXOffset = null; // Distance from side/top of window to document
var browserYOffset = null;
var serverAwake = false;

// These intervals/listeners will cancel themselves upon completion
document.body.addEventListener("mousemove", calibrate);
var echo = setInterval(function() { confirmServerAwake(echo); }, 50);
var start = setInterval(function() { startupMain(start); }, 50);

// Ongoing intervals
var getCoordInterval = null;
var recalibrationInterval = null;

// Once server responds to echo, set global flag and stop checking
function confirmServerAwake(self) {
	var xhr = new XMLHttpRequest();
	xhr.onreadystatechange = function(event) {
		if (xhr.readyState == 4 && xhr.status == 200) {
	        serverAwake = true
	        console.log("Echo responded");
	        // Stop attempting to reach server
	        clearInterval(self);
	    }
	};
	xhr.open('GET', "https://localhost:4321/echo", true);
	xhr.send();
}

// Calculates document/pixel offsets, begins polling for coordinates, removes itself when complete
function calibrate(event) {
	totalXOffset = event.screenX - event.clientX;
    totalYOffset = event.screenY - event.clientY;
    browserXOffset = totalXOffset - windowXOffset;
    browserYOffset = totalYOffset - windowYOffset;
    console.log("Calibrated, totalXOffset = " + totalXOffset + ", totalYOffset = " + totalYOffset
    	+ ", browserXOffset = " + browserXOffset + ", browserYOffset = " + browserYOffset);
	// Remove this listener
    document.body.removeEventListener("mousemove", calibrate);
}

// Check if the window has changed and update the offsets
function recalibrate() {
	// If the window has moved
	if(windowXOffset !== window.screenX || windowYOffset !== window.screenY) {
		var xDiff = window.screenX - windowXOffset;
		var yDiff = window.screenY - windowYOffset;
		// Make closest update to new offsets given the information
		totalXOffset += xDiff;
		totalYOffset += yDiff;
		windowXOffset += xDiff;
		windowYOffset += yDiff;
		// Get a correct calibration off next mouse move, should only matter if header resizes
		document.body.addEventListener("mousemove", calibrate);
	}
}

// Once global offsets and serverAwake flags are ready, start requesting coordinates, stop attempting startup
function startupMain(self) {
	if(serverAwake && totalXOffset !== null && totalYOffset !== null) { // Need to specify null in case of 0 offset
		gazeStart = Date.now(); // May be technically innaccurate, probably not important
		getCoordInterval = setInterval(function() { getNewCoordFromServer() }, 17); // 16.66... is 60hz, so this is just below.
		recalibrationInterval = setInterval(function(){ recalibrate() }, 500);
	    // UNCOMMENT FOR MOUSE INPUT, ALSO CHANGE OFFSETS
	    document.body.addEventListener("mousemove", function(event){
		    postCoordToServer(event.clientX, event.clientY);
		});
		addAllListeners();
		// If the page is no longer visible, end the last gaze event
		document.addEventListener("visibilitychange", function(event) {
			if(document.hidden) {
				handleGazeEvent(null, null);
			}
		});
	    console.log("Monitoring running");
		clearInterval(self);
	}
}

/*************************
Event Monitoring Functions
*************************/

// Just throw all the listeners on the window, the Big Brother approach to listeners
function addAllListeners() {
	window.addEventListener('click', genericEventHandler);
	window.addEventListener('dblclick', genericEventHandler);
	window.addEventListener('cut', genericEventHandler);
	window.addEventListener('copy', genericEventHandler);
	window.addEventListener('paste', genericEventHandler);
	window.addEventListener('contextmenu', genericEventHandler);
}

function genericEventHandler(event) {
	// This should get broken out into a function
	for(var identifier of Object.keys(targets)) {
		var found = $(event.target).closest(identifier);
		if(found.length) {
			var obj = eventInteractionObject(event.type, getTargetDescription(identifier, found));
			postDataToServer(obj);
		}
	}
}

function eventInteractionObject(type, target) {
	return {
		'type': type,
		'target': target,
		'timestamp': Date.now(),
		'pageTitle': document.title,
		'pageHref': window.location.href
	};
}

/************************
Gaze Monitoring Functions
************************/

var lastTarget = null; // Last observerd DOM element
var lastIdentifier = null; // Identifier of last observed element
var gazeStart = null; // Timestamp of when observation of the element began

// Checks if viewed pixel is a new element of interest (file/code, comments, etc), logs if it is
function checkForTargetChange(x, y) {
	// TOGGLE FOR MOUSE OR EYE INPUT
	var viewed = document.elementFromPoint(x, y);
	//var viewed = document.elementFromPoint(x - totalXOffset, y - totalYOffset);
	var targettedIdentifier = null;
	var targettedElement = null;

	// Check each target key to see if currently viewed element is a child of it
	for(var identifier of Object.keys(targets)) {
		var found = $(viewed).closest(identifier);
		if(found.length) {
			targettedIdentifier = identifier;
			targettedElement = found;
			break;
		}
	}
	
	if(lastTarget && targettedElement) { // Past and current element are targets
		if(!(lastTarget.is(targettedElement))) {
			handleGazeEvent(targettedElement, targettedIdentifier);
		} 
	} else if (lastTarget || targettedElement) { // Only one is/was is a target, definitely changed
		handleGazeEvent(targettedElement, targettedIdentifier);
	}
};

// How to lable the target. Null is untracked, some elements have single lable, some have variable labels
function getTargetDescription(key, elem) {
	if(key == null) {
		return "Untracked";
	}
	switch(key) {
		case "div.file":
			return "File: " + $(elem).find("div.file-header > div.file-info > a").attr("title");
		case "li.commit":
			var data = elem.attr("data-channel");
			var split = data.split(":");
			var commitID = split[split.length - 1];
			var name = $(elem).find("p.commit-title > a").attr("title");
			return "Commit: id - " + commitID + ", name - " + name;
		case "li.js-issue-row":
			var title = $(elem).find("div > div > a.h4").text();
			title = $.trim(title);
			var spanContent = $(elem).find("div > div > div > span.opened-by").text();
			var numberStr = $.trim(spanContent).split("\n")[0];
			return "Issue/Pull request: " + numberStr + ", \"" + title + "\"";
		default: // Used assigned label mapping in 'targets' global
			return targets[key];
			break;
	}
}

function gazeInteractionObject(target, start, end) {
	var obj = {};
	obj['type'] = 'gaze';
	obj['target'] = target;
	obj['timestamp'] = start;
	obj['timestampEnd'] = end;
	obj['duration'] = end - start;
	obj['pageTitle'] = document.title;
	obj['pageHref'] = window.location.href;
	return obj;
}

// Gaze has changed, report the completed gaze to the server, set new gaze data
function handleGazeEvent(newElement, newIdentifier) {
	var descrption = getTargetDescription(lastIdentifier, lastTarget);
	var timestamp = Date.now();
	var obj = gazeInteractionObject(descrption, gazeStart, timestamp);
	postDataToServer(obj);
	lastTarget = newElement;
	lastIdentifier = newIdentifier;
	gazeStart = timestamp;
}

/*************
REST Functions
*************/

// GET request, current gets x and y coordinate. Will include more details (e.g. timestamp) in the future
function getNewCoordFromServer() {
	if(!document.hidden) {
		var xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function(event) {
			if (xhr.readyState == 4 && xhr.status == 200) {
		        var response = JSON.parse(xhr.responseText);
		        checkForTargetChange(response.x, response.y);
		    }
		};
		xhr.open('GET', "https://localhost:4321/coordinate", true);
		xhr.send();
	}
}

// Substitute for data being sent from eyetracker, sends cursor position to server
function postCoordToServer(xPos, yPos) {
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.open("POST", "https://localhost:4321/coordinateM");
	xmlhttp.setRequestHeader("Content-Type", "application/json");
	xmlhttp.send(JSON.stringify({x:xPos, y:yPos}));
}

// Send back data object to be logged
function postDataToServer(data) {
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.open("POST", "https://localhost:4321/data");
	xmlhttp.setRequestHeader("Content-Type", "application/json");
	xmlhttp.send(JSON.stringify(data));
}