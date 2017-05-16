var targets = { // Keys are target identifiers, values are descriptors
	"div.file": "Special case, won't see this",
	"div#all_commit_comments": "Comment section"
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
		gazeStart = Date.now(); // May be technically innaccurate in milliseconds, probably not important
		getCoordInterval = setInterval(function() { getNewCoordFromServer() }, 17); // 16.66... is 60hz, so this is just below.
		recalibrationInterval = setInterval(function(){ recalibrate() }, 500);
	    // Temp
	    document.body.addEventListener("mousemove", function(event){
		    postCoordToServer(event.clientX, event.clientY);
		});
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

/************************
Gaze Monitoring Functions
************************/

var lastTarget = null; // Last observerd DOM element
var lastIdentifier = null; // Identifier of last observed element
var gazeStart = null; // Timestamp of when observation of the element began

// Checks if viewed pixel is a new element of interest (file/code, comments, etc), logs if it is
function checkForTargetChange(x, y) {
	var viewed = document.elementFromPoint(x, y);
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
		case "div.file": // There can be multiple file divs in a commit, check which file
			return "File: " + $(elem).find("div.file-header > div.file-info > a").attr("title");
		default: // Used assigned label mapping in 'targets' global
			return targets[key];
	}
}

// Mainly for cleanliness. Type refers to gaze vs click etc. Will add more fields as time goes on
function gazeInteractionObject(target, start, end) {
	var obj = {};
	obj['type'] = 'Gaze';
	obj['interactionTarget'] = target;
	obj['interactionStart'] = start;
	obj['interactionEnd'] = end;
	obj['interactionDuration'] = end - start;
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
	xmlhttp.open("POST", "https://localhost:4321/coordinate");
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