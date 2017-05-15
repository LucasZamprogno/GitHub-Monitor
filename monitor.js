var origBorder = ""; // stores the border settings of the selected element
var xOffset = null; // Difference between document x and screen pixel x
var yOffset = null; // Difference between document y and screen pixel y
var serverAwake = false;

var targets = { // Keys are target elements, values are descriptors
	"div.file": "Special case, won't see this",
	"div#all_commit_comments": "Comment section"
};

var pastElem = null; // store the currently selected element
var lastTarget = null; // Previous element of interest
var lastIdentifier = null;
var gazeStart = null;

document.body.addEventListener("mousemove", calibrate);
// These intervals will cancel themselves upon confirmation
var echoLoop = setInterval(function() {confirmServerAwake(echoLoop);}, 50);
var start = setInterval(function() {startupMain(start)}, 50);

// Calculates document/pixel offsets, begins polling for coordinates, removes itself as a listener when complete
function calibrate(event) {
	xOffset = event.screenX - event.clientX;
    yOffset = event.screenY - event.clientY;
    console.log("Calibrated, xOffset = " + xOffset + " yOffset = " + yOffset);
	// Remove this listener
    document.body.removeEventListener("mousemove", calibrate);
}

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

// Once global offsets and serverAwake flags are ready, start requesting coordinates, stop attempting startup
function startupMain(self) {
	if(serverAwake && xOffset !== null && yOffset !== null) { // Need to specify null in case of 0 offset
		gazeStart = Date.now(); // May be technically innaccurate in milliseconds, probably not important
		setInterval(function() { getNewCoordFromServer() }, 17); // 16.66... is 60hz, so this is just below.
	    // Temp
	    document.body.addEventListener("mousemove", function(event){
		    postCoordToServer(event.clientX, event.clientY);
		});
	    console.log("Requesting coordinates");
		clearInterval(self);
	}
}

// Gets the most specific element at target location
function getViewedElement(x, y) {
	var currentElem = document.elementFromPoint(x, y);

	// This block is only useful for the highlighting, will be removed eventually
    if (pastElem) {
        if (pastElem == currentElem) {
            return;
        }
        pastElem.style.border = origBorder;
        pastElem = null;
    }
    
    if (currentElem && currentElem.tagName.toLowerCase() != "body" && currentElem.tagName.toLowerCase() != "html") {
        pastElem = currentElem;
        origBorder = currentElem.style.border;
        //currentElem.style.border = "2px solid red"; // draws selection border
        checkForTargetChange(currentElem);
    }
}

// Checks if viewed pixel is a new element of interest (file/code, comments, etc), logs if it is
function checkForTargetChange(viewed) {
	var toPrint = "Untracked";
	var targettedIdentifier = null;
	var targettedElement = null;

	// Check each target key to see if currently viewed element is a child of it
	for(var identifier of Object.keys(targets)) {
		var found = $(viewed).closest(identifier);
		// If the viewed element has a target parent
		if(found.length) {
			targettedIdentifier = identifier;
			targettedElement = found;
			break;
		}
	}
	
	if(lastTarget && targettedElement) { // Past and current element are targets
		if(!(lastTarget.is(targettedElement))) { // New target, report change (eventually a different function probably)
			handleGazeEvent(targettedElement, targettedIdentifier);
		} 
	} else if (lastTarget || targettedElement) { // Only one is/was is a target, definitely changed
		handleGazeEvent(targettedElement, targettedIdentifier);
	} // else null and null, no change
};

// How to lable the target. Null is untracked, some elements have single lable, some have variable labels
function getTargetDescription(key, elem) {
	if(key == null) {
		return "Untracked";
	}
	switch(key) {
		case "div.file": // There can be multiple file divs in a commit, check which file
			return "File: " + $(elem).find("div.file-header > div.file-info > a").attr("title");
		default: // Used assigned label mapping in targets global
			return targets[key];
	}
}

// GET request, current gets x and y coordinate. Will include more details (e.g. timestamp) in the future
function getNewCoordFromServer() {
	var xhr = new XMLHttpRequest();
	xhr.onreadystatechange = function(event) {
		if (xhr.readyState == 4 && xhr.status == 200) {
	        var response = JSON.parse(xhr.responseText);
	        getViewedElement(response.x, response.y);
	    }
	};
	xhr.open('GET', "https://localhost:4321/coordinate", true);
	xhr.send();
}

// Substitute for data being sent from eyetracker, sends cursor position to server
function postCoordToServer(xPos, yPos) {
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.open("POST", "https://localhost:4321/coordinate");
	xmlhttp.setRequestHeader("Content-Type", "application/json");
	xmlhttp.send(JSON.stringify({x:xPos, y:yPos}));
}

function postDataToServer(data) {
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.open("POST", "https://localhost:4321/data");
	xmlhttp.setRequestHeader("Content-Type", "application/json");
	xmlhttp.send(JSON.stringify(data));
}

function makeInteractionObject(type, target, start, end) {
	var obj = {};
	obj['Type'] = type;
	obj['Target'] = target;
	obj['Start'] = start;
	obj['End'] = end;
	obj['Duration'] = end - start;
	return obj;
}

function handleGazeEvent(newElement, newIdentifier) {
	var descrption = getTargetDescription(lastIdentifier, lastTarget);
	var timestamp = Date.now();
	var obj = makeInteractionObject('Gaze', descrption, gazeStart, timestamp);
	console.log(JSON.stringify(obj));
	postDataToServer(obj);
	lastTarget = newElement;
	lastIdentifier = newIdentifier;
	gazeStart = timestamp;
}